-- Kidnapping reports contain sensitive eyewitness information and are never part
-- of the public accident feed. Client access is limited to the report author.
create table public.kidnapping_reports (
  id uuid primary key,
  reporter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  location_description text not null default '' check (char_length(location_description) <= 500),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  location_accuracy_m double precision check (location_accuracy_m >= 0 and location_accuracy_m < 'Infinity'::float8),
  vehicle_clues text not null default '' check (char_length(vehicle_clues) <= 1500),
  direction_taken text not null default '' check (char_length(direction_taken) <= 1000),
  abducted_person_clues text not null default '' check (char_length(abducted_person_clues) <= 2000),
  status text not null default 'received' check (status in ('received', 'reviewing', 'closed')),
  completed_step smallint not null default 1 check (completed_step between 1 and 3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kidnapping_location_required check (char_length(trim(location_description)) >= 3 or latitude is not null),
  constraint kidnapping_coordinate_pair check ((latitude is null) = (longitude is null)),
  constraint kidnapping_accuracy_requires_coordinates check (latitude is not null or location_accuracy_m is null),
  constraint kidnapping_vehicle_after_step_two check (completed_step < 2 or char_length(trim(vehicle_clues)) >= 3),
  constraint kidnapping_direction_after_step_two check (completed_step < 2 or char_length(trim(direction_taken)) >= 3),
  constraint kidnapping_person_after_step_three check (completed_step < 3 or char_length(trim(abducted_person_clues)) >= 3)
);

create index kidnapping_reports_reporter_idx on public.kidnapping_reports(reporter_id, created_at desc);
create index kidnapping_reports_triage_idx on public.kidnapping_reports(status, created_at desc);

alter table public.kidnapping_reports enable row level security;
revoke all on public.kidnapping_reports from anon, authenticated;
grant select on public.kidnapping_reports to authenticated;
grant insert (
  id, location_description, latitude, longitude, location_accuracy_m,
  vehicle_clues, direction_taken, abducted_person_clues, completed_step
) on public.kidnapping_reports to authenticated;
grant update (
  location_description, latitude, longitude, location_accuracy_m,
  vehicle_clues, direction_taken, abducted_person_clues, completed_step, updated_at
) on public.kidnapping_reports to authenticated;

create policy kidnapping_reports_read_own
  on public.kidnapping_reports for select to authenticated
  using (reporter_id = (select auth.uid()));
create policy kidnapping_reports_insert_own
  on public.kidnapping_reports for insert to authenticated
  with check (reporter_id = (select auth.uid()));
create policy kidnapping_reports_update_own
  on public.kidnapping_reports for update to authenticated
  using (reporter_id = (select auth.uid()))
  with check (reporter_id = (select auth.uid()));

create function public.save_kidnapping_report_step(
  p_id uuid,
  p_step integer,
  p_location text default '',
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy double precision default null,
  p_vehicle_clues text default null,
  p_direction_taken text default null,
  p_abducted_person_clues text default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous public.kidnapping_reports%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_id is null or p_step is null or p_step not between 1 and 3 then
    raise exception 'Invalid step' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into previous
    from public.kidnapping_reports
    where id = p_id
    for update;

  if not found then
    if p_step <> 1 then
      raise exception 'Save the location first';
    end if;
    insert into public.kidnapping_reports(
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
    update public.kidnapping_reports
      set location_description = trim(p_location),
          latitude = p_latitude,
          longitude = p_longitude,
          location_accuracy_m = p_accuracy,
          updated_at = now()
      where id = p_id;
  elsif p_step = 2 then
    if char_length(trim(coalesce(p_vehicle_clues, ''))) < 3 then
      raise exception 'Vehicle clues required' using errcode = '23514';
    end if;
    if char_length(trim(coalesce(p_direction_taken, ''))) < 3 then
      raise exception 'Direction required' using errcode = '23514';
    end if;
    update public.kidnapping_reports
      set vehicle_clues = trim(p_vehicle_clues),
          direction_taken = trim(p_direction_taken),
          completed_step = greatest(completed_step, 2),
          updated_at = now()
      where id = p_id;
  else
    if char_length(trim(coalesce(p_abducted_person_clues, ''))) < 3 then
      raise exception 'Abducted person clues required' using errcode = '23514';
    end if;
    update public.kidnapping_reports
      set abducted_person_clues = trim(p_abducted_person_clues),
          completed_step = 3,
          updated_at = now()
      where id = p_id;
  end if;

  return p_id;
end;
$$;

revoke all on function public.save_kidnapping_report_step(
  uuid, integer, text, double precision, double precision, double precision,
  text, text, text
) from public, anon, authenticated;
grant execute on function public.save_kidnapping_report_step(
  uuid, integer, text, double precision, double precision, double precision,
  text, text, text
) to authenticated;

comment on table public.kidnapping_reports is
  'Sensitive, unverified kidnapping reports. Private to the author through the client; service roles retain operational access.';
comment on column public.kidnapping_reports.completed_step is
  '1: location received; 2: vehicle clues and direction; 3: abducted person clues.';
