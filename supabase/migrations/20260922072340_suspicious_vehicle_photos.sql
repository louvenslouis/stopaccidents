create table public.suspicious_vehicle_report_photos (
  report_id uuid primary key references public.suspicious_vehicle_reports(id) on delete cascade,
  storage_path text not null unique,
  captured_at timestamptz not null,
  source text not null default 'camera' check (source = 'camera')
);
alter table public.suspicious_vehicle_report_photos enable row level security;
revoke all on public.suspicious_vehicle_report_photos from anon, authenticated;
grant select, delete on public.suspicious_vehicle_report_photos to authenticated;
grant insert (report_id, storage_path, captured_at) on public.suspicious_vehicle_report_photos to authenticated;
create policy vehicle_photo_read_own on public.suspicious_vehicle_report_photos for select to authenticated using (
  exists (select 1 from public.suspicious_vehicle_reports r where r.id = report_id and r.reporter_id = (select auth.uid()))
);
create policy vehicle_photo_remove_own on public.suspicious_vehicle_report_photos for delete to authenticated using (
  exists (select 1 from public.suspicious_vehicle_reports r where r.id = report_id and r.reporter_id = (select auth.uid()))
);
create policy vehicle_photo_attach_own on public.suspicious_vehicle_report_photos for insert to authenticated with check (
  split_part(storage_path, '/', 1) = (select auth.uid())::text
  and split_part(storage_path, '/', 2) = report_id::text
  and exists (select 1 from public.suspicious_vehicle_reports r where r.id = report_id and r.reporter_id = (select auth.uid()))
  and exists (select 1 from storage.objects where bucket_id = 'suspicious-vehicle-photos' and name = storage_path)
);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('suspicious-vehicle-photos', 'suspicious-vehicle-photos', false, 6291456, array['image/jpeg']);

-- Anonymous visitors can view only an attached photo, never an unfinished upload.
create function private.is_shared_vehicle_photo(p_path text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.suspicious_vehicle_report_photos where storage_path = p_path);
$$;
revoke all on function private.is_shared_vehicle_photo(text) from public, anon, authenticated;
grant execute on function private.is_shared_vehicle_photo(text) to anon, authenticated;
create policy vehicle_photos_read on storage.objects for select to anon, authenticated using (
  bucket_id = 'suspicious-vehicle-photos'
  and ((storage.foldername(name))[1] = (select auth.uid())::text or private.is_shared_vehicle_photo(name))
);
create policy vehicle_photos_upload on storage.objects for insert to authenticated with check (
  bucket_id = 'suspicious-vehicle-photos'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
  and exists (select 1 from public.suspicious_vehicle_reports r where r.id::text = (storage.foldername(name))[2] and r.reporter_id = (select auth.uid()))
  and not private.is_shared_vehicle_photo(name)
);
create policy vehicle_photos_retry on storage.objects for update to authenticated using (
  bucket_id = 'suspicious-vehicle-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  and not private.is_shared_vehicle_photo(name)
) with check (
  bucket_id = 'suspicious-vehicle-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
  and exists (select 1 from public.suspicious_vehicle_reports r where r.id::text = (storage.foldername(name))[2] and r.reporter_id = (select auth.uid()))
  and not private.is_shared_vehicle_photo(name)
);
create policy vehicle_photos_cleanup on storage.objects for delete to authenticated using (
  bucket_id = 'suspicious-vehicle-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
  and not private.is_shared_vehicle_photo(name)
);

create function public.complete_suspicious_vehicle_report(p_id uuid, p_details text default '', p_photos jsonb default '[]')
returns uuid language plpgsql security invoker set search_path = '' as $$
declare item jsonb; item_path text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_photos is null or jsonb_typeof(p_photos) <> 'array' then raise exception 'Invalid photos'; end if;
  if jsonb_array_length(p_photos) > 1 then raise exception 'Only one photo allowed'; end if;
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
  insert into public.suspicious_vehicle_report_photos(report_id, storage_path, captured_at)
    select p_id, value->>'storage_path', (value->>'captured_at')::timestamptz from jsonb_array_elements(p_photos);
  return p_id;
end;
$$;
revoke all on function public.complete_suspicious_vehicle_report(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.complete_suspicious_vehicle_report(uuid,text,jsonb) to authenticated;

create or replace function private.read_suspicious_vehicle_report(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  report public.suspicious_vehicle_reports%rowtype;
  is_owner boolean;
  result jsonb;
begin
  select * into report from public.suspicious_vehicle_reports where id = p_id;
  if not found then return null; end if;

  is_owner := auth.uid() is not null and report.reporter_id = auth.uid();
  result := jsonb_build_object(
    'id', report.id,
    'report_kind', 'suspicious_vehicle',
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
      'vehicle_description', report.vehicle_description,
      'observed_behavior', report.observed_behavior,
      'details', report.details
    );
  return result || jsonb_build_object('photos', (select coalesce(jsonb_agg(jsonb_build_object('storage_path', p.storage_path, 'captured_at', p.captured_at)), '[]'::jsonb) from public.suspicious_vehicle_report_photos p where p.report_id = report.id));
end;
$$;
