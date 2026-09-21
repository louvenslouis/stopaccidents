-- Consultation is available before sign-in. Only an authenticated owner can
-- receive the private identifiers; the shared projection is identical for guests.
grant usage on schema private to anon;

create or replace function private.read_accident(p_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  report public.accident_reports%rowtype;
  viewer_id uuid := auth.uid();
  is_owner boolean;
  result jsonb;
begin
  if p_id is null then
    select * into report from public.accident_reports order by created_at desc, id desc limit 1;
  else
    select * into report from public.accident_reports where id = p_id;
  end if;
  if not found then return null; end if;
  is_owner := viewer_id is not null and report.reporter_id = viewer_id;
  result := jsonb_build_object(
    'id', report.id, 'location_description', report.location_description,
    'latitude', report.latitude, 'longitude', report.longitude,
    'accident_type', report.accident_type, 'severity', report.severity,
    'created_at', report.created_at, 'completed_step', report.completed_step
  );
  if p_id is null then return result; end if;
  return result || jsonb_build_object(
    'location_accuracy_m', report.location_accuracy_m, 'notes', report.notes,
    'status', report.status, 'updated_at', report.updated_at,
    'is_owner', is_owner,
    'identifiers', case when is_owner then (
      select coalesce(jsonb_agg(jsonb_build_object('kind', i.kind, 'value', i.value) order by i.kind, i.value), '[]'::jsonb)
      from public.accident_report_identifiers i where i.report_id = report.id
    ) else '[]'::jsonb end,
    'photos', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'storage_path', p.storage_path, 'captured_at', p.captured_at) order by p.captured_at, p.id), '[]'::jsonb)
      from public.accident_report_photos p where p.report_id = report.id
    )
  );
end;
$$;
grant execute on function private.read_accident(uuid), public.read_accident(uuid) to anon;

-- This predicate intentionally serves public attached photos. No author-only
-- data is returned, and unattached uploads never satisfy it.
create or replace function private.is_shared_accident_photo(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.accident_report_photos where storage_path = p_path);
$$;
grant execute on function private.is_shared_accident_photo(text) to anon;
grant select on storage.objects to anon;
alter policy accident_photos_read_shared on storage.objects to anon, authenticated;
