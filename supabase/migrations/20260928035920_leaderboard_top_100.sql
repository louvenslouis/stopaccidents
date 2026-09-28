-- Return the top 100 in one snapshot, plus the current profile independently.
-- Publish only alias + aggregate score. The ledger and alias-to-user mapping
-- retain their owner-only RLS. Anonymous visitors may read this public ranking.
create or replace function private.read_leaderboard(
  p_period text default 'all', p_commune text default null, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  starts_at timestamptz;
  viewer uuid := auth.uid();
begin
  if p_period is null or p_period not in ('all', 'week', 'month') then
    raise exception 'Invalid leaderboard period' using errcode = '22023';
  end if;
  if p_offset is null or p_offset < 0 then
    raise exception 'Invalid leaderboard offset' using errcode = '22023';
  end if;
  if p_commune is not null and not exists(select 1 from private.report_communes where code = p_commune) then
    raise exception 'Invalid leaderboard commune' using errcode = '22023';
  end if;
  starts_at := case when p_period = 'all' then '-infinity'::timestamptz
    else date_trunc(p_period, now() at time zone 'America/Port-au-Prince') at time zone 'America/Port-au-Prince' end;
  return (
    with earned as (
      -- Deduplicate BEFORE period/commune filtering, matching read_my_rewards:
      -- merging events never awards the same account a second score.
      select r.user_id, r.points, r.created_at, c.commune_code,
        row_number() over (
          partition by r.user_id, coalesce(private.report_event_root(c.event_id), r.report_id)
          order by r.created_at, r.report_id, r.report_kind
        ) as occurrence
      from public.report_rewards r
      left join private.report_contributions c on c.kind = r.report_kind and c.report_id = r.report_id
    ), scores as (
      select e.user_id, a.alias, sum(e.points) as points, max(e.created_at) as reached_at
      from earned e join public.user_aliases a on a.user_id = e.user_id
      where e.occurrence = 1 and e.created_at >= starts_at and e.created_at <= now()
        and (p_commune is null or e.commune_code = p_commune)
      group by e.user_id, a.alias
    ), ranked as (
      select alias, points, coalesce(user_id = viewer, false) as is_me,
        row_number() over(order by points desc, reached_at, alias collate "C") as rank
      from scores
    )
    select jsonb_build_object(
      'entries', (select coalesce(jsonb_agg(to_jsonb(page) order by rank), '[]'::jsonb)
        from (select * from ranked where rank <= 100 order by rank limit 100 offset p_offset) page),
      'total', (select count(*) from ranked),
      'me', coalesce((select to_jsonb(mine) from ranked mine where is_me),
        (select jsonb_build_object('alias', alias, 'points', 0, 'rank', null, 'is_me', true)
          from public.user_aliases where user_id = viewer))
    )
  );
end;
$$;
