-- Same public summary as read_accident; base tables remain owner-only.
-- Guests intentionally have access, matching the existing public consultation flow.
-- No author IDs, notes, identifiers or photo paths are exposed by this endpoint.
create function private.read_map_accidents()
returns jsonb language sql stable security definer set search_path = '' as $$
  with candidates as materialized (
    select id, location_description, latitude, longitude,
      accident_type, severity, created_at, completed_step
    from public.accident_reports
    where latitude between 18.0 and 20.1 and longitude between -74.55 and -71.6
    order by created_at desc, id desc
    limit 501
  ), visible as (
    select * from candidates order by created_at desc, id desc limit 500
  )
  select jsonb_build_object(
    'reports', coalesce((select jsonb_agg(to_jsonb(v) order by v.created_at desc, v.id desc) from visible v), '[]'::jsonb),
    'truncated', (select count(*) > 500 from candidates)
  );
$$;
revoke all on function private.read_map_accidents() from public, anon, authenticated;
grant execute on function private.read_map_accidents() to anon, authenticated;

create function public.read_map_accidents()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.read_map_accidents();
$$;
revoke all on function public.read_map_accidents() from public, anon, authenticated;
grant execute on function public.read_map_accidents() to anon, authenticated;
