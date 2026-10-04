create table public.gathering_reports (
  id uuid primary key,
  reporter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  location_description text not null default '' check (char_length(location_description) <= 500),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  location_accuracy_m double precision check (location_accuracy_m >= 0 and location_accuracy_m < 'Infinity'::float8),
  gathering_type text not null default '' check (gathering_type in ('', 'demonstration', 'march', 'other')),
  gathering_state text not null default '' check (gathering_state in ('', 'stationary', 'moving', 'dispersed', 'unknown')),
  traffic_impact text not null default '' check (traffic_impact in ('', 'normal', 'slowed', 'blocked', 'unknown')),
  details text not null default '' check (char_length(details) <= 2000),
  status text not null default 'received' check (status in ('received', 'reviewing', 'closed')),
  completed_step smallint not null default 1 check (completed_step between 1 and 4),
  location_source text not null default 'device' check (location_source in ('device','manual')),
  occurred_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gathering_precise_location check (
    latitude is not null and longitude is not null and
    ((location_source = 'manual' and occurred_at is not null and location_accuracy_m is null)
      or (location_accuracy_m is not null and location_accuracy_m <= 30))
  ),
  constraint gathering_location_required check (
    char_length(trim(location_description)) >= 3 or latitude is not null
  ),
  constraint gathering_coordinate_pair check ((latitude is null) = (longitude is null)),
  constraint gathering_accuracy_requires_coordinates check (latitude is not null or location_accuracy_m is null),
  constraint gathering_type_after_step_two check (completed_step < 2 or gathering_type <> ''),
  constraint gathering_state_after_step_three check (completed_step < 3 or gathering_state <> ''),
  constraint gathering_traffic_after_step_four check (completed_step < 4 or traffic_impact <> '')
);

create index gathering_reports_reporter_idx
  on public.gathering_reports(reporter_id, created_at desc);
create index gathering_reports_triage_idx
  on public.gathering_reports(status, created_at desc);

alter table public.gathering_reports enable row level security;
revoke all on public.gathering_reports from public, anon, authenticated;
grant select on public.gathering_reports to authenticated;
grant insert (
  id, location_description, latitude, longitude, location_accuracy_m,
  gathering_type, gathering_state, traffic_impact, details, completed_step
) on public.gathering_reports to authenticated;
grant update (
  location_description, latitude, longitude, location_accuracy_m,
  gathering_type, gathering_state, traffic_impact, details,
  completed_step, updated_at
) on public.gathering_reports to authenticated;

create policy gathering_reports_read_own
  on public.gathering_reports for select to authenticated
  using (reporter_id = (select auth.uid()));
create policy gathering_reports_insert_own
  on public.gathering_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));
create policy gathering_reports_update_own
  on public.gathering_reports for update to authenticated
  using (reporter_id = (select auth.uid()))
  with check (reporter_id = (select auth.uid()));

create function public.save_gathering_report_step(
  p_id uuid,
  p_step integer,
  p_location text default '',
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy double precision default null,
  p_gathering_type text default null,
  p_gathering_state text default null,
  p_traffic_impact text default null,
  p_details text default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous public.gathering_reports%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_id is null or p_step is null or p_step not between 1 and 4 then
    raise exception 'Invalid step' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into previous
    from public.gathering_reports
    where id = p_id
    for update;

  if not found then
    if p_step <> 1 then
      raise exception 'Save the location first';
    end if;
    insert into public.gathering_reports(
      id, location_description, latitude, longitude, location_accuracy_m,
      completed_step
    ) values (
      p_id, trim(p_location), p_latitude, p_longitude, p_accuracy, 1
    );
    return p_id;
  end if;

  if p_step > previous.completed_step + 1 then
    raise exception 'Save the previous step first';
  end if;

  if p_step = 1 then
    update public.gathering_reports
      set location_description = trim(p_location),
          latitude = p_latitude,
          longitude = p_longitude,
          location_accuracy_m = p_accuracy,
          updated_at = now()
      where id = p_id;
  elsif p_step = 2 then
    if coalesce(p_gathering_type, '') not in (
      'demonstration', 'march', 'other'
    ) then
      raise exception 'Gathering type required' using errcode = '23514';
    end if;
    update public.gathering_reports
      set gathering_type = p_gathering_type,
          completed_step = greatest(completed_step, 2),
          updated_at = now()
      where id = p_id;
  elsif p_step = 3 then
    if coalesce(p_gathering_state, '') not in (
      'stationary', 'moving', 'dispersed', 'unknown'
    ) then
      raise exception 'Gathering state required' using errcode = '23514';
    end if;
    update public.gathering_reports
      set gathering_state = p_gathering_state,
          completed_step = greatest(completed_step, 3),
          updated_at = now()
      where id = p_id;
  else
    if coalesce(p_traffic_impact, '') not in (
      'normal', 'slowed', 'blocked', 'unknown'
    ) then
      raise exception 'Traffic impact required' using errcode = '23514';
    end if;
    update public.gathering_reports
      set traffic_impact = p_traffic_impact,
          details = trim(coalesce(p_details, '')),
          completed_step = 4,
          updated_at = now()
      where id = p_id;
  end if;

  return p_id;
end;
$$;

revoke all on function public.save_gathering_report_step(
  uuid, integer, text, double precision, double precision, double precision,
  text, text, text, text
) from public, anon, authenticated;
grant execute on function public.save_gathering_report_step(
  uuid, integer, text, double precision, double precision, double precision,
  text, text, text, text
) to authenticated;

create function private.read_gathering_report(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  report public.gathering_reports%rowtype;
begin
  select * into report from public.gathering_reports where id = p_id and private.publication_visible('gathering', id);
  if not found then return null; end if;

  return jsonb_build_object(
    'id', report.id,
    'report_kind', 'gathering',
    'location_description', report.location_description,
    'latitude', report.latitude,
    'longitude', report.longitude,
    'accident_type', null,
    'severity', null,
    'occurred_at', report.occurred_at,
    'location_source', report.location_source,
    'created_at', report.created_at,
    'completed_step', report.completed_step,
    'location_accuracy_m', report.location_accuracy_m,
    'status', report.status,
    'updated_at', report.updated_at,
    'gathering_type', report.gathering_type,
    'gathering_state', report.gathering_state,
    'traffic_impact', report.traffic_impact,
    'details', report.details
  );
end;
$$;
revoke all on function private.read_gathering_report(uuid)
  from public, anon, authenticated;
grant execute on function private.read_gathering_report(uuid)
  to anon, authenticated;

create function public.read_gathering_report(p_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.read_gathering_report(p_id);
$$;
revoke all on function public.read_gathering_report(uuid)
  from public, anon, authenticated;
grant execute on function public.read_gathering_report(uuid)
  to anon, authenticated;

-- Register this category before its sync trigger can create event contributions.
insert into private.report_event_rules(kind, radius_m, window_minutes)
values ('gathering', 100, 60);

create trigger a_event_sync
after insert or update or delete on public.gathering_reports
for each row execute function private.sync_report_event('gathering');

alter table public.report_rewards
  drop constraint report_rewards_report_kind_check;
alter table public.report_rewards
  add constraint report_rewards_report_kind_check check (
    report_kind in (
      'accident', 'kidnapping', 'barricade', 'armed_presence',
      'suspicious_vehicle', 'gunfire', 'breakdown', 'fire', 'gathering'
    )
  );

create trigger gathering_reward
after insert or update of completed_step on public.gathering_reports
for each row execute function private.reward_completed_report('gathering', '4');

comment on table public.gathering_reports is
  'Unverified gathering reports. Only authors may modify rows; public readers use explicit projections without reporter identity.';
comment on function public.read_gathering_report(uuid) is
  'Public gathering details without reporter identity.';

create trigger apply_report_context before insert or update on public.gathering_reports
for each row execute function private.apply_report_context('gathering');
