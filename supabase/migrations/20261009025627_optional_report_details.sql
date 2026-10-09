-- Details may be omitted independently. Location, ownership, value domains and size limits remain enforced.

alter table public.accident_reports drop constraint if exists report_type_after_step_two;

create or replace function public.save_accident_report_step(
  p_id uuid, p_step integer,
  p_location text default '', p_latitude double precision default null,
  p_longitude double precision default null, p_accuracy double precision default null,
  p_accident_type text default null, p_severity text default null,
  p_notes text default '', p_registrations text[] default '{}',
  p_identities text[] default '{}', p_photos jsonb default '[]'
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  previous public.accident_reports%rowtype;
  item jsonb;
  item_path text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_id is null or p_step is null or p_step not between 1 and 4 then
    raise exception 'Invalid step' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into previous from public.accident_reports where id = p_id for update;
  if not found then
    if p_step <> 1 then raise exception 'Save the location first'; end if;
    insert into public.accident_reports(id, location_description, latitude, longitude, location_accuracy_m, accident_type, severity, completed_step)
      values (p_id, trim(p_location), p_latitude, p_longitude, p_accuracy, null, 'unknown', 1);
    return p_id;
  end if;


  if p_step = 1 then
    update public.accident_reports set location_description = trim(p_location),
      latitude = p_latitude, longitude = p_longitude, location_accuracy_m = p_accuracy, updated_at = now()
      where id = p_id;
  elsif p_step = 2 then

    update public.accident_reports set accident_type = coalesce(p_accident_type, accident_type),
      completed_step = greatest(completed_step, 2), updated_at = now() where id = p_id;
  elsif p_step = 3 then

    update public.accident_reports set severity = coalesce(p_severity, severity),
      completed_step = greatest(completed_step, 3), updated_at = now() where id = p_id;
  else
    if p_registrations is null or p_identities is null or cardinality(p_registrations) > 10 or cardinality(p_identities) > 10
      or p_photos is null or jsonb_typeof(p_photos) <> 'array' or jsonb_array_length(p_photos) > 4 then
      raise exception 'Invalid attachments';
    end if;
    for item in select value from jsonb_array_elements(p_photos) loop
      item_path := item->>'storage_path';
      if item_path is null or split_part(item_path, '/', 1) <> auth.uid()::text
        or split_part(item_path, '/', 2) <> p_id::text
        or not exists (select 1 from storage.objects where bucket_id = 'accident-photos' and name = item_path) then
        raise exception 'Photo unavailable or unauthorized' using errcode = '42501';
      end if;
    end loop;
    -- This transaction changes only supplementary fields; saved location, type
    -- and severity survive failures or an earlier-step adjustment.
    update public.accident_reports set notes = trim(coalesce(p_notes, '')), completed_step = 4, updated_at = now() where id = p_id;
    delete from public.accident_report_identifiers where report_id = p_id;
    insert into public.accident_report_identifiers(report_id, kind, value)
      select p_id, 'registration', trim(value) from unnest(p_registrations) value
      union select p_id, 'identity', trim(value) from unnest(p_identities) value;
    delete from public.accident_report_photos where report_id = p_id;
    insert into public.accident_report_photos(report_id, storage_path, captured_at)
      select p_id, value->>'storage_path', (value->>'captured_at')::timestamptz from jsonb_array_elements(p_photos);
  end if;
  return p_id;
end;
$$;

alter table public.fire_reports drop constraint if exists fire_target_after_step_two;

alter table public.fire_reports drop constraint if exists fire_vehicle_after_step_three;

alter table public.fire_reports drop constraint if exists fire_traffic_after_step_four;

create or replace function public.save_fire_report_step(
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



  if p_step = 1 then
    update public.fire_reports
      set location_description = trim(p_location),
          latitude = p_latitude,
          longitude = p_longitude,
          location_accuracy_m = p_accuracy,
          updated_at = now()
      where id = p_id;
  elsif p_step = 2 then
    if coalesce(p_fire_target, '') <> '' and p_fire_target not in (
      'car', 'house', 'commerce', 'other_vehicle', 'building', 'warehouse', 'vegetation', 'other', 'unknown'
    ) then
      raise exception 'Fire target required' using errcode = '23514';
    end if;
    update public.fire_reports
      set fire_target = coalesce(p_fire_target, ''),
          completed_step = greatest(completed_step, 2),
          updated_at = now()
      where id = p_id;
  elsif p_step = 3 then
    if coalesce(p_fire_state, '') <> '' and p_fire_state not in (
      'active', 'smoke', 'extinguished', 'unknown'
    ) then
      raise exception 'Fire state required' using errcode = '23514';
    end if;
    update public.fire_reports
      set fire_state = coalesce(p_fire_state, ''),
          completed_step = greatest(completed_step, 3),
          updated_at = now()
      where id = p_id;
  else
    if coalesce(p_people_danger, '') <> '' and p_people_danger not in (
      'yes', 'no', 'unknown'
    ) then
      raise exception 'People danger required' using errcode = '23514';
    end if;
    update public.fire_reports
      set people_danger = coalesce(p_people_danger, ''),
          details = trim(coalesce(p_details, '')),
          completed_step = 4,
          updated_at = now()
      where id = p_id;
  end if;

  return p_id;
end;
$$;

alter table public.breakdown_reports drop constraint if exists breakdown_position_after_step_two;

alter table public.breakdown_reports drop constraint if exists breakdown_vehicle_after_step_three;

alter table public.breakdown_reports drop constraint if exists breakdown_traffic_after_step_four;

create or replace function public.save_breakdown_report_step(
  p_id uuid,
  p_step integer,
  p_location text default '',
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy double precision default null,
  p_breakdown_position text default null,
  p_vehicle_type text default null,
  p_traffic_impact text default null,
  p_details text default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous public.breakdown_reports%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_id is null or p_step is null or p_step not between 1 and 4 then
    raise exception 'Invalid step' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into previous
    from public.breakdown_reports
    where id = p_id
    for update;

  if not found then
    if p_step <> 1 then
      raise exception 'Save the location first';
    end if;
    insert into public.breakdown_reports(
      id, location_description, latitude, longitude, location_accuracy_m,
      completed_step
    ) values (
      p_id, trim(p_location), p_latitude, p_longitude, p_accuracy, 1
    );
    return p_id;
  end if;



  if p_step = 1 then
    update public.breakdown_reports
      set location_description = trim(p_location),
          latitude = p_latitude,
          longitude = p_longitude,
          location_accuracy_m = p_accuracy,
          updated_at = now()
      where id = p_id;
  elsif p_step = 2 then
    if coalesce(p_breakdown_position, '') <> '' and p_breakdown_position not in (
      'roadway', 'shoulder', 'sidewalk', 'off_road', 'unknown'
    ) then
      raise exception 'Breakdown position required' using errcode = '23514';
    end if;
    update public.breakdown_reports
      set breakdown_position = coalesce(p_breakdown_position, ''),
          completed_step = greatest(completed_step, 2),
          updated_at = now()
      where id = p_id;
  elsif p_step = 3 then
    if coalesce(p_vehicle_type, '') <> '' and p_vehicle_type not in (
      'car', 'motorcycle', 'truck', 'minibus', 'bus', 'tuktuk', 'other'
    ) then
      raise exception 'Vehicle type required' using errcode = '23514';
    end if;
    update public.breakdown_reports
      set vehicle_type = coalesce(p_vehicle_type, ''),
          completed_step = greatest(completed_step, 3),
          updated_at = now()
      where id = p_id;
  else
    if coalesce(p_traffic_impact, '') <> '' and p_traffic_impact not in (
      'blocked', 'major_slowdown', 'slowdown', 'none', 'unknown'
    ) then
      raise exception 'Traffic impact required' using errcode = '23514';
    end if;
    update public.breakdown_reports
      set traffic_impact = coalesce(p_traffic_impact, ''),
          details = trim(coalesce(p_details, '')),
          completed_step = 4,
          updated_at = now()
      where id = p_id;
  end if;

  return p_id;
end;
$$;

alter table public.gathering_reports drop constraint if exists gathering_type_after_step_two;

alter table public.gathering_reports drop constraint if exists gathering_state_after_step_three;

alter table public.gathering_reports drop constraint if exists gathering_traffic_after_step_four;

create or replace function public.save_gathering_report_step(
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



  if p_step = 1 then
    update public.gathering_reports
      set location_description = trim(p_location),
          latitude = p_latitude,
          longitude = p_longitude,
          location_accuracy_m = p_accuracy,
          updated_at = now()
      where id = p_id;
  elsif p_step = 2 then
    if coalesce(p_gathering_type, '') <> '' and p_gathering_type not in (
      'demonstration', 'march', 'other'
    ) then
      raise exception 'Gathering type required' using errcode = '23514';
    end if;
    update public.gathering_reports
      set gathering_type = coalesce(p_gathering_type, ''),
          completed_step = greatest(completed_step, 2),
          updated_at = now()
      where id = p_id;
  elsif p_step = 3 then
    if coalesce(p_gathering_state, '') <> '' and p_gathering_state not in (
      'stationary', 'moving', 'dispersed', 'unknown'
    ) then
      raise exception 'Gathering state required' using errcode = '23514';
    end if;
    update public.gathering_reports
      set gathering_state = coalesce(p_gathering_state, ''),
          completed_step = greatest(completed_step, 3),
          updated_at = now()
      where id = p_id;
  else
    if coalesce(p_traffic_impact, '') <> '' and p_traffic_impact not in (
      'normal', 'slowed', 'blocked', 'unknown'
    ) then
      raise exception 'Traffic impact required' using errcode = '23514';
    end if;
    update public.gathering_reports
      set traffic_impact = coalesce(p_traffic_impact, ''),
          details = trim(coalesce(p_details, '')),
          completed_step = 4,
          updated_at = now()
      where id = p_id;
  end if;

  return p_id;
end;
$$;

alter table public.gunfire_reports drop constraint if exists gunfire_cadence_after_step_two;

alter table public.gunfire_reports drop constraint if exists gunfire_shot_count_after_step_two;

alter table public.gunfire_reports drop constraint if exists gunfire_proximity_after_step_two;

create or replace function public.save_gunfire_report_step(
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



  if p_step = 1 then
    update public.gunfire_reports
      set location_description = trim(p_location),
          latitude = p_latitude,
          longitude = p_longitude,
          location_accuracy_m = p_accuracy,
          updated_at = now()
      where id = p_id;
  elsif p_step = 2 then


    update public.gunfire_reports
      set shot_count = trim(coalesce(p_shot_count, '')),
          proximity = trim(coalesce(p_proximity, '')),
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

alter table public.barricade_reports drop constraint if exists barricade_obstacles_after_step_two;

alter table public.barricade_reports drop constraint if exists barricade_passage_after_step_two;

alter table public.barricade_reports drop constraint if exists barricade_details_after_step_three;

create or replace function public.save_barricade_report_step(
  p_id uuid,
  p_step integer,
  p_location text default '',
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy double precision default null,
  p_obstacles text default null,
  p_passage text default null,
  p_details text default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous public.barricade_reports%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_id is null or p_step is null or p_step not between 1 and 3 then
    raise exception 'Invalid step' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into previous
    from public.barricade_reports
    where id = p_id
    for update;

  if not found then
    if p_step <> 1 then
      raise exception 'Save the location first';
    end if;
    insert into public.barricade_reports(
      id, location_description, latitude, longitude, location_accuracy_m,
      completed_step
    ) values (
      p_id, trim(p_location), p_latitude, p_longitude, p_accuracy, 1
    );
    return p_id;
  end if;



  if p_step = 1 then
    update public.barricade_reports
      set location_description = trim(p_location),
          latitude = p_latitude,
          longitude = p_longitude,
          location_accuracy_m = p_accuracy,
          updated_at = now()
      where id = p_id;
  elsif p_step = 2 then


    update public.barricade_reports
      set obstacles = trim(coalesce(p_obstacles, '')),
          passage = trim(coalesce(p_passage, '')),
          completed_step = greatest(completed_step, 2),
          updated_at = now()
      where id = p_id;
  else

    update public.barricade_reports
      set details = trim(coalesce(p_details, '')),
          completed_step = 3,
          updated_at = now()
      where id = p_id;
  end if;

  return p_id;
end;
$$;

alter table public.kidnapping_reports drop constraint if exists kidnapping_vehicle_after_step_two;

alter table public.kidnapping_reports drop constraint if exists kidnapping_direction_after_step_two;

alter table public.kidnapping_reports drop constraint if exists kidnapping_person_after_step_three;

create or replace function public.save_kidnapping_report_step(
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



  if p_step = 1 then
    update public.kidnapping_reports
      set location_description = trim(p_location),
          latitude = p_latitude,
          longitude = p_longitude,
          location_accuracy_m = p_accuracy,
          updated_at = now()
      where id = p_id;
  elsif p_step = 2 then


    update public.kidnapping_reports
      set vehicle_clues = trim(coalesce(p_vehicle_clues, '')),
          direction_taken = trim(coalesce(p_direction_taken, '')),
          completed_step = greatest(completed_step, 2),
          updated_at = now()
      where id = p_id;
  else

    update public.kidnapping_reports
      set abducted_person_clues = trim(coalesce(p_abducted_person_clues, '')),
          completed_step = 3,
          updated_at = now()
      where id = p_id;
  end if;

  return p_id;
end;
$$;

alter table public.armed_presence_reports drop constraint if exists armed_presence_presence_after_step_two;

alter table public.armed_presence_reports drop constraint if exists armed_presence_activity_after_step_two;

create or replace function public.save_armed_presence_report_step(
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



  if p_step = 1 then
    update public.armed_presence_reports
      set location_description = trim(p_location),
          latitude = p_latitude,
          longitude = p_longitude,
          location_accuracy_m = p_accuracy,
          updated_at = now()
      where id = p_id;
  elsif p_step = 2 then


    update public.armed_presence_reports
      set presence = trim(coalesce(p_presence, '')),
          activity = trim(coalesce(p_activity, '')),
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

alter table public.suspicious_vehicle_reports drop constraint if exists suspicious_vehicle_vehicle_description_after_step_two;

alter table public.suspicious_vehicle_reports drop constraint if exists suspicious_vehicle_observed_behavior_after_step_two;

create or replace function public.save_suspicious_vehicle_report_step(
  p_id uuid,
  p_step integer,
  p_location text default '',
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_accuracy double precision default null,
  p_vehicle_description text default null,
  p_observed_behavior text default null,
  p_details text default null
) returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  previous public.suspicious_vehicle_reports%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_id is null or p_step is null or p_step not between 1 and 3 then
    raise exception 'Invalid step' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  select * into previous
    from public.suspicious_vehicle_reports
    where id = p_id
    for update;

  if not found then
    if p_step <> 1 then
      raise exception 'Save the location first';
    end if;
    insert into public.suspicious_vehicle_reports(
      id, location_description, latitude, longitude, location_accuracy_m,
      completed_step
    ) values (
      p_id, trim(p_location), p_latitude, p_longitude, p_accuracy, 1
    );
    return p_id;
  end if;



  if p_step = 1 then
    update public.suspicious_vehicle_reports
      set location_description = trim(p_location),
          latitude = p_latitude,
          longitude = p_longitude,
          location_accuracy_m = p_accuracy,
          updated_at = now()
      where id = p_id;
  elsif p_step = 2 then


    update public.suspicious_vehicle_reports
      set vehicle_description = trim(coalesce(p_vehicle_description, '')),
          observed_behavior = trim(coalesce(p_observed_behavior, '')),
          completed_step = greatest(completed_step, 2),
          updated_at = now()
      where id = p_id;
  else
    update public.suspicious_vehicle_reports
      set details = trim(coalesce(p_details, '')),
          completed_step = 3,
          updated_at = now()
      where id = p_id;
  end if;

  return p_id;
end;
$$;
