-- Retain a certain department even when commune polygons overlap.
alter table private.report_contributions add column department_code text;
create index report_contributions_department_idx on private.report_contributions(department_code) where published;
create function private.report_territory_at(p_latitude double precision,p_longitude double precision)
returns table(department_code text,commune_code text)
language sql stable set search_path = '' as $$
 select case when count(distinct g.department_code)=1 then min(g.department_code) end,
   case when count(distinct b.commune_code)=1 then min(b.commune_code) end
 from private.report_commune_boundaries b join private.report_communes g on g.code=b.commune_code
 where p_latitude between -90 and 90 and p_longitude between -180 and 180
 and b.bounds @> box(point(p_longitude,p_latitude),point(p_longitude,p_latitude))
 and b.exterior @> point(p_longitude,p_latitude)
 and not exists(select 1 from unnest(b.holes) h where h @> point(p_longitude,p_latitude));
$$;
revoke all on function private.report_territory_at(double precision,double precision) from public,anon,authenticated;
create or replace function private.set_report_commune() returns trigger
language plpgsql set search_path = '' as $$
begin
 select t.department_code,t.commune_code into new.department_code,new.commune_code
 from private.report_territory_at(new.latitude,new.longitude) t;
 return new;
end;
$$;
update private.report_contributions c set (department_code,commune_code)=(
 select t.department_code,t.commune_code from private.report_territory_at(c.latitude,c.longitude) t
);

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
  with members as materialized (
    select c.*, private.report_event_root(c.event_id) root
    from private.report_contributions c where c.published
  ), representatives as (
    select distinct on (root) root, summary, kind, completed_step, commune_code, department_code
    from members order by root, completed_step desc, created_at, report_id
  ), totals as (
    select root, min(created_at) first_seen, max(created_at) last_seen,
      count(*) testimonies, count(distinct reporter_id) witnesses
    from members group by root
  ), events as materialized (
    select r.*, g.name commune_name, d.department_name, t.first_seen, t.testimonies,
      (t.first_seen at time zone 'America/Port-au-Prince')::date event_day,
      extract(hour from t.first_seen at time zone 'America/Port-au-Prince')::int event_hour,
      case when r.kind='accident' then 'accidents'
        when r.kind in ('barricade','breakdown') then 'traffic' else 'security' end category,
      r.summary || jsonb_build_object('event_id',r.root,'created_at',t.first_seen,
        'commune_code',r.commune_code,'commune_name',g.name,
        'department_code',r.department_code,'department_name',d.department_name,
        'testimony_count',t.testimonies,'witness_count',t.witnesses,'last_observed_at',t.last_seen) projection
    from representatives r join totals t using (root)
    left join private.report_communes g on g.code=r.commune_code
    left join (select distinct department_code,department_name from private.report_communes) d on d.department_code=r.department_code
  ), filtered as materialized (
    select * from events where (p_category='all' or category=p_category)
      and (p_subcategory='all' or
        case when p_category='accidents' then coalesce(summary->>'accident_type','unspecified')
          else kind end=p_subcategory)
      and (p_department is null or department_code=p_department or (p_department='unknown' and department_code is null))
      and (p_commune is null or commune_code=p_commune or (p_commune='unknown' and commune_code is null))
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
    'territories',jsonb_build_object(
      'unlocated',(select count(*) from current_period where commune_code is null),
      'unlocated_departments',(select count(*) from current_period where department_code is null),
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

