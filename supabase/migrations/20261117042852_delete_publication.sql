-- Keep the deleted identity and its Storage folder so a delayed mobile save cannot recreate it.
create table private.deleted_publications (
  kind text not null references private.report_event_rules(kind),
  report_id uuid not null,
  photo_bucket text not null,
  photo_folder text not null,
  primary key (kind, report_id)
);
create unique index deleted_publications_photo_folder on private.deleted_publications(photo_bucket,photo_folder);
alter table private.deleted_publications enable row level security;
revoke all on private.deleted_publications from public, anon, authenticated;

create function private.reject_deleted_publication() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from private.deleted_publications d where d.kind=new.kind and d.report_id=new.report_id) then
    raise exception 'Publication permanently deleted' using errcode='22023';
  end if;
  return new;
end;
$$;
revoke all on function private.reject_deleted_publication() from public, anon, authenticated;
create trigger reject_deleted_publication before insert on private.report_contributions
for each row execute function private.reject_deleted_publication();

create function private.delete_publication(p_kind text,p_report_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  witness uuid;
  event uuid;
  family uuid[];
  bucket text;
  folder text;
begin
  if auth.uid() is null or private.current_app_role() not in ('moderator','admin') then
    raise exception 'Moderator required' using errcode='42501';
  end if;
  if p_report_id is null or not exists(select 1 from private.report_event_rules where kind=p_kind) then
    raise exception 'Invalid publication' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_report_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('report-event-merges',0));
  if exists(select 1 from private.deleted_publications where kind=p_kind and report_id=p_report_id) then return; end if;

  execute format('select reporter_id from public.%I where id=$1 for update',p_kind||'_reports')
    into witness using p_report_id;
  if witness is null then raise exception 'Unknown publication' using errcode='22023'; end if;
  select c.event_id into strict event from private.report_contributions c
    where c.kind=p_kind and c.report_id=p_report_id for update;
  with recursive members(id) as (
    select private.report_event_root(event)
    union all select e.id from private.report_events e join members m on e.merged_into=m.id
  ) select array_agg(id) into family from members;

  bucket := case p_kind when 'accident' then 'accident-photos' when 'suspicious_vehicle' then 'suspicious-vehicle-photos' else 'report-photos' end;
  folder := witness::text||'/'||case when bucket='report-photos' then p_kind||'/' else '' end||p_report_id::text||'/';
  insert into private.deleted_publications(kind,report_id,photo_bucket,photo_folder)
    values(p_kind,p_report_id,bucket,folder);
  execute format('delete from public.%I where id=$1',p_kind||'_reports') using p_report_id;
  -- The source trigger removes the contribution and its cascading photo/flag/identifier rows.
  delete from public.report_rewards where report_kind=p_kind and report_id=p_report_id;
  delete from private.publication_moderation_history where kind=p_kind and report_id=p_report_id;

  if not exists(select 1 from private.report_contributions where event_id=any(family)) then
    delete from private.route_alerts where event_id=any(family);
    delete from private.safety_alerts where event_id=any(family);
    delete from private.report_event_merges where source_id=any(family) or target_id=any(family);
    delete from private.report_events where id=any(family);
  end if;
end;
$$;
create function public.delete_publication(p_kind text,p_report_id uuid) returns void
language sql security invoker set search_path='' as $$ select private.delete_publication(p_kind,p_report_id); $$;
revoke all on function private.delete_publication(text,uuid), public.delete_publication(text,uuid) from public,anon,authenticated;
grant execute on function private.delete_publication(text,uuid), public.delete_publication(text,uuid) to authenticated;

-- Query live objects in deleted folders, including orphan uploads and late mobile retries.
-- Storage owns object removal. Once removed, a path stops appearing in the next batch.
create function private.pending_report_photo_deletions() returns table(bucket_id text,name text)
language sql stable security definer set search_path='' as $$
  select o.bucket_id,o.name
  from storage.objects o join private.deleted_publications d
    on d.photo_bucket=o.bucket_id and d.photo_folder=case
      when o.bucket_id='report-photos' then array_to_string((string_to_array(o.name,'/'))[1:3],'/')||'/'
      else array_to_string((string_to_array(o.name,'/'))[1:2],'/')||'/'
    end
  where o.bucket_id in ('accident-photos','suspicious-vehicle-photos','report-photos')
  order by o.bucket_id,o.name limit 100;
$$;
create function public.pending_report_photo_deletions() returns table(bucket_id text,name text)
language sql security invoker set search_path='' as $$ select * from private.pending_report_photo_deletions(); $$;
revoke all on function public.pending_report_photo_deletions(), private.pending_report_photo_deletions() from public,anon,authenticated;
do $$ begin
  if exists(select 1 from pg_roles where rolname='service_role') then
    grant execute on function public.pending_report_photo_deletions(), private.pending_report_photo_deletions() to service_role;
  end if;
end $$;
