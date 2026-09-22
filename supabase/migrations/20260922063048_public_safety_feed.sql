-- Public safety feed shared by accidents and kidnapping alerts. Sensitive
-- kidnapping clues stay private to the author; only the location, progress,
-- status and timestamps are shared with other viewers.
create index kidnapping_reports_latest_idx
  on public.kidnapping_reports(created_at desc, id desc);

create function private.read_latest_report()
returns jsonb language sql stable security definer set search_path = '' as $$
  with reports as (
    select id, 'accident'::text as report_kind, location_description,
      latitude, longitude, accident_type::text, severity::text,
      created_at, completed_step
    from public.accident_reports
    union all
    select id, 'kidnapping'::text, location_description,
      latitude, longitude, null::text, null::text,
      created_at, completed_step
    from public.kidnapping_reports
  )
  select to_jsonb(report)
  from reports report
  order by created_at desc, id desc
  limit 1;
$$;
revoke all on function private.read_latest_report() from public, anon, authenticated;
grant execute on function private.read_latest_report() to anon, authenticated;

create function public.read_latest_report()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.read_latest_report();
$$;
revoke all on function public.read_latest_report() from public, anon, authenticated;
grant execute on function public.read_latest_report() to anon, authenticated;

create function private.read_map_reports()
returns jsonb language sql stable security definer set search_path = '' as $$
  with candidates as materialized (
    select id, 'accident'::text as report_kind, location_description,
      latitude, longitude, accident_type::text, severity::text,
      created_at, completed_step
    from public.accident_reports
    where latitude between 18.0 and 20.1 and longitude between -74.55 and -71.6
    union all
    select id, 'kidnapping'::text, location_description,
      latitude, longitude, null::text, null::text,
      created_at, completed_step
    from public.kidnapping_reports
    where latitude between 18.0 and 20.1 and longitude between -74.55 and -71.6
    order by created_at desc, id desc
    limit 501
  ), visible as (
    select * from candidates order by created_at desc, id desc limit 500
  )
  select jsonb_build_object(
    'reports', coalesce(
      (select jsonb_agg(to_jsonb(v) order by v.created_at desc, v.id desc) from visible v),
      '[]'::jsonb
    ),
    'truncated', (select count(*) > 500 from candidates)
  );
$$;
revoke all on function private.read_map_reports() from public, anon, authenticated;
grant execute on function private.read_map_reports() to anon, authenticated;

create function public.read_map_reports()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.read_map_reports();
$$;
revoke all on function public.read_map_reports() from public, anon, authenticated;
grant execute on function public.read_map_reports() to anon, authenticated;

create function private.read_kidnapping_report(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  report public.kidnapping_reports%rowtype;
  is_owner boolean;
  result jsonb;
begin
  select * into report from public.kidnapping_reports where id = p_id;
  if not found then return null; end if;

  is_owner := auth.uid() is not null and report.reporter_id = auth.uid();
  result := jsonb_build_object(
    'id', report.id,
    'report_kind', 'kidnapping',
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

  if is_owner then
    result := result || jsonb_build_object(
      'vehicle_clues', report.vehicle_clues,
      'direction_taken', report.direction_taken,
      'abducted_person_clues', report.abducted_person_clues
    );
  end if;
  return result;
end;
$$;
revoke all on function private.read_kidnapping_report(uuid) from public, anon, authenticated;
grant execute on function private.read_kidnapping_report(uuid) to anon, authenticated;

create function public.read_kidnapping_report(p_id uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.read_kidnapping_report(p_id);
$$;
revoke all on function public.read_kidnapping_report(uuid) from public, anon, authenticated;
grant execute on function public.read_kidnapping_report(uuid) to anon, authenticated;

comment on function public.read_latest_report() is
  'Latest public accident or kidnapping summary, without reporter or sensitive clue data.';
comment on function public.read_map_reports() is
  'Bounded public map feed for accidents and kidnapping alerts in Haiti.';
comment on function public.read_kidnapping_report(uuid) is
  'Public kidnapping case details; eyewitness clues are returned only to their author.';
comment on table public.kidnapping_reports is
  'Sensitive, unverified kidnapping reports. Base rows and eyewitness clues remain private; a restricted location/status projection is shared through public feed functions.';
