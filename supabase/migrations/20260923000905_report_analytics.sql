-- Public analytics use the same published projection as the map, without its
-- geographic/500-event cap. Private identities, notes and photos stay private.
create function private.read_report_analytics(
  p_start date, p_end date, p_category text default 'all',
  p_subcategory text default 'all', p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if p_end is null or (p_start is not null and p_start > p_end)
    or p_category is null or p_category not in ('all','accidents','traffic','security')
    or p_subcategory is null or p_offset is null or p_offset < 0 then
    raise exception 'Invalid analytics filters' using errcode='22023';
  end if;
  with members as materialized (
    select c.*, private.report_event_root(c.event_id) root
    from private.report_contributions c where c.published
  ), representatives as (
    select distinct on (root) root, summary, kind, completed_step
    from members order by root, completed_step desc, created_at, report_id
  ), totals as (
    select root, min(created_at) first_seen, max(created_at) last_seen,
      count(*) testimonies, count(distinct reporter_id) witnesses
    from members group by root
  ), events as materialized (
    select r.*, t.first_seen, t.testimonies,
      (t.first_seen at time zone 'America/Port-au-Prince')::date event_day,
      extract(hour from t.first_seen at time zone 'America/Port-au-Prince')::int event_hour,
      case when r.kind='accident' then 'accidents'
        when r.kind in ('barricade','breakdown') then 'traffic' else 'security' end category,
      r.summary || jsonb_build_object('event_id',r.root,'created_at',t.first_seen,
        'testimony_count',t.testimonies,'witness_count',t.witnesses,'last_observed_at',t.last_seen) projection
    from representatives r join totals t using (root)
  ), filtered as materialized (
    select * from events where (p_category='all' or category=p_category)
      and (p_subcategory='all' or
        case when p_category='accidents' then coalesce(summary->>'accident_type','unspecified')
          else kind end=p_subcategory)
  ), current_period as materialized (
    select * from filtered where (p_start is null or event_day>=p_start) and event_day<=p_end
  ), recent as (
    select projection from current_period order by first_seen desc,root desc limit 20 offset p_offset
  )
  select jsonb_build_object(
    'total',(select count(*) from current_period),
    'previous_total',case when p_start is null then null else
      (select count(*) from filtered where event_day<p_start and event_day>=p_start-(p_end-p_start+1)) end,
    'testimonies',(select coalesce(sum(testimonies),0) from current_period),
    'detailed',(select count(*) from current_period where completed_step>=3),
    'first_date',(select min(event_day) from filtered),
    'updated_at',now(),
    'categories',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select category,count(*) from current_period group by category order by category) x),'[]'::jsonb),
    'kinds',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select kind,count(*) from current_period group by kind order by count(*) desc,kind) x),'[]'::jsonb),
    'daily',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select event_day as date,count(*) from current_period group by event_day order by event_day) x),'[]'::jsonb),
    'hours',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select event_hour as hour,count(*) from current_period group by event_hour order by event_hour) x),'[]'::jsonb),
    'severity',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select case when completed_step<3 then 'unknown' else coalesce(summary->>'severity','unknown') end severity,
        count(*) from current_period where kind='accident' group by 1) x),'[]'::jsonb),
    'reports',coalesce((select jsonb_agg(projection) from recent),'[]'::jsonb)
  ) into result;
  return result;
end;
$$;

-- Intentional anonymous read, matching read_map_reports. No table access granted.
create function public.read_report_analytics(
  p_start date, p_end date, p_category text default 'all',
  p_subcategory text default 'all', p_offset integer default 0
) returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.read_report_analytics(p_start,p_end,p_category,p_subcategory,p_offset);
$$;
revoke all on function private.read_report_analytics(date,date,text,text,integer) from public,anon,authenticated;
revoke all on function public.read_report_analytics(date,date,text,text,integer) from public,anon,authenticated;
grant execute on function private.read_report_analytics(date,date,text,text,integer) to anon,authenticated;
grant execute on function public.read_report_analytics(date,date,text,text,integer) to anon,authenticated;
