-- Historical reports came from the complete form. New staged reports explicitly
-- start at step 1; their dispatch/review status remains independent of completion.
alter table public.accident_reports
  alter column accident_type drop not null,
  add column completed_step smallint not null default 4 check (completed_step between 1 and 4),
  add column updated_at timestamptz not null default now(),
  add constraint report_type_after_step_two check (completed_step < 2 or accident_type is not null);

grant insert (completed_step) on public.accident_reports to authenticated;
grant update (location_description, latitude, longitude, location_accuracy_m, accident_type, severity, notes, completed_step, updated_at)
  on public.accident_reports to authenticated;
create policy reports_update_own on public.accident_reports for update to authenticated
  using (reporter_id = (select auth.uid())) with check (reporter_id = (select auth.uid()));

-- Optional details can be corrected on this same report. Ownership is always
-- checked through the parent; no client can edit reporter_id or review status.
grant delete on public.accident_report_identifiers, public.accident_report_photos to authenticated;
create policy identifiers_replace_own on public.accident_report_identifiers for delete to authenticated using (
  exists (select 1 from public.accident_reports r where r.id = report_id and r.reporter_id = (select auth.uid()))
);
create policy photos_replace_own on public.accident_report_photos for delete to authenticated using (
  exists (select 1 from public.accident_reports r where r.id = report_id and r.reporter_id = (select auth.uid()))
);

-- The parent now exists before uploads. Only unreferenced files can be uploaded
-- or retried; an attached photo's bytes cannot be overwritten.
alter policy accident_photos_upload_own on storage.objects with check (
  bucket_id = 'accident-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
  and not exists (select 1 from public.accident_report_photos p where p.storage_path = name)
);
alter policy accident_photos_retry_own on storage.objects using (
  bucket_id = 'accident-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (select 1 from public.accident_report_photos p where p.storage_path = name)
) with check (
  bucket_id = 'accident-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
  and not exists (select 1 from public.accident_report_photos p where p.storage_path = name)
);

create function public.save_accident_report_step(
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
  if p_step > previous.completed_step + 1 then raise exception 'Save the previous step first'; end if;

  if p_step = 1 then
    update public.accident_reports set location_description = trim(p_location),
      latitude = p_latitude, longitude = p_longitude, location_accuracy_m = p_accuracy, updated_at = now()
      where id = p_id;
  elsif p_step = 2 then
    if p_accident_type is null then raise exception 'Accident type required' using errcode = '23514'; end if;
    update public.accident_reports set accident_type = p_accident_type,
      completed_step = greatest(completed_step, 2), updated_at = now() where id = p_id;
  elsif p_step = 3 then
    if p_severity is null then raise exception 'Severity required' using errcode = '23514'; end if;
    update public.accident_reports set severity = p_severity,
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
    update public.accident_reports set notes = trim(p_notes), completed_step = 4, updated_at = now() where id = p_id;
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
revoke all on function public.save_accident_report_step(uuid,integer,text,double precision,double precision,double precision,text,text,text,text[],text[],jsonb) from public, anon;
grant execute on function public.save_accident_report_step(uuid,integer,text,double precision,double precision,double precision,text,text,text,text[],text[],jsonb) to authenticated;
comment on column public.accident_reports.completed_step is '1: location received; 2: accident type; 3: severity; 4: supplementary information. A partially completed report is already received.';
