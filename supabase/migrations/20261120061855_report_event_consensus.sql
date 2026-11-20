-- Only fields already public in a testimony are eligible for the event detail.
create view private.report_observations with (security_invoker = true) as
select 'accident'::text kind, id, updated_at, jsonb_build_object('notes', notes) facts
from public.accident_reports
union all
select 'fire', id, updated_at, jsonb_build_object('fire_target', fire_target,
  'fire_state', fire_state, 'people_danger', people_danger, 'details', details)
from public.fire_reports
union all
select 'breakdown', id, updated_at, jsonb_build_object('vehicle_type', vehicle_type,
  'breakdown_position', breakdown_position, 'traffic_impact', traffic_impact, 'details', details)
from public.breakdown_reports
union all
select 'barricade', id, updated_at, jsonb_build_object('obstacles', obstacles,
  'passage', passage, 'details', details)
from public.barricade_reports
union all
select 'gathering', id, updated_at, jsonb_build_object('gathering_type', gathering_type,
  'gathering_state', gathering_state, 'traffic_impact', traffic_impact, 'details', details)
from public.gathering_reports;
revoke all on private.report_observations from public, anon, authenticated;

create function private.report_event_consensus(p_root uuid, p_kind text, p_detail boolean)
returns jsonb language sql stable set search_path = '' as $$
  with recursive family(id) as (
    select p_root
    union all select e.id from private.report_events e join family f on e.merged_into = f.id
  ), members as materialized (
    select c.reporter_id, c.report_id, c.created_at as observed_at, c.completed_step, o.updated_at,
      jsonb_build_object(
        'accident_type', case when c.completed_step >= 2 then c.summary->'accident_type' end,
        'severity', case when c.completed_step >= 3 then c.summary->'severity' end
      ) || coalesce(o.facts, '{}'::jsonb) as facts
    from family f join private.report_contributions c on c.event_id = f.id
    left join private.report_observations o on p_detail and o.kind = p_kind and o.id = c.report_id
    where c.kind = p_kind and c.published and private.publication_visible(c.kind, c.report_id)
  ), answers as (
    select m.reporter_id, m.report_id, m.observed_at, a.key, btrim(a.value) as value,
      lower(btrim(regexp_replace(a.value, '[[:space:]]+', ' ', 'g'))) as normalized
    from members m cross join lateral jsonb_each_text(m.facts) a
  ), latest_per_witness as (
    -- Omission and "unknown" abstain. A witness can revise one field independently.
    select distinct on (reporter_id, key) *,
      min(observed_at) over (partition by reporter_id, key, normalized) as first_supported
    from answers where normalized not in ('', 'unknown')
    order by reporter_id, key, observed_at desc, report_id
  ), observations as (
    select *, max(observed_at) over (partition by key) as newest,
      key in ('fire_state', 'people_danger', 'traffic_impact', 'breakdown_position',
              'gathering_state', 'passage', 'obstacles') as changing
    from latest_per_witness
  ), candidates as (
    select key, changing, (array_agg(value order by observed_at desc, report_id))[1] as value,
      count(*) as witnesses, min(first_supported) as first_seen, max(observed_at) as last_seen
    from observations
    -- Age each changing field against its own latest observation, including for archived events.
    where not changing or observed_at >= newest - interval '30 minutes'
    group by key, changing, normalized
  ), ranked as (
    -- At equal support, prefer a specific type. Break state ties by recency and stable ties by first support.
    select *, row_number() over (partition by key order by witnesses desc,
      case when key in ('accident_type', 'fire_target', 'vehicle_type', 'gathering_type') and value = 'other' then 1 else 0 end,
      case when changing then last_seen end desc, first_seen, value collate "C") as preference,
      row_number() over (partition by key order by last_seen desc, value collate "C") as recency
    from candidates
  ), resolved as (
    select key, value from ranked where preference = 1 and key not in ('notes', 'details')
    union all
    -- Keep distinct public notes verbatim and bounded. All originals remain in the history.
    select key, string_agg(value, E'\n\n' order by recency)
    from ranked where key in ('notes', 'details') and recency <= 5 group by key
  )
  select coalesce((select jsonb_object_agg(key, value) from resolved), '{}'::jsonb)
    || case when p_detail then (select jsonb_strip_nulls(jsonb_build_object(
      'completed_step', max(completed_step), 'updated_at', max(updated_at))) from members)
    else '{}'::jsonb end;
$$;
revoke all on function private.report_event_consensus(uuid, text, boolean) from public, anon, authenticated;

-- The map, home feed and analytics share the same accident classification.
create view private.report_event_overviews with (security_invoker = true) as
with recursive family(id, root) as (
  select id, id from private.report_events where merged_into is null
  union all select e.id, f.root from private.report_events e join family f on e.merged_into = f.id
), members as (
  select f.root, c.* from family f join private.report_contributions c on c.event_id = f.id
  where c.published and not exists (
    select 1 from private.publication_moderation m
    where m.kind = c.kind and m.report_id = c.report_id and m.suspended
  )
), anchors as (
  select distinct on (root) root, kind, summary, completed_step, commune_code, department_code
  from members order by root, completed_step desc, created_at, report_id
), totals as (
  select root, count(*) as testimonies, count(distinct reporter_id) as witnesses,
    min(created_at) as first_seen, max(created_at) as last_seen
  from members group by root
)
select a.root, a.kind, a.completed_step, a.commune_code, a.department_code,
  t.first_seen, t.last_seen, t.testimonies, t.witnesses,
  case when a.kind = 'accident' and t.testimonies > 1
    then a.summary || private.report_event_consensus(a.root, a.kind, false)
    else a.summary end as summary
from anchors a join totals t using (root);
revoke all on private.report_event_overviews from public, anon, authenticated;

create or replace function private.event_summaries() returns setof jsonb
language sql stable set search_path = '' as $$
  select summary || jsonb_build_object('event_id', root, 'testimony_count', testimonies,
    'witness_count', witnesses, 'last_observed_at', last_seen) from private.report_event_overviews;
$$;

create function private.read_event_report(p_kind text, p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  root uuid;
  report jsonb;
begin
  select private.report_event_root(event_id) into root from private.report_contributions
  where kind = p_kind and report_id = p_id and published;
  if root is null then return null; end if;

  -- The existing reader enforces visibility and ownership of attachments on the selected report.
  report := case p_kind
    when 'accident' then private.read_accident(p_id)
    when 'fire' then private.read_fire_report(p_id)
    when 'breakdown' then private.read_breakdown_report(p_id)
    when 'barricade' then private.read_barricade_report(p_id)
    when 'gathering' then private.read_gathering_report(p_id)
  end;
  return report || private.report_event_consensus(root, p_kind, true);
end;
$$;
create function public.read_event_report(p_kind text, p_id uuid) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select private.read_event_report(p_kind, p_id);
$$;
revoke all on function private.read_event_report(text, uuid), public.read_event_report(text, uuid) from public;
grant execute on function private.read_event_report(text, uuid), public.read_event_report(text, uuid) to anon, authenticated;

create or replace function private.read_report_analytics(
  p_start date, p_end date, p_category text default 'all',
  p_subcategory text default 'all', p_offset integer default 0,
  p_department text default null, p_commune text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_end is null or (p_start is not null and p_start > p_end)
    or p_category is null or p_category not in ('all','accidents','traffic','security')
    or p_subcategory is null or p_offset is null or p_offset < 0 then
    raise exception 'Invalid analytics filters' using errcode='22023';
  end if;
  if (p_department is not null and p_department <> 'unknown' and not exists (
      select 1 from private.report_communes where department_code=p_department))
    or (p_commune is not null and p_commune <> 'unknown' and not exists (
      select 1 from private.report_communes where code=p_commune
        and (p_department is null or department_code=p_department))) then
    raise exception 'Invalid territory filters' using errcode='22023';
  end if;
  with events as materialized (
    select r.*, g.name commune_name, d.department_name,
      (r.first_seen at time zone 'America/Port-au-Prince')::date event_day,
      extract(hour from r.first_seen at time zone 'America/Port-au-Prince')::int event_hour,
      case when r.kind='accident' then 'accidents'
        when r.kind in ('barricade','breakdown') then 'traffic' else 'security' end category,
      r.summary || jsonb_build_object('event_id',r.root,'created_at',r.first_seen,
        'commune_code',r.commune_code,'commune_name',g.name,
        'department_code',r.department_code,'department_name',d.department_name,
        'testimony_count',r.testimonies,'witness_count',r.witnesses,'last_observed_at',r.last_seen) projection
    from private.report_event_overviews r
    left join private.report_communes g on g.code=r.commune_code
    left join (select distinct department_code,department_name from private.report_communes) d on d.department_code=r.department_code
  ), observations as (
    select event_day as period_start, event_day as period_end, 1 as event_count,
      category, kind, summary, completed_step, commune_code, department_code, department_name, commune_name,
      root, first_seen, event_hour, testimonies, projection, null::jsonb as bulletin
    from events
    union all
    select b.period_start, b.period_end, b.serious_accidents,
      'accidents', 'accident', null, null, null, null, null, null,
      null, null, null, 0, null, to_jsonb(b)
    from private.stop_accidents_bulletins b
  ), filtered as materialized (
    select * from observations where (p_category='all' or category=p_category)
      and (p_subcategory='all' or
        case when p_category='accidents' then coalesce(summary->>'accident_type','unspecified')
          else kind end=p_subcategory)
      and (p_department is null or department_code=p_department or (p_department='unknown' and department_code is null))
      and (p_commune is null or commune_code=p_commune or (p_commune='unknown' and commune_code is null))
  ), current_period as materialized (
    -- A partial bulletin cannot be allocated to individual days.
    select * from filtered where (p_start is null or period_start>=p_start) and period_end<=p_end
  ), recent as (
    select projection from current_period where root is not null
    order by first_seen desc,root desc limit 20 offset p_offset
  )
  select jsonb_build_object(
    'total',(select coalesce(sum(event_count),0) from current_period),
    'individual_total',(select count(root) from current_period),
    'stop_accidents_bulletins',coalesce((select jsonb_agg(bulletin order by period_end desc)
      from current_period where bulletin is not null),'[]'::jsonb),
    'previous_total',case when p_start is null then null else
      (select coalesce(sum(event_count),0) from filtered
       where period_end<p_start and period_start>=p_start-(p_end-p_start+1)) end,
    'testimonies',(select coalesce(sum(testimonies),0) from current_period),
    'detailed',(select count(*) from current_period where completed_step>=3),
    'first_date',(select min(period_start) from filtered),
    'updated_at',now(),
    'categories',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select category,sum(event_count) as count from current_period group by category order by category) x),'[]'::jsonb),
    'kinds',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select kind,sum(event_count) as count from current_period group by kind order by count desc,kind) x),'[]'::jsonb),
    'daily',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select period_start as date,count(*) from current_period where root is not null
      group by period_start order by period_start) x),'[]'::jsonb),
    'hours',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select event_hour as hour,count(*) from current_period where root is not null
      group by event_hour order by event_hour) x),'[]'::jsonb),
    'severity',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select case when completed_step<3 then 'unknown' else coalesce(summary->>'severity','unknown') end severity,
        sum(event_count) as count from current_period where kind='accident' group by 1) x),'[]'::jsonb),
    'territories',jsonb_build_object(
      'unlocated',(select coalesce(sum(event_count),0) from current_period where commune_code is null),
      'unlocated_departments',(select coalesce(sum(event_count),0) from current_period where department_code is null),
      'departments',coalesce((select jsonb_agg(to_jsonb(x)) from (
        select department_code code,department_name name,count(*) from current_period
        where department_code is not null group by department_code,department_name
        order by count(*) desc,department_name,department_code) x),'[]'::jsonb),
      'communes',coalesce((select jsonb_agg(to_jsonb(x)) from (
        select commune_code code,commune_name name,department_code,department_name,count(*) from current_period
        where commune_code is not null group by commune_code,commune_name,department_code,department_name
        order by count(*) desc,commune_name,commune_code) x),'[]'::jsonb)
    ),
    'reports',coalesce((select jsonb_agg(projection) from recent),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;
