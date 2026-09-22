create table public.gunfire_reports (
  id uuid primary key,
  reporter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  location_description text not null default '' check (char_length(location_description) <= 500),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  location_accuracy_m double precision check (location_accuracy_m >= 0 and location_accuracy_m < 'Infinity'::float8),
  shot_count text not null default '' check (shot_count in ('', 'one', 'two_to_five', 'six_to_ten', 'more_than_ten', 'unknown')),
  proximity text not null default '' check (proximity in ('', 'near', 'far', 'unknown')),
  cadence text not null default '' check (cadence in ('', 'isolated', 'bursts', 'continuous', 'unknown')),
  details text not null default '' check (char_length(details) <= 2000),
  status text not null default 'received' check (status in ('received', 'reviewing', 'closed')),
  completed_step smallint not null default 1 check (completed_step between 1 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gunfire_cadence_after_step_two check (completed_step < 2 or cadence <> ''),
  constraint gunfire_precise_listening_location check (latitude is not null and longitude is not null and location_accuracy_m is not null and location_accuracy_m <= 30),
  constraint gunfire_location_required check (char_length(trim(location_description)) >= 3 or latitude is not null),
  constraint gunfire_coordinate_pair check ((latitude is null) = (longitude is null)),
  constraint gunfire_accuracy_requires_coordinates check (latitude is not null or location_accuracy_m is null),
  constraint gunfire_shot_count_after_step_two check (completed_step < 2 or char_length(trim(shot_count)) >= 1),
  constraint gunfire_proximity_after_step_two check (completed_step < 2 or char_length(trim(proximity)) >= 3)
);

create index gunfire_reports_reporter_idx on public.gunfire_reports(reporter_id, created_at desc);
create index gunfire_reports_triage_idx on public.gunfire_reports(status, created_at desc);

alter table public.gunfire_reports enable row level security;
revoke all on public.gunfire_reports from anon, authenticated;
grant select on public.gunfire_reports to authenticated;
grant insert (
  id, location_description, latitude, longitude, location_accuracy_m,
  shot_count, proximity, cadence, details, completed_step
) on public.gunfire_reports to authenticated;
grant update (
  location_description, latitude, longitude, location_accuracy_m,
  shot_count, proximity, cadence, details, completed_step, updated_at
) on public.gunfire_reports to authenticated;

create policy gunfire_reports_read_own
  on public.gunfire_reports for select to authenticated
  using (reporter_id = (select auth.uid()));
create policy gunfire_reports_insert_own
  on public.gunfire_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));
create policy gunfire_reports_update_own
  on public.gunfire_reports for update to authenticated
  using (reporter_id = (select auth.uid()))
  with check (reporter_id = (select auth.uid()));

create function public.save_gunfire_report_step(
  p_id uuid,
  p_step integer,
  p_location text default '',
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy double precision default null,
  p_shot_count text default null,
  p_proximity text default null,
  p_details text default null,
  p_cadence text default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous public.gunfire_reports%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_id is null or p_step is null or p_step not between 1 and 3 then
    raise exception 'Invalid step' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into previous
    from public.gunfire_reports
    where id = p_id
    for update;

  if not found then
    if p_step <> 1 then
      raise exception 'Save the location first';
    end if;
    insert into public.gunfire_reports(
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
    update public.gunfire_reports
      set location_description = trim(p_location),
          latitude = p_latitude,
          longitude = p_longitude,
          location_accuracy_m = p_accuracy,
          updated_at = now()
      where id = p_id;
  elsif p_step = 2 then
    if char_length(trim(coalesce(p_shot_count, ''))) < 1 then
      raise exception 'Presence required' using errcode = '23514';
    end if;
    if char_length(trim(coalesce(p_proximity, ''))) < 3 then
      raise exception 'Activity required' using errcode = '23514';
    end if;
    update public.gunfire_reports
      set shot_count = trim(p_shot_count),
          proximity = trim(p_proximity),
          cadence = trim(coalesce(p_cadence, '')),
          completed_step = greatest(completed_step, 2),
          updated_at = now()
      where id = p_id;
  else
    update public.gunfire_reports
      set details = trim(coalesce(p_details, '')),
          completed_step = 3,
          updated_at = now()
      where id = p_id;
  end if;

  return p_id;
end;
$$;

revoke all on function public.save_gunfire_report_step(
  uuid, integer, text, double precision, double precision, double precision,
  text, text, text, text
) from public, anon, authenticated;
grant execute on function public.save_gunfire_report_step(
  uuid, integer, text, double precision, double precision, double precision,
  text, text, text, text
) to authenticated;

comment on table public.gunfire_reports is 'Unverified gunfire listening reports. Only authors may modify rows; public readers use explicit projections without reporter identity.';
create index gunfire_reports_latest_idx on public.gunfire_reports(created_at desc, id desc);
create function private.read_gunfire_report(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  report public.gunfire_reports%rowtype;
  is_owner boolean;
  result jsonb;
begin
  select * into report from public.gunfire_reports where id = p_id;
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
revoke all on function private.read_gunfire_report(uuid) from public, anon, authenticated;
grant execute on function private.read_gunfire_report(uuid) to anon, authenticated;

create function public.read_gunfire_report(p_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.read_gunfire_report(p_id);
$$;
revoke all on function public.read_gunfire_report(uuid) from public, anon, authenticated;
grant execute on function public.read_gunfire_report(uuid) to anon, authenticated;



create or replace function private.read_latest_report()
returns jsonb language sql stable security definer set search_path = '' as $$
  with reports as (
    select id, 'accident'::text as report_kind, location_description,
      latitude, longitude, accident_type::text, severity::text,
      created_at, completed_step
    from public.accident_reports
    union all
    select id, 'kidnapping'::text, location_description,
      latitude, longitude, null::text, null::text,
      created_at, completed_step
    from public.kidnapping_reports
    union all
    select id, 'barricade'::text, location_description,
      latitude, longitude, null::text, null::text,
      created_at, completed_step
    from public.barricade_reports
    union all
    select id, 'armed_presence'::text, location_description,
      latitude, longitude, null::text, null::text,
      created_at, completed_step
    from public.armed_presence_reports
    union all
    select id, 'suspicious_vehicle'::text, location_description,
      latitude, longitude, null::text, null::text,
      created_at, completed_step
    from public.suspicious_vehicle_reports
    union all
    select id, 'gunfire'::text, location_description,
      latitude, longitude, null::text, null::text,
      created_at, completed_step
    from public.gunfire_reports
  )
  select to_jsonb(report)
  from reports report
  order by created_at desc, id desc
  limit 1;
$$;
revoke all on function private.read_latest_report() from public, anon, authenticated;
grant execute on function private.read_latest_report() to anon, authenticated;

create or replace function public.read_latest_report()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.read_latest_report();
$$;
revoke all on function public.read_latest_report() from public, anon, authenticated;
grant execute on function public.read_latest_report() to anon, authenticated;

create or replace function private.read_map_reports()
returns jsonb language sql stable security definer set search_path = '' as $$
  with candidates as materialized (
    select id, 'accident'::text as report_kind, location_description,
      latitude, longitude, accident_type::text, severity::text,
      created_at, completed_step
    from public.accident_reports
    where latitude between 18.0 and 20.1 and longitude between -74.55 and -71.6
    union all
    select id, 'kidnapping'::text, location_description,
      latitude, longitude, null::text, null::text,
      created_at, completed_step
    from public.kidnapping_reports
    where latitude between 18.0 and 20.1 and longitude between -74.55 and -71.6
    union all
    select id, 'barricade'::text, location_description,
      latitude, longitude, null::text, null::text,
      created_at, completed_step
    from public.barricade_reports
    where latitude between 18.0 and 20.1 and longitude between -74.55 and -71.6
    union all
    select id, 'armed_presence'::text, location_description,
      latitude, longitude, null::text, null::text,
      created_at, completed_step
    from public.armed_presence_reports
    where latitude between 18.0 and 20.1 and longitude between -74.55 and -71.6
    union all
    select id, 'suspicious_vehicle'::text, location_description,
      latitude, longitude, null::text, null::text,
      created_at, completed_step
    from public.suspicious_vehicle_reports
    where latitude between 18.0 and 20.1 and longitude between -74.55 and -71.6
    union all
    select id, 'gunfire'::text, location_description,
      latitude, longitude, null::text, null::text,
      created_at, completed_step
    from public.gunfire_reports
    where latitude between 18.0 and 20.1 and longitude between -74.55 and -71.6
    order by created_at desc, id desc
    limit 501
  ), visible as (
    select * from candidates order by created_at desc, id desc limit 500
  )
  select jsonb_build_object(
    'reports', coalesce(
      (select jsonb_agg(to_jsonb(v) order by v.created_at desc, v.id desc) from visible v),
      '[]'::jsonb
    ),
    'truncated', (select count(*) > 500 from candidates)
  );
$$;
revoke all on function private.read_map_reports() from public, anon, authenticated;
grant execute on function private.read_map_reports() to anon, authenticated;

create or replace function public.read_map_reports()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.read_map_reports();
$$;
revoke all on function public.read_map_reports() from public, anon, authenticated;
grant execute on function public.read_map_reports() to anon, authenticated;


alter table public.report_rewards drop constraint report_rewards_report_kind_check;
alter table public.report_rewards add constraint report_rewards_report_kind_check
  check (report_kind in ('accident', 'kidnapping', 'barricade', 'armed_presence', 'suspicious_vehicle', 'gunfire'));
create trigger gunfire_reward after insert or update of completed_step on public.gunfire_reports
  for each row execute function private.reward_completed_report('gunfire', '3');
comment on table public.gunfire_reports is 'Unverified gunfire heard from the reporter listening location; coordinates do not identify the origin of shots.';
