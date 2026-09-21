-- Private reports: anonymous Auth sessions have the authenticated role, but can
-- only read their own records. There is no public accident or identity feed.
create table public.accident_reports (
  id uuid primary key,
  reporter_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  location_description text not null default '' check (char_length(location_description) <= 500),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  location_accuracy_m double precision check (location_accuracy_m >= 0 and location_accuracy_m < 'Infinity'::float8),
  accident_type text not null check (accident_type in ('two_cars', 'single_car', 'motorcycle', 'other')),
  severity text not null check (severity in ('material', 'injuries', 'serious', 'fatal', 'unknown')),
  notes text not null default '' check (char_length(notes) <= 2000),
  status text not null default 'received' check (status in ('received', 'reviewing', 'closed')),
  created_at timestamptz not null default now(),
  constraint report_location_required check (char_length(trim(location_description)) >= 3 or latitude is not null),
  constraint report_coordinate_pair check ((latitude is null) = (longitude is null)),
  constraint report_accuracy_requires_coordinates check (latitude is not null or location_accuracy_m is null)
);
create index accident_reports_reporter_idx on public.accident_reports(reporter_id, created_at desc);
create index accident_reports_triage_idx on public.accident_reports(status, severity, created_at desc);

create table public.accident_report_identifiers (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.accident_reports(id) on delete cascade,
  kind text not null check (kind in ('registration', 'identity')),
  value text not null check (char_length(trim(value)) between 1 and 80),
  unique (report_id, kind, value)
);
create table public.accident_report_photos (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.accident_reports(id) on delete cascade,
  storage_path text not null unique,
  captured_at timestamptz not null,
  source text not null default 'camera' check (source = 'camera'),
  created_at timestamptz not null default now()
);
create index accident_report_photos_report_idx on public.accident_report_photos(report_id);

alter table public.accident_reports enable row level security;
alter table public.accident_report_identifiers enable row level security;
alter table public.accident_report_photos enable row level security;
revoke all on public.accident_reports, public.accident_report_identifiers, public.accident_report_photos from anon, authenticated;
grant select on public.accident_reports, public.accident_report_identifiers, public.accident_report_photos to authenticated;
grant insert (id, location_description, latitude, longitude, location_accuracy_m, accident_type, severity, notes) on public.accident_reports to authenticated;
grant insert (report_id, kind, value) on public.accident_report_identifiers to authenticated;
grant insert (report_id, storage_path, captured_at) on public.accident_report_photos to authenticated;

create policy reports_read_own on public.accident_reports for select to authenticated using (reporter_id = (select auth.uid()));
create policy reports_insert_own on public.accident_reports for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy identifiers_read_own on public.accident_report_identifiers for select to authenticated using (
  exists (select 1 from public.accident_reports r where r.id = report_id and r.reporter_id = (select auth.uid()))
);
create policy identifiers_insert_own on public.accident_report_identifiers for insert to authenticated with check (
  exists (select 1 from public.accident_reports r where r.id = report_id and r.reporter_id = (select auth.uid()))
);
create policy photos_read_own on public.accident_report_photos for select to authenticated using (
  exists (select 1 from public.accident_reports r where r.id = report_id and r.reporter_id = (select auth.uid()))
);
create policy photos_insert_own on public.accident_report_photos for insert to authenticated with check (
  split_part(storage_path, '/', 1) = (select auth.uid())::text
  and split_part(storage_path, '/', 2) = report_id::text
  and exists (select 1 from public.accident_reports r where r.id = report_id and r.reporter_id = (select auth.uid()))
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('accident-photos', 'accident-photos', false, 6291456, array['image/jpeg']);
create policy accident_photos_read_own on storage.objects for select to authenticated using (
  bucket_id = 'accident-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
);
create policy accident_photos_upload_own on storage.objects for insert to authenticated with check (
  bucket_id = 'accident-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
  and not exists (select 1 from public.accident_reports r where r.id::text = (storage.foldername(name))[2])
);
create policy accident_photos_retry_own on storage.objects for update to authenticated using (
  bucket_id = 'accident-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (select 1 from public.accident_reports r where r.id::text = (storage.foldername(name))[2])
) with check (
  bucket_id = 'accident-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
  and not exists (select 1 from public.accident_reports r where r.id::text = (storage.foldername(name))[2])
);
-- Allows cleanup of uploads not attached to a committed report, never evidence.
create policy accident_photos_cleanup_own on storage.objects for delete to authenticated using (
  bucket_id = 'accident-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  and not exists (select 1 from public.accident_report_photos p where p.storage_path = name)
);

-- Invoker rights preserve RLS. One transaction commits report + optional details.
create function public.submit_accident_report(
  p_id uuid, p_location text, p_latitude double precision, p_longitude double precision,
  p_accuracy double precision, p_accident_type text, p_severity text, p_notes text,
  p_registrations text[], p_identities text[], p_photos jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  item jsonb;
  item_path text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  -- Serializes repeated requests for the same receipt, including concurrent retries.
  perform pg_advisory_xact_lock(hashtextextended(p_id::text, 0));
  if exists (select 1 from public.accident_reports where id = p_id) then return p_id; end if;
  if cardinality(p_registrations) > 10 or cardinality(p_identities) > 10
    or p_photos is null or jsonb_typeof(p_photos) <> 'array' or jsonb_array_length(p_photos) > 4
  then raise exception 'Invalid attachments'; end if;
  for item in select value from jsonb_array_elements(p_photos) loop
    item_path := item->>'storage_path';
    if item_path is null or split_part(item_path, '/', 1) <> auth.uid()::text
      or split_part(item_path, '/', 2) <> p_id::text
      or not exists (select 1 from storage.objects where bucket_id = 'accident-photos' and name = item_path)
    then raise exception 'Photo unavailable or unauthorized' using errcode = '42501'; end if;
  end loop;
  insert into public.accident_reports(id, location_description, latitude, longitude, location_accuracy_m, accident_type, severity, notes)
    values (p_id, trim(p_location), p_latitude, p_longitude, p_accuracy, p_accident_type, p_severity, trim(p_notes));
  insert into public.accident_report_identifiers(report_id, kind, value)
    select p_id, 'registration', trim(value) from unnest(p_registrations) value
    union select p_id, 'identity', trim(value) from unnest(p_identities) value;
  insert into public.accident_report_photos(report_id, storage_path, captured_at)
    select p_id, value->>'storage_path', (value->>'captured_at')::timestamptz from jsonb_array_elements(p_photos);
  return p_id;
end;
$$;
revoke all on function public.submit_accident_report(uuid,text,double precision,double precision,double precision,text,text,text,text[],text[],jsonb) from public, anon;
grant execute on function public.submit_accident_report(uuid,text,double precision,double precision,double precision,text,text,text,text[],text[],jsonb) to authenticated;
comment on table public.accident_reports is 'Unverified citizen reports. A receipt does not dispatch emergency services.';
comment on column public.accident_report_photos.source is 'Camera-only capture in the app; not a forensic guarantee against modified API clients.';
