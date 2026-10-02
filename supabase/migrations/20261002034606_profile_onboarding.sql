-- Existing registered accounts keep their current profile. New accounts and
-- existing guests choose their identity when they become registered users.
alter table public.user_aliases
  add column onboarding_step text not null default 'alias'
    check (onboarding_step in ('alias', 'avatar', 'complete'));
update public.user_aliases a set onboarding_step = 'complete'
  from auth.users u where u.id = a.user_id and u.is_anonymous is false;

alter table public.user_aliases drop constraint user_aliases_alias_check;
alter table public.user_aliases add constraint user_aliases_alias_check
  check (alias ~ '^[A-Za-z][A-Za-z0-9]{3,39}$');

grant update (alias, onboarding_step) on public.user_aliases to authenticated;
create policy user_aliases_update_own on public.user_aliases
  for update to authenticated
  using (user_id = (select auth.uid()) and
    coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'is_anonymous')::boolean, false) is false)
  with check (user_id = (select auth.uid()) and
    coalesce((nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'is_anonymous')::boolean, false) is false);

-- Reuse the existing generator; a suggestion does not change the saved alias.
-- This function only generates random words and reads no user data.
grant usage on schema private to authenticated;
grant execute on function private.generate_user_alias(boolean) to authenticated;
create function public.suggest_user_alias()
returns text language sql volatile security invoker set search_path = '' as $$
  select private.generate_user_alias(true) where auth.uid() is not null;
$$;
revoke all on function public.suggest_user_alias() from public, anon;
grant execute on function public.suggest_user_alias() to authenticated;
