-- Rewards are written only by completion triggers, in the report transaction.
create table public.report_rewards (
  report_kind text not null check (report_kind in ('accident', 'kidnapping', 'barricade', 'armed_presence', 'suspicious_vehicle')),
  report_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  points integer not null default 25 check (points = 25),
  created_at timestamptz not null default now(),
  primary key (report_kind, report_id)
);
create index report_rewards_user_idx on public.report_rewards(user_id);
alter table public.report_rewards enable row level security;
revoke all on public.report_rewards from public, anon, authenticated;
grant select on public.report_rewards to authenticated;
create policy rewards_read_own on public.report_rewards for select to authenticated
  using (user_id = (select auth.uid()));

create function private.reward_completed_report()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or auth.uid() <> new.reporter_id then
    -- Administrative edits must not award points or block report maintenance.
    return new;
  end if;
  if new.completed_step = tg_argv[1]::integer then
    insert into public.report_rewards(report_kind, report_id, user_id)
      values (tg_argv[0], new.id, new.reporter_id)
      on conflict (report_kind, report_id) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function private.reward_completed_report() from public, anon, authenticated;

create trigger accident_reward after insert or update of completed_step on public.accident_reports
  for each row execute function private.reward_completed_report('accident', '4');
create trigger kidnapping_reward after insert or update of completed_step on public.kidnapping_reports
  for each row execute function private.reward_completed_report('kidnapping', '3');
create trigger barricade_reward after insert or update of completed_step on public.barricade_reports
  for each row execute function private.reward_completed_report('barricade', '3');
create trigger armed_presence_reward after insert or update of completed_step on public.armed_presence_reports
  for each row execute function private.reward_completed_report('armed_presence', '3');
create trigger suspicious_vehicle_reward after insert or update of completed_step on public.suspicious_vehicle_reports
  for each row execute function private.reward_completed_report('suspicious_vehicle', '3');

create function public.read_my_rewards(p_report_id uuid default null, p_report_kind text default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'total', coalesce(sum(points), 0),
    'count', count(*),
    'earned', coalesce(max(points) filter (where report_id = p_report_id and report_kind = p_report_kind), 0)
  ) from public.report_rewards where user_id = (select auth.uid());
$$;
revoke all on function public.read_my_rewards(uuid, text) from public, anon, authenticated;
grant execute on function public.read_my_rewards(uuid, text) to authenticated;
