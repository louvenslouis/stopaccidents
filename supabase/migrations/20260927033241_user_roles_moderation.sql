-- Absence from the privileged-role table means a normal user, including guests.
alter table private.report_event_moderators add column role text not null default 'moderator' check (role in ('moderator','admin'));
create function private.current_app_role() returns text
language sql stable security definer set search_path='' as $$
 select coalesce((select m.role from private.report_event_moderators m join auth.users u on u.id=m.user_id
 where m.user_id=auth.uid() and coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)=false),'user');
$$;
create function public.read_my_role() returns text language sql stable security invoker set search_path='' as $$ select private.current_app_role(); $$;

create table private.role_changes (
 id uuid primary key default gen_random_uuid(), actor_id uuid references auth.users(id) on delete set null,
 user_id uuid references auth.users(id) on delete set null, role text not null, created_at timestamptz not null default now()
);
alter table private.role_changes enable row level security;
revoke all on private.role_changes from public,anon,authenticated;
create function private.set_user_role(p_user_id uuid,p_role text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('app-role-management',0));
 if auth.uid() is null or private.current_app_role()<>'admin' then raise exception 'Administrator required' using errcode='42501'; end if;
 if p_role is null or p_role not in ('user','moderator','admin') then raise exception 'Invalid role' using errcode='22023'; end if;
 if not exists(select 1 from auth.users u where id=p_user_id and (p_role='user' or not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false))) then raise exception 'Registered account required' using errcode='22023'; end if;
 if p_role<>'admin' and exists(select 1 from private.report_event_moderators where user_id=p_user_id and role='admin')
 and (select count(*) from private.report_event_moderators where role='admin')<=1 then raise exception 'Last administrator' using errcode='22023'; end if;
 if p_role='user' then delete from private.report_event_moderators where user_id=p_user_id;
 else insert into private.report_event_moderators(user_id,role) values(p_user_id,p_role) on conflict(user_id) do update set role=excluded.role; end if;
 insert into private.role_changes(actor_id,user_id,role) values(auth.uid(),p_user_id,p_role);
end; $$;
create function public.set_user_role(p_user_id uuid,p_role text) returns void language sql security invoker set search_path='' as $$ select private.set_user_role(p_user_id,p_role); $$;

create table private.publication_moderation (
 kind text not null, report_id uuid not null, suspended boolean not null default false,
 reason text not null check(char_length(trim(reason)) between 3 and 500),
 actor_id uuid references auth.users(id) on delete set null, updated_at timestamptz not null default now(),
 primary key(kind,report_id), foreign key(kind,report_id) references private.report_contributions(kind,report_id) on delete cascade
);
create table private.publication_moderation_history (
 id uuid primary key default gen_random_uuid(), kind text not null, report_id uuid not null,
 suspended boolean not null, reason text not null, actor_id uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now()
);
alter table private.publication_moderation enable row level security;
alter table private.publication_moderation_history enable row level security;
revoke all on private.publication_moderation,private.publication_moderation_history from public,anon,authenticated;
create function private.publication_visible(p_kind text,p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.publication_moderation where kind=p_kind and report_id=p_id and suspended);
$$;
-- Even a later author edit cannot republish a suspended contribution.
create function private.enforce_publication_visibility() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not private.publication_visible(new.kind,new.report_id) then new.published:=false; end if;
 return new;
end; $$;
create trigger publication_visibility before insert or update on private.report_contributions for each row execute function private.enforce_publication_visibility();
create function private.moderate_publication(p_kind text,p_report_id uuid,p_suspended boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or private.current_app_role() not in ('moderator','admin') then raise exception 'Moderator required' using errcode='42501'; end if;
 if p_suspended is null or p_reason is null or char_length(trim(p_reason)) not between 3 and 500 then raise exception 'Reason required' using errcode='22023'; end if;
 perform 1 from private.report_contributions where kind=p_kind and report_id=p_report_id for update;
 if not found then raise exception 'Unknown publication' using errcode='22023'; end if;
 insert into private.publication_moderation(kind,report_id,suspended,reason,actor_id) values(p_kind,p_report_id,p_suspended,trim(p_reason),auth.uid())
 on conflict(kind,report_id) do update set suspended=excluded.suspended,reason=excluded.reason,actor_id=excluded.actor_id,updated_at=now();
 update private.report_contributions set published=not p_suspended where kind=p_kind and report_id=p_report_id;
 insert into private.publication_moderation_history(kind,report_id,suspended,reason,actor_id) values(p_kind,p_report_id,p_suspended,trim(p_reason),auth.uid());
end; $$;
create function public.moderate_publication(p_kind text,p_report_id uuid,p_suspended boolean,p_reason text) returns void language sql security invoker set search_path='' as $$ select private.moderate_publication(p_kind,p_report_id,p_suspended,p_reason); $$;
create function private.read_suspended_publications() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or private.current_app_role() not in ('moderator','admin') then raise exception 'Moderator required' using errcode='42501'; end if;
 return (select coalesce(jsonb_agg(c.summary||jsonb_build_object('reason',m.reason) order by m.updated_at desc),'[]'::jsonb) from private.publication_moderation m join private.report_contributions c using(kind,report_id) where m.suspended);
end; $$;
create function public.read_suspended_publications() returns jsonb language sql stable security invoker set search_path='' as $$ select private.read_suspended_publications(); $$;

revoke all on function private.current_app_role(),public.read_my_role(),private.publication_visible(text,uuid),private.enforce_publication_visibility() from public,anon,authenticated;
grant execute on function private.current_app_role(),public.read_my_role() to anon,authenticated;
revoke all on function private.set_user_role(uuid,text),public.set_user_role(uuid,text),private.moderate_publication(text,uuid,boolean,text),public.moderate_publication(text,uuid,boolean,text),private.read_suspended_publications(),public.read_suspended_publications() from public,anon,authenticated;
grant execute on function private.set_user_role(uuid,text),public.set_user_role(uuid,text),private.moderate_publication(text,uuid,boolean,text),public.moderate_publication(text,uuid,boolean,text),private.read_suspended_publications(),public.read_suspended_publications() to authenticated;

create or replace function private.read_accident(p_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  report public.accident_reports%rowtype;
  viewer_id uuid := auth.uid();
  is_owner boolean;
  result jsonb;
begin
  if p_id is null then
    select * into report from public.accident_reports where private.publication_visible('accident',id) order by created_at desc, id desc limit 1;
  else
    select * into report from public.accident_reports where id = p_id and private.publication_visible('accident',id);
  end if;
  if not found then return null; end if;
  is_owner := viewer_id is not null and report.reporter_id = viewer_id;
  result := jsonb_build_object(
    'id', report.id, 'location_description', report.location_description,
    'latitude', report.latitude, 'longitude', report.longitude,
    'accident_type', report.accident_type, 'severity', report.severity,
    'created_at', report.created_at, 'completed_step', report.completed_step
  );
  if p_id is null then return result; end if;
  return result || jsonb_build_object(
    'location_accuracy_m', report.location_accuracy_m, 'notes', report.notes,
    'status', report.status, 'updated_at', report.updated_at,
    'is_owner', is_owner,
    'identifiers', case when is_owner then (
      select coalesce(jsonb_agg(jsonb_build_object('kind', i.kind, 'value', i.value) order by i.kind, i.value), '[]'::jsonb)
      from public.accident_report_identifiers i where i.report_id = report.id
    ) else '[]'::jsonb end,
    'photos', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'storage_path', p.storage_path, 'captured_at', p.captured_at) order by p.captured_at, p.id), '[]'::jsonb)
      from public.accident_report_photos p where p.report_id = report.id
    )
  );
end;
$$;

create or replace function private.read_kidnapping_report(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  report public.kidnapping_reports%rowtype;
  is_owner boolean;
  result jsonb;
begin
  select * into report from public.kidnapping_reports where id = p_id and private.publication_visible('kidnapping',id);
  if not found then return null; end if;

  is_owner := auth.uid() is not null and report.reporter_id = auth.uid();
  result := jsonb_build_object(
    'id', report.id,
    'report_kind', 'kidnapping',
    'location_description', report.location_description,
    'latitude', report.latitude,
    'longitude', report.longitude,
    'accident_type', null,
    'severity', null,
    'created_at', report.created_at,
    'completed_step', report.completed_step,
    'location_accuracy_m', report.location_accuracy_m,
    'status', report.status,
    'updated_at', report.updated_at,
    'is_owner', is_owner
  );

  if is_owner then
    result := result || jsonb_build_object(
      'vehicle_clues', report.vehicle_clues,
      'direction_taken', report.direction_taken,
      'abducted_person_clues', report.abducted_person_clues
    );
  end if;
  return result;
end;
$$;

create or replace function private.read_barricade_report(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  report public.barricade_reports%rowtype;
  is_owner boolean;
  result jsonb;
begin
  select * into report from public.barricade_reports where id = p_id and private.publication_visible('barricade',id);
  if not found then return null; end if;

  is_owner := auth.uid() is not null and report.reporter_id = auth.uid();
  result := jsonb_build_object(
    'id', report.id,
    'report_kind', 'barricade',
    'location_description', report.location_description,
    'latitude', report.latitude,
    'longitude', report.longitude,
    'accident_type', null,
    'severity', null,
    'created_at', report.created_at,
    'completed_step', report.completed_step,
    'location_accuracy_m', report.location_accuracy_m,
    'status', report.status,
    'updated_at', report.updated_at,
    'is_owner', is_owner
  );

    result := result || jsonb_build_object(
      'obstacles', report.obstacles,
      'passage', report.passage,
      'details', report.details
    );
  return result;
end;
$$;

create or replace function private.read_armed_presence_report(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  report public.armed_presence_reports%rowtype;
  is_owner boolean;
  result jsonb;
begin
  select * into report from public.armed_presence_reports where id = p_id and private.publication_visible('armed_presence',id);
  if not found then return null; end if;

  is_owner := auth.uid() is not null and report.reporter_id = auth.uid();
  result := jsonb_build_object(
    'id', report.id,
    'report_kind', 'armed_presence',
    'location_description', report.location_description,
    'latitude', report.latitude,
    'longitude', report.longitude,
    'accident_type', null,
    'severity', null,
    'created_at', report.created_at,
    'completed_step', report.completed_step,
    'location_accuracy_m', report.location_accuracy_m,
    'status', report.status,
    'updated_at', report.updated_at,
    'is_owner', is_owner
  );

    result := result || jsonb_build_object(
      'presence', report.presence,
      'activity', report.activity,
      'details', report.details
    );
  return result;
end;
$$;

create or replace function private.read_suspicious_vehicle_report(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  report public.suspicious_vehicle_reports%rowtype;
  is_owner boolean;
  result jsonb;
begin
  select * into report from public.suspicious_vehicle_reports where id = p_id and private.publication_visible('suspicious_vehicle',id);
  if not found then return null; end if;

  is_owner := auth.uid() is not null and report.reporter_id = auth.uid();
  result := jsonb_build_object(
    'id', report.id,
    'report_kind', 'suspicious_vehicle',
    'location_description', report.location_description,
    'latitude', report.latitude,
    'longitude', report.longitude,
    'accident_type', null,
    'severity', null,
    'created_at', report.created_at,
    'completed_step', report.completed_step,
    'location_accuracy_m', report.location_accuracy_m,
    'status', report.status,
    'updated_at', report.updated_at,
    'is_owner', is_owner
  );

    result := result || jsonb_build_object(
      'vehicle_description', report.vehicle_description,
      'observed_behavior', report.observed_behavior,
      'details', report.details
    );
  return result || jsonb_build_object('photos', (select coalesce(jsonb_agg(jsonb_build_object('storage_path', p.storage_path, 'captured_at', p.captured_at)), '[]'::jsonb) from public.suspicious_vehicle_report_photos p where p.report_id = report.id));
end;
$$;

create or replace function private.read_gunfire_report(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  report public.gunfire_reports%rowtype;
  is_owner boolean;
  result jsonb;
begin
  select * into report from public.gunfire_reports where id = p_id and private.publication_visible('gunfire',id);
  if not found then return null; end if;

  is_owner := auth.uid() is not null and report.reporter_id = auth.uid();
  result := jsonb_build_object(
    'id', report.id,
    'report_kind', 'gunfire',
    'location_description', report.location_description,
    'latitude', report.latitude,
    'longitude', report.longitude,
    'accident_type', null,
    'severity', null,
    'created_at', report.created_at,
    'completed_step', report.completed_step,
    'location_accuracy_m', report.location_accuracy_m,
    'status', report.status,
    'updated_at', report.updated_at,
    'is_owner', is_owner
  );

    result := result || jsonb_build_object(
      'shot_count', report.shot_count,
      'proximity', report.proximity,
      'cadence', report.cadence,
      'details', report.details
    );
  return result;
end;
$$;

create or replace function private.read_breakdown_report(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  report public.breakdown_reports%rowtype;
begin
  select * into report from public.breakdown_reports where id = p_id and private.publication_visible('breakdown',id);
  if not found then return null; end if;

  return jsonb_build_object(
    'id', report.id,
    'report_kind', 'breakdown',
    'location_description', report.location_description,
    'latitude', report.latitude,
    'longitude', report.longitude,
    'accident_type', null,
    'severity', null,
    'created_at', report.created_at,
    'completed_step', report.completed_step,
    'location_accuracy_m', report.location_accuracy_m,
    'status', report.status,
    'updated_at', report.updated_at,
    'breakdown_position', report.breakdown_position,
    'vehicle_type', report.vehicle_type,
    'traffic_impact', report.traffic_impact,
    'details', report.details
  );
end;
$$;

create or replace function private.read_map_accidents()
returns jsonb language sql stable security definer set search_path = '' as $$
  with candidates as materialized (
    select id, location_description, latitude, longitude,
      accident_type, severity, created_at, completed_step
    from public.accident_reports
    where private.publication_visible('accident',id) and latitude between 18.0 and 20.1 and longitude between -74.55 and -71.6
    order by created_at desc, id desc
    limit 501
  ), visible as (
    select * from candidates order by created_at desc, id desc limit 500
  )
  select jsonb_build_object(
    'reports', coalesce((select jsonb_agg(to_jsonb(v) order by v.created_at desc, v.id desc) from visible v), '[]'::jsonb),
    'truncated', (select count(*) > 500 from candidates)
  );
$$;

create or replace function private.is_shared_accident_photo(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.accident_report_photos where storage_path=p_path and private.publication_visible('accident',report_id));
$$;

create or replace function private.is_shared_vehicle_photo(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.suspicious_vehicle_report_photos where storage_path=p_path and private.publication_visible('suspicious_vehicle',report_id));
$$;

create or replace function private.read_report_event(p_kind text,p_report_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare event uuid; moderator boolean;
begin
 select private.report_event_root(event_id) into event from private.report_contributions where kind=p_kind and report_id=p_report_id and published;
 if event is null then return null; end if;
 moderator := (private.current_app_role() in ('moderator','admin'));
 return jsonb_build_object('event_id',event,'is_moderator',moderator,
 'summary',(select s from private.event_summaries() s where (s->>'event_id')::uuid=event),
 'contributions',(select coalesce(jsonb_agg(c.summary order by c.created_at desc,c.report_id),'[]'::jsonb)
 from private.report_contributions c where c.published and private.report_event_root(c.event_id)=event),
 'merges',case when moderator then (select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'reason',m.reason,'created_at',m.created_at)),'[]'::jsonb)
 from private.report_event_merges m where undone_at is null and private.report_event_root(m.target_id)=event) else '[]'::jsonb end);
end;
$$;

create or replace function private.merge_report_events(p_source uuid,p_target uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare source uuid; target uuid; merge uuid;
begin
 if auth.uid() is null or not (private.current_app_role() in ('moderator','admin')) then
 raise exception 'Moderator required' using errcode='42501'; end if;
 if p_reason is null or char_length(trim(p_reason)) not between 3 and 500 then raise exception 'Reason required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('report-event-merges',0));
 source:=private.report_event_root(p_source); target:=private.report_event_root(p_target);
 if source is null or target is null then raise exception 'Unknown event'; end if;
 if source=target then return null; end if;
 if (select kind from private.report_events where id=source)<>(select kind from private.report_events where id=target) then raise exception 'Different categories'; end if;
 update private.report_events set merged_into=target where id=source;
 insert into private.report_event_merges(source_id,target_id,moderator_id,reason) values(source,target,auth.uid(),trim(p_reason)) returning id into merge;
 return merge;
end;
$$;

create or replace function private.undo_report_event_merge(p_merge_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare m private.report_event_merges%rowtype;
begin
 if auth.uid() is null or not (private.current_app_role() in ('moderator','admin')) then raise exception 'Moderator required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('report-event-merges',0));
 select * into m from private.report_event_merges where id=p_merge_id for update;
 if not found then raise exception 'Unknown merge'; end if;
 if m.undone_at is not null then return; end if;
 update private.report_events set merged_into=null where id=m.source_id;
 update private.report_event_merges set undone_at=now(),undone_by=auth.uid() where id=m.id;
end;
$$;
