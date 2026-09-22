create table public.armed_presence_reports (
  id uuid primary key,
  reporter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  location_description text not null default '' check (char_length(location_description) <= 500),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  location_accuracy_m double precision check (location_accuracy_m >= 0 and location_accuracy_m < 'Infinity'::float8),
  presence text not null default '' check (char_length(presence) <= 1500),
  activity text not null default '' check (char_length(activity) <= 1000),
  details text not null default '' check (char_length(details) <= 2000),
  status text not null default 'received' check (status in ('received', 'reviewing', 'closed')),
  completed_step smallint not null default 1 check (completed_step between 1 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint armed_presence_location_required check (char_length(trim(location_description)) >= 3 or latitude is not null),
  constraint armed_presence_coordinate_pair check ((latitude is null) = (longitude is null)),
  constraint armed_presence_accuracy_requires_coordinates check (latitude is not null or location_accuracy_m is null),
  constraint armed_presence_presence_after_step_two check (completed_step < 2 or char_length(trim(presence)) >= 1),
  constraint armed_presence_activity_after_step_two check (completed_step < 2 or char_length(trim(activity)) >= 3)
);

create index armed_presence_reports_reporter_idx on public.armed_presence_reports(reporter_id, created_at desc);
create index armed_presence_reports_triage_idx on public.armed_presence_reports(status, created_at desc);

alter table public.armed_presence_reports enable row level security;
revoke all on public.armed_presence_reports from anon, authenticated;
grant select on public.armed_presence_reports to authenticated;
grant insert (
  id, location_description, latitude, longitude, location_accuracy_m,
  presence, activity, details, completed_step
) on public.armed_presence_reports to authenticated;
grant update (
  location_description, latitude, longitude, location_accuracy_m,
  presence, activity, details, completed_step, updated_at
) on public.armed_presence_reports to authenticated;

create policy armed_presence_reports_read_own
  on public.armed_presence_reports for select to authenticated
  using (reporter_id = (select auth.uid()));
create policy armed_presence_reports_insert_own
  on public.armed_presence_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));
create policy armed_presence_reports_update_own
  on public.armed_presence_reports for update to authenticated
  using (reporter_id = (select auth.uid()))
  with check (reporter_id = (select auth.uid()));

create function public.save_armed_presence_report_step(
  p_id uuid,
  p_step integer,
  p_location text default '',
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy double precision default null,
  p_presence text default null,
  p_activity text default null,
  p_details text default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous public.armed_presence_reports%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_id is null or p_step is null or p_step not between 1 and 3 then
    raise exception 'Invalid step' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into previous
    from public.armed_presence_reports
    where id = p_id
    for update;

  if not found then
    if p_step <> 1 then
      raise exception 'Save the location first';
    end if;
    insert into public.armed_presence_reports(
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
    update public.armed_presence_reports
      set location_description = trim(p_location),
          latitude = p_latitude,
          longitude = p_longitude,
          location_accuracy_m = p_accuracy,
          updated_at = now()
      where id = p_id;
  elsif p_step = 2 then
    if char_length(trim(coalesce(p_presence, ''))) < 1 then
      raise exception 'Presence required' using errcode = '23514';
    end if;
    if char_length(trim(coalesce(p_activity, ''))) < 3 then
      raise exception 'Activity required' using errcode = '23514';
    end if;
    update public.armed_presence_reports
      set presence = trim(p_presence),
          activity = trim(p_activity),
          completed_step = greatest(completed_step, 2),
          updated_at = now()
      where id = p_id;
  else
    update public.armed_presence_reports
      set details = trim(coalesce(p_details, '')),
          completed_step = 3,
          updated_at = now()
      where id = p_id;
  end if;

  return p_id;
end;
$$;

revoke all on function public.save_armed_presence_report_step(
  uuid, integer, text, double precision, double precision, double precision,
  text, text, text
) from public, anon, authenticated;
grant execute on function public.save_armed_presence_report_step(
  uuid, integer, text, double precision, double precision, double precision,
  text, text, text
) to authenticated;

comment on table public.armed_presence_reports is 'Unverified armed presence reports. Only authors may modify rows; public readers use explicit projections without reporter identity.';
create index armed_presence_reports_latest_idx on public.armed_presence_reports(created_at desc, id desc);
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

create function private.read_armed_presence_report(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  report public.armed_presence_reports%rowtype;
  is_owner boolean;
  result jsonb;
begin
  select * into report from public.armed_presence_reports where id = p_id;
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
revoke all on function private.read_armed_presence_report(uuid) from public, anon, authenticated;
grant execute on function private.read_armed_presence_report(uuid) to anon, authenticated;

create function public.read_armed_presence_report(p_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.read_armed_presence_report(p_id);
$$;
revoke all on function public.read_armed_presence_report(uuid) from public, anon, authenticated;
grant execute on function public.read_armed_presence_report(uuid) to anon, authenticated;



comment on function public.read_latest_report() is 'Latest public safety report across all categories, without reporter identity.';
comment on function public.read_map_reports() is 'Bounded public map feed for all safety report categories in Haiti.';
comment on function public.read_armed_presence_report(uuid) is 'Unverified armed presence observation, without reporter identity.';
