-- Home and work addresses are private account data. Each account owns exactly
-- one row, and the Data API can only access the row selected by auth.uid().
create table public.user_saved_places (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  home_address text not null default '',
  work_address text not null default '',
  updated_at timestamptz not null default now(),
  constraint user_saved_places_home_length check (
    char_length(home_address) <= 500 and
    (home_address = '' or char_length(trim(home_address)) >= 3)
  ),
  constraint user_saved_places_work_length check (
    char_length(work_address) <= 500 and
    (work_address = '' or char_length(trim(work_address)) >= 3)
  ),
  constraint user_saved_places_not_empty check (
    home_address <> '' or work_address <> ''
  )
);

alter table public.user_saved_places enable row level security;
revoke all on public.user_saved_places from anon, authenticated;
grant select on public.user_saved_places to authenticated;
grant insert (user_id, home_address, work_address) on public.user_saved_places to authenticated;
grant update (user_id, home_address, work_address, updated_at) on public.user_saved_places to authenticated;

create policy user_saved_places_read_own
  on public.user_saved_places for select to authenticated
  using (user_id = (select auth.uid()));
create policy user_saved_places_insert_own
  on public.user_saved_places for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy user_saved_places_update_own
  on public.user_saved_places for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

comment on table public.user_saved_places is
  'Private home and work addresses saved by an authenticated user.';
