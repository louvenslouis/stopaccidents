-- One national STOP Accidents bulletin per reporting period, regardless of
-- how many outlets republish it. Counts refer to the entire inclusive period.
create table private.stop_accidents_bulletins (
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  serious_accidents integer not null check (serious_accidents >= 0),
  accidents_at_least boolean not null,
  deaths integer not null check (deaths >= 0),
  injured integer not null check (injured >= 0),
  provisional boolean not null,
  note text,
  sources jsonb not null check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) > 0),
  primary key (period_start, period_end),
  exclude using gist (daterange(period_start, period_end, '[]') with &&)
);

insert into private.stop_accidents_bulletins
  (period_start, period_end, serious_accidents, accidents_at_least, deaths, injured, provisional, note, sources)
values
  ('2026-10-01', '2026-10-11', 29, true, 9, 65, true,
   'Les neuf décès recensés sont survenus sur place.',
   '[
     {"publisher":"Télé Pluriel","published_on":"2026-10-13","url":"https://teleplurielhaiti.com/actualite-a-la-une-du-13-octobre-2026-des-affrontements-opposent-depuis-le-week-end-dernier-les-gangs-de-terre-noire-et-de-chen-mechan-dans-la-plaine-du-cul-de-sac-notamment-a-sartre-e/"},
     {"publisher":"Le Nouvelliste","published_on":"2026-10-12","url":"https://lenouvelliste.com/article/272850/bilan-des-accidents-graves-de-la-circulation-en-haiti"}
   ]'),
  ('2026-11-02', '2026-11-08', 29, false, 6, 82, true,
   'Depuis le 1er octobre, STOP Accidents signale chaque semaine des enfants parmi les victimes. Plusieurs portaient leur uniforme scolaire selon l’organisation.',
   '[
     {"publisher":"Vant Bèf Info","published_on":"2026-11-09","url":"https://vantbefinfo.com/insecurite-routiere-en-haiti-88-victimes-en-sept-jours-les-enfants-de-plus-en-plus-exposes/"}
   ]');

alter table private.stop_accidents_bulletins enable row level security;
revoke all on private.stop_accidents_bulletins from public, anon, authenticated;

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
