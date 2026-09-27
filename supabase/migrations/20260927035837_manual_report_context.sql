-- Store occurrence time separately from the audit/publication timestamp.
alter table private.report_contributions
  add column location_source text not null default 'device' check (location_source in ('device','manual')),
  add column occurred_at timestamptz,
  add column minutes_ago smallint check (minutes_ago between 0 and 180 and minutes_ago % 15 = 0);

do $$ declare kind text; begin
  for kind in select r.kind from private.report_event_rules r loop
    execute format('alter table public.%I add column location_source text not null default ''device'' check (location_source in (''device'',''manual'')), add column occurred_at timestamptz', kind||'_reports');
  end loop;
end $$;

-- Manual reports are independent observations; never join a current GPS event
-- using a historical timestamp. Private definer + public invoker keep ownership
-- checks and the existing report-write RLS intact.
create function private.prepare_manual_report_event(
  p_kind text, p_report_id uuid, p_event_id uuid,
  p_latitude double precision, p_longitude double precision,
  p_accuracy double precision, p_occurred_at timestamptz, p_minutes_ago integer default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare c private.report_contributions%rowtype; event uuid; observed timestamptz;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_report_id is null or not exists(select 1 from private.report_event_rules where kind=p_kind)
    or p_latitude is null or p_latitude not between -90 and 90
    or p_longitude is null or p_longitude not between -180 and 180
    or p_event_id is not null or p_accuracy is not null
    or p_occurred_at is null or not isfinite(p_occurred_at)
    or (p_minutes_ago is not null and (p_minutes_ago not between 0 and 180 or p_minutes_ago % 15 <> 0))
    or (p_minutes_ago is null and p_occurred_at > now()) then
    raise exception 'Invalid manual context' using errcode='22023';
  end if;
  -- Relative selection is resolved using server time, including the exact 3 h endpoint.
  observed := case when p_minutes_ago is null then p_occurred_at else now()-make_interval(mins=>p_minutes_ago) end;
  perform pg_advisory_xact_lock(hashtextextended(p_report_id::text,0));
  select * into c from private.report_contributions where kind=p_kind and report_id=p_report_id for update;
  if found then
    if c.reporter_id<>auth.uid() then raise exception 'Not your contribution' using errcode='42501'; end if;
    if c.published then
      if c.location_source <> 'manual' or (p_minutes_ago is null and c.occurred_at is distinct from p_occurred_at)
        or (p_minutes_ago is not null and c.minutes_ago is distinct from p_minutes_ago)
        or c.latitude is distinct from p_latitude or c.longitude is distinct from p_longitude then
        raise exception 'Published context is immutable' using errcode='22023';
      end if;
      return private.report_event_root(c.event_id);
    end if;
    if observed < now()-interval '3 hours' then raise exception 'Event is older than 3 hours' using errcode='22023'; end if;
    -- A retry may correct an unpublished selection. It must get its own event.
    if c.location_source = 'manual' then event := c.event_id;
    else insert into private.report_events(kind) values(p_kind) returning id into event; end if;
    update private.report_contributions set event_id=event,latitude=p_latitude,longitude=p_longitude,
      accuracy=null,location_source='manual',occurred_at=observed,minutes_ago=p_minutes_ago
      where kind=p_kind and report_id=p_report_id;
    return event;
  end if;
  if observed < now()-interval '3 hours' then raise exception 'Event is older than 3 hours' using errcode='22023'; end if;
  insert into private.report_events(kind) values(p_kind) returning id into event;
  insert into private.report_contributions(kind,report_id,event_id,reporter_id,latitude,longitude,accuracy,location_source,occurred_at,minutes_ago)
    values(p_kind,p_report_id,event,auth.uid(),p_latitude,p_longitude,null,'manual',observed,p_minutes_ago);
  return event;
end;
$$;
create function public.prepare_manual_report_event(
  p_kind text, p_report_id uuid, p_event_id uuid,
  p_latitude double precision, p_longitude double precision,
  p_accuracy double precision, p_occurred_at timestamptz, p_minutes_ago integer default null
) returns uuid language sql security invoker set search_path='' as $$
  select private.prepare_manual_report_event(p_kind,p_report_id,p_event_id,p_latitude,p_longitude,p_accuracy,p_occurred_at,p_minutes_ago);
$$;
revoke all on function private.prepare_manual_report_event(text,uuid,uuid,double precision,double precision,double precision,timestamptz,integer),
  public.prepare_manual_report_event(text,uuid,uuid,double precision,double precision,double precision,timestamptz,integer) from public,anon,authenticated;
grant execute on function private.prepare_manual_report_event(text,uuid,uuid,double precision,double precision,double precision,timestamptz,integer),
  public.prepare_manual_report_event(text,uuid,uuid,double precision,double precision,double precision,timestamptz,integer) to authenticated;

create function private.apply_report_context() returns trigger
language plpgsql security definer set search_path='' as $$
declare c private.report_contributions%rowtype;
begin
  select * into c from private.report_contributions where kind=tg_argv[0] and report_id=new.id;
  if found and c.location_source='manual' then
    if c.reporter_id <> new.reporter_id then raise exception 'Contribution owner mismatch' using errcode='42501'; end if;
    if new.latitude is distinct from c.latitude or new.longitude is distinct from c.longitude then
      raise exception 'Manual location mismatch' using errcode='22023';
    end if;
    new.location_source := 'manual';
    new.occurred_at := c.occurred_at;
    if tg_op='INSERT' then
      if c.minutes_ago is not null then
        new.occurred_at := now()-make_interval(mins=>c.minutes_ago);
        update private.report_contributions set occurred_at=new.occurred_at where kind=tg_argv[0] and report_id=new.id;
      elsif c.occurred_at < now()-interval '3 hours' then
        raise exception 'Event is older than 3 hours' using errcode='22023';
      end if;
    end if;
    new.location_accuracy_m := null;
  end if;
  return new;
end;
$$;
revoke all on function private.apply_report_context() from public,anon,authenticated;
do $$ declare kind text; begin
  for kind in select r.kind from private.report_event_rules r loop
    execute format('create trigger apply_report_context before insert or update on public.%I for each row execute function private.apply_report_context(%L)',kind||'_reports',kind);
  end loop;
end $$;

alter table public.gunfire_reports drop constraint gunfire_precise_listening_location;
alter table public.gunfire_reports add constraint gunfire_precise_listening_location check (
  latitude is not null and longitude is not null and
  ((location_source='manual' and occurred_at is not null and location_accuracy_m is null)
   or (location_accuracy_m is not null and location_accuracy_m <= 30))
);
alter table public.breakdown_reports drop constraint breakdown_precise_location;
alter table public.breakdown_reports add constraint breakdown_precise_location check (
  latitude is not null and longitude is not null and
  ((location_source='manual' and occurred_at is not null and location_accuracy_m is null)
   or (location_accuracy_m is not null and location_accuracy_m <= 30))
);

-- Existing feeds/analytics use contribution.created_at as observation time.
-- Report table created_at remains the unmodified publication audit timestamp.
do $$ declare definition text; kind text; begin
  definition := pg_get_functiondef('private.sync_report_event()'::regprocedure);
  definition := replace(definition, '''created_at'',new.created_at',
    '''occurred_at'',new.occurred_at,''location_source'',new.location_source,''created_at'',coalesce(new.occurred_at,new.created_at)');
  definition := replace(definition, 'new.location_accuracy_m,new.created_at,true',
    'new.location_accuracy_m,coalesce(new.occurred_at,new.created_at),true');
  execute definition;
  for kind in select r.kind from private.report_event_rules r loop
    definition := pg_get_functiondef((case when kind='accident' then 'private.read_accident(uuid)' else format('private.read_%s_report(uuid)',kind) end)::regprocedure);
    definition := replace(definition, '''created_at'', report.created_at',
      '''occurred_at'', report.occurred_at, ''location_source'', report.location_source, ''created_at'', report.created_at');
    execute definition;
  end loop;
end $$;
