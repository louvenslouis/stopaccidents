-- Explicit follow-up observations inherit the source location, never a claimed GPS fix.
create function private.prepare_report_testimony(p_kind text, p_report_id uuid, p_source_report_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare source private.report_contributions%rowtype; existing private.report_contributions%rowtype; event uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_report_id is null or p_report_id = p_source_report_id then raise exception 'New report required' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_report_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('report-event-merges',0));
  select * into source from private.report_contributions
    where kind=p_kind and report_id=p_source_report_id and published and status <> 'closed'
      and private.publication_visible(kind,report_id);
  if not found or source.latitude is null or source.longitude is null then
    raise exception 'Source unavailable' using errcode='22023';
  end if;
  event := private.report_event_root(source.event_id);
  select * into existing from private.report_contributions where kind=p_kind and report_id=p_report_id;
  if found then
    if existing.reporter_id <> auth.uid() then raise exception 'Not your contribution' using errcode='42501'; end if;
    if private.report_event_root(existing.event_id) <> event then raise exception 'Event mismatch' using errcode='22023'; end if;
    return event;
  end if;
  insert into private.report_contributions(kind,report_id,event_id,reporter_id,latitude,longitude,accuracy,location_source,occurred_at,minutes_ago)
    values(p_kind,p_report_id,event,auth.uid(),source.latitude,source.longitude,null,'manual',now(),0);
  return event;
end;
$$;
create function public.prepare_report_testimony(p_kind text,p_report_id uuid,p_source_report_id uuid)
returns uuid language sql security invoker set search_path='' as $$
  select private.prepare_report_testimony(p_kind,p_report_id,p_source_report_id);
$$;

create table private.publication_flags (
  kind text not null, report_id uuid not null,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check(char_length(trim(reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  primary key(kind,report_id,reporter_id),
  foreign key(kind,report_id) references private.report_contributions(kind,report_id) on delete cascade
);
alter table private.publication_flags enable row level security;
revoke all on private.publication_flags from public,anon,authenticated;
create function private.flag_publication(p_kind text,p_report_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_reason is null or char_length(trim(p_reason)) not between 3 and 500 then raise exception 'Reason required' using errcode='22023'; end if;
  if not exists(select 1 from private.report_contributions where kind=p_kind and report_id=p_report_id and published
    and private.publication_visible(kind,report_id)) then raise exception 'Publication unavailable' using errcode='22023'; end if;
  insert into private.publication_flags(kind,report_id,reporter_id,reason) values(p_kind,p_report_id,auth.uid(),trim(p_reason))
    on conflict(kind,report_id,reporter_id) do update set reason=excluded.reason;
end;
$$;
create function public.flag_publication(p_kind text,p_report_id uuid,p_reason text)
returns void language sql security invoker set search_path='' as $$
  select private.flag_publication(p_kind,p_report_id,p_reason);
$$;
revoke all on function private.prepare_report_testimony(text,uuid,uuid),public.prepare_report_testimony(text,uuid,uuid),
  private.flag_publication(text,uuid,text),public.flag_publication(text,uuid,text) from public,anon,authenticated;
grant execute on function private.prepare_report_testimony(text,uuid,uuid),public.prepare_report_testimony(text,uuid,uuid),
  private.flag_publication(text,uuid,text),public.flag_publication(text,uuid,text) to authenticated;
