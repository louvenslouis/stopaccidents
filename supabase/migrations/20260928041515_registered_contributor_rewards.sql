-- Keep the ledger, but permanently exclude awards made to existing guests.
alter table public.report_rewards add column eligible boolean not null default true;
update public.report_rewards r set eligible = false
from auth.users u where u.id = r.user_id
  and coalesce((to_jsonb(u)->>'is_anonymous')::boolean, false);

-- The Auth record is authoritative, even when the caller has a stale JWT.
create function private.is_registered_contributor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users u where u.id = auth.uid()
    and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean, false));
$$;
revoke all on function private.is_registered_contributor() from public, anon, authenticated;
grant execute on function private.is_registered_contributor() to authenticated;

alter policy rewards_read_own on public.report_rewards
  using (user_id = (select auth.uid()) and eligible
    and (select private.is_registered_contributor()));

create or replace function private.reward_completed_report() returns trigger
language plpgsql security definer set search_path = '' as $$
declare contribution private.report_contributions%rowtype; rule private.report_event_rules%rowtype;
begin
  if auth.uid() is null or auth.uid() <> new.reporter_id
    or new.completed_step <> tg_argv[1]::integer
    or not private.is_registered_contributor() then return new; end if;
  if tg_op = 'UPDATE' and old.completed_step >= tg_argv[1]::integer then return new; end if;
  perform pg_advisory_xact_lock(hashtextextended('reward:' || new.reporter_id::text, 0));
  select * into contribution from private.report_contributions where kind = tg_argv[0] and report_id = new.id;
  select * into rule from private.report_event_rules where kind = tg_argv[0];
  if exists (
    select 1 from public.report_rewards r
    join private.report_contributions c on c.kind = r.report_kind and c.report_id = r.report_id
    where r.user_id = new.reporter_id and r.report_kind = tg_argv[0] and r.eligible
      and (private.report_event_root(c.event_id) = private.report_event_root(contribution.event_id)
        or (abs(extract(epoch from(c.created_at - contribution.created_at))) <= rule.window_minutes * 60
          and private.report_distance(c.latitude, c.longitude, contribution.latitude, contribution.longitude)
            <= rule.radius_m + least(coalesce(c.accuracy, 0), 30) + least(coalesce(contribution.accuracy, 0), 30)))
  ) then return new; end if;
  insert into public.report_rewards(report_kind, report_id, user_id)
    values(tg_argv[0], new.id, new.reporter_id) on conflict(report_kind, report_id) do nothing;
  return new;
end;
$$;

create or replace function private.read_event_rewards(p_report_id uuid, p_report_kind text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if not private.is_registered_contributor() then
    return jsonb_build_object('total', 0, 'count', 0, 'earned', 0);
  end if;
  return (with ranked as (
    select r.*, row_number() over(partition by coalesce(private.report_event_root(c.event_id), r.report_id)
      order by r.created_at, r.report_id) position
    from public.report_rewards r
    left join private.report_contributions c on c.kind = r.report_kind and c.report_id = r.report_id
    where r.user_id = auth.uid() and r.eligible
  ) select jsonb_build_object('total', coalesce(sum(points) filter(where position = 1), 0),
    'count', count(*) filter(where position = 1),
    'earned', coalesce(max(points) filter(where position = 1 and report_id = p_report_id and report_kind = p_report_kind), 0)) from ranked);
end;
$$;

create or replace function private.read_leaderboard(
  p_period text default 'all', p_commune text default null, p_offset integer default 0
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  starts_at timestamptz;
  viewer uuid := auth.uid();
begin
  if not private.is_registered_contributor() then viewer := null; end if;
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
      select r.user_id, r.points, r.created_at, c.commune_code,
        row_number() over (
          partition by r.user_id, coalesce(private.report_event_root(c.event_id), r.report_id)
          order by r.created_at, r.report_id, r.report_kind
        ) as occurrence
      from public.report_rewards r
      join auth.users u on u.id = r.user_id
      left join private.report_contributions c on c.kind = r.report_kind and c.report_id = r.report_id
      where r.eligible and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean, false)
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
