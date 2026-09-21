-- A deliberately limited shared read API. Base tables retain owner-only RLS.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create index accident_reports_latest_idx on public.accident_reports(created_at desc, id desc);

create function private.read_accident(p_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  report public.accident_reports%rowtype;
  result jsonb;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_id is null then
    select * into report from public.accident_reports order by created_at desc, id desc limit 1;
  else
    select * into report from public.accident_reports where id = p_id;
  end if;
  if not found then return null; end if;

  -- No reporter ID, identity number, registration or photo path in the card.
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
    'is_owner', report.reporter_id = auth.uid(),
    'identifiers', case when report.reporter_id = auth.uid() then (
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
revoke all on function private.read_accident(uuid) from public, anon, authenticated;
grant execute on function private.read_accident(uuid) to authenticated;

create function public.read_accident(p_id uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.read_accident(p_id);
$$;
revoke all on function public.read_accident(uuid) from public, anon, authenticated;
grant execute on function public.read_accident(uuid) to authenticated;

-- Only attached photos may be viewed by other users. Uploads and identifiers
-- stay private; write and delete permissions are unchanged.
create function private.is_shared_accident_photo(p_path text)
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.accident_report_photos where storage_path = p_path
  );
$$;
revoke all on function private.is_shared_accident_photo(text) from public, anon, authenticated;
grant execute on function private.is_shared_accident_photo(text) to authenticated;
create policy accident_photos_read_shared on storage.objects for select to authenticated using (
  bucket_id = 'accident-photos' and private.is_shared_accident_photo(name)
);
