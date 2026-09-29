create table public.fire_reports (
  id uuid primary key,
  reporter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  location_description text not null default '' check (char_length(location_description) <= 500),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  location_accuracy_m double precision check (location_accuracy_m >= 0 and location_accuracy_m < 'Infinity'::float8),
  fire_target text not null default '' check (fire_target in ('', 'car', 'house', 'commerce', 'other_vehicle', 'building', 'warehouse', 'vegetation', 'other', 'unknown')),
  fire_state text not null default '' check (fire_state in ('', 'active', 'smoke', 'extinguished', 'unknown')),
  people_danger text not null default '' check (people_danger in ('', 'yes', 'no', 'unknown')),
  details text not null default '' check (char_length(details) <= 2000),
  status text not null default 'received' check (status in ('received', 'reviewing', 'closed')),
  completed_step smallint not null default 1 check (completed_step between 1 and 4),
  location_source text not null default 'device' check (location_source in ('device','manual')),
  occurred_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fire_precise_location check (
    latitude is not null and longitude is not null and
    ((location_source = 'manual' and occurred_at is not null and location_accuracy_m is null)
      or (location_accuracy_m is not null and location_accuracy_m <= 30))
  ),
  constraint fire_location_required check (
    char_length(trim(location_description)) >= 3 or latitude is not null
  ),
  constraint fire_coordinate_pair check ((latitude is null) = (longitude is null)),
  constraint fire_accuracy_requires_coordinates check (latitude is not null or location_accuracy_m is null),
  constraint fire_target_after_step_two check (completed_step < 2 or fire_target <> ''),
  constraint fire_vehicle_after_step_three check (completed_step < 3 or fire_state <> ''),
  constraint fire_traffic_after_step_four check (completed_step < 4 or people_danger <> '')
);

create index fire_reports_reporter_idx
  on public.fire_reports(reporter_id, created_at desc);
create index fire_reports_triage_idx
  on public.fire_reports(status, created_at desc);

alter table public.fire_reports enable row level security;
revoke all on public.fire_reports from public, anon, authenticated;
grant select on public.fire_reports to authenticated;
grant insert (
  id, location_description, latitude, longitude, location_accuracy_m,
  fire_target, fire_state, people_danger, details, completed_step
) on public.fire_reports to authenticated;
grant update (
  location_description, latitude, longitude, location_accuracy_m,
  fire_target, fire_state, people_danger, details,
  completed_step, updated_at
) on public.fire_reports to authenticated;

create policy fire_reports_read_own
  on public.fire_reports for select to authenticated
  using (reporter_id = (select auth.uid()));
create policy fire_reports_insert_own
  on public.fire_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));
create policy fire_reports_update_own
  on public.fire_reports for update to authenticated
  using (reporter_id = (select auth.uid()))
  with check (reporter_id = (select auth.uid()));

create function public.save_fire_report_step(
  p_id uuid,
  p_step integer,
  p_location text default '',
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy double precision default null,
  p_fire_target text default null,
  p_fire_state text default null,
  p_people_danger text default null,
  p_details text default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous public.fire_reports%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_id is null or p_step is null or p_step not between 1 and 4 then
    raise exception 'Invalid step' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into previous
    from public.fire_reports
    where id = p_id
    for update;

  if not found then
    if p_step <> 1 then
      raise exception 'Save the location first';
    end if;
    insert into public.fire_reports(
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
    update public.fire_reports
      set location_description = trim(p_location),
          latitude = p_latitude,
          longitude = p_longitude,
          location_accuracy_m = p_accuracy,
          updated_at = now()
      where id = p_id;
  elsif p_step = 2 then
    if coalesce(p_fire_target, '') not in (
      'car', 'house', 'commerce', 'other_vehicle', 'building', 'warehouse', 'vegetation', 'other', 'unknown'
    ) then
      raise exception 'Fire target required' using errcode = '23514';
    end if;
    update public.fire_reports
      set fire_target = p_fire_target,
          completed_step = greatest(completed_step, 2),
          updated_at = now()
      where id = p_id;
  elsif p_step = 3 then
    if coalesce(p_fire_state, '') not in (
      'active', 'smoke', 'extinguished', 'unknown'
    ) then
      raise exception 'Fire state required' using errcode = '23514';
    end if;
    update public.fire_reports
      set fire_state = p_fire_state,
          completed_step = greatest(completed_step, 3),
          updated_at = now()
      where id = p_id;
  else
    if coalesce(p_people_danger, '') not in (
      'yes', 'no', 'unknown'
    ) then
      raise exception 'People danger required' using errcode = '23514';
    end if;
    update public.fire_reports
      set people_danger = p_people_danger,
          details = trim(coalesce(p_details, '')),
          completed_step = 4,
          updated_at = now()
      where id = p_id;
  end if;

  return p_id;
end;
$$;

revoke all on function public.save_fire_report_step(
  uuid, integer, text, double precision, double precision, double precision,
  text, text, text, text
) from public, anon, authenticated;
grant execute on function public.save_fire_report_step(
  uuid, integer, text, double precision, double precision, double precision,
  text, text, text, text
) to authenticated;

create function private.read_fire_report(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  report public.fire_reports%rowtype;
begin
  select * into report from public.fire_reports where id = p_id and private.publication_visible('fire', id);
  if not found then return null; end if;

  return jsonb_build_object(
    'id', report.id,
    'report_kind', 'fire',
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
    'fire_target', report.fire_target,
    'fire_state', report.fire_state,
    'people_danger', report.people_danger,
    'details', report.details
  );
end;
$$;
revoke all on function private.read_fire_report(uuid)
  from public, anon, authenticated;
grant execute on function private.read_fire_report(uuid)
  to anon, authenticated;

create function public.read_fire_report(p_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.read_fire_report(p_id);
$$;
revoke all on function public.read_fire_report(uuid)
  from public, anon, authenticated;
grant execute on function public.read_fire_report(uuid)
  to anon, authenticated;

-- Register this category before its sync trigger can create event contributions.
insert into private.report_event_rules(kind, radius_m, window_minutes)
values ('fire', 100, 60);

create trigger a_event_sync
after insert or update or delete on public.fire_reports
for each row execute function private.sync_report_event('fire');

alter table public.report_rewards
  drop constraint report_rewards_report_kind_check;
alter table public.report_rewards
  add constraint report_rewards_report_kind_check check (
    report_kind in (
      'accident', 'kidnapping', 'barricade', 'armed_presence',
      'suspicious_vehicle', 'gunfire', 'breakdown', 'fire'
    )
  );

create trigger fire_reward
after insert or update of completed_step on public.fire_reports
for each row execute function private.reward_completed_report('fire', '4');

comment on table public.fire_reports is
  'Unverified fire reports. Only authors may modify rows; public readers use explicit projections without reporter identity.';
comment on function public.read_fire_report(uuid) is
  'Public fire details without reporter identity.';

create trigger apply_report_context before insert or update on public.fire_reports
for each row execute function private.apply_report_context('fire');
