alter table public.accident_report_photos drop constraint accident_report_photos_source_check;
alter table public.accident_report_photos add constraint accident_report_photos_source_check check (source in ('camera','library'));
grant insert (source) on public.accident_report_photos to authenticated;
create policy imported_photos_manual_context on public.accident_report_photos as restrictive for insert to authenticated
with check (source = 'camera' or exists (
  select 1 from public.accident_reports r where r.id = report_id and r.location_source = 'manual'
));
comment on column public.accident_report_photos.source is 'Capture in app or imported image; not a forensic guarantee.';

alter table public.suspicious_vehicle_report_photos drop constraint suspicious_vehicle_report_photos_source_check;
alter table public.suspicious_vehicle_report_photos add constraint suspicious_vehicle_report_photos_source_check check (source in ('camera','library'));
grant insert (source) on public.suspicious_vehicle_report_photos to authenticated;
create policy imported_photos_manual_context on public.suspicious_vehicle_report_photos as restrictive for insert to authenticated
with check (source = 'camera' or exists (
  select 1 from public.suspicious_vehicle_reports r where r.id = report_id and r.location_source = 'manual'
));
comment on column public.suspicious_vehicle_report_photos.source is 'Capture in app or imported image; not a forensic guarantee.';

-- Keep existing attachments while allowing several photos on the same vehicle report.
alter table public.suspicious_vehicle_report_photos drop constraint suspicious_vehicle_report_photos_pkey;
alter table public.suspicious_vehicle_report_photos add primary key (report_id, storage_path);

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
    insert into public.accident_report_photos(report_id, storage_path, captured_at, source)
      select p_id, value->>'storage_path', (value->>'captured_at')::timestamptz, coalesce(value->>'source','camera') from jsonb_array_elements(p_photos);
  end if;
  return p_id;
end;
$$;
create or replace function public.complete_suspicious_vehicle_report(p_id uuid, p_details text default '', p_photos jsonb default '[]')
returns uuid language plpgsql security invoker set search_path = '' as $$
declare item jsonb; item_path text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_photos is null or jsonb_typeof(p_photos) <> 'array' then raise exception 'Invalid photos'; end if;
  if jsonb_array_length(p_photos) > 4 then raise exception 'At most four photos allowed'; end if;
  -- Locks the same report as prior-stage saves and verifies ownership via RLS.
  perform public.save_suspicious_vehicle_report_step(p_id, 3, p_details => p_details);
  for item in select value from jsonb_array_elements(p_photos) loop
    item_path := item->>'storage_path';
    if item_path is null or split_part(item_path, '/', 1) <> auth.uid()::text
      or split_part(item_path, '/', 2) <> p_id::text
      or not exists (select 1 from storage.objects where bucket_id = 'suspicious-vehicle-photos' and name = item_path)
    then raise exception 'Photo unavailable or unauthorized' using errcode = '42501'; end if;
  end loop;
  delete from public.suspicious_vehicle_report_photos where report_id = p_id;
  insert into public.suspicious_vehicle_report_photos(report_id, storage_path, captured_at, source)
    select p_id, value->>'storage_path', (value->>'captured_at')::timestamptz, coalesce(value->>'source','camera') from jsonb_array_elements(p_photos);
  return p_id;
end;
$$;
