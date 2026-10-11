-- Keep the existing profile API while persisting only ciphertext and keyed lookups.
lock table public.user_aliases in access exclusive mode;
alter table public.user_aliases set schema private;
alter table private.user_aliases rename to user_alias_data;
drop policy user_aliases_read_own on private.user_alias_data;
drop policy user_aliases_update_own on private.user_alias_data;
revoke all on private.user_alias_data from public,anon,authenticated,service_role;
revoke update(alias,onboarding_step) on private.user_alias_data from authenticated;
drop index private.user_aliases_case_insensitive;
alter table private.user_alias_data drop constraint user_aliases_alias_check;
alter table private.user_alias_data rename column alias to alias_lookup;
alter table private.user_alias_data add column encrypted_alias text;

-- Separate namespace from safety identifiers; valid aliases are ASCII alphanumeric.
create function private.alias_lookup(p_alias text) returns text
language sql stable security invoker set search_path='' as $$
 select private.safety_lookup('user-alias',lower(p_alias));
$$;
revoke all on function private.alias_lookup(text) from public,anon,authenticated,service_role;
update private.user_alias_data set encrypted_alias=private.encrypt_user_data(to_jsonb(alias_lookup),'alias:'||user_id),
 alias_lookup=private.alias_lookup(alias_lookup);
alter table private.user_alias_data alter column encrypted_alias set not null;
alter table private.user_alias_data add constraint user_alias_data_encrypted check
 (alias_lookup ~ '^[a-f0-9]{64}$' and encrypted_alias like 'enc:1:%');

-- Only trusted backend functions can use this plaintext projection. No plaintext is stored.
create view private.user_aliases with (security_invoker=true) as
 select user_id,private.decrypt_user_data(encrypted_alias,'alias:'||user_id)#>>'{}' as alias,
 created_at,onboarding_step from private.user_alias_data;
revoke all on private.user_aliases from public,anon,authenticated,service_role;

-- Existing public read endpoints retain their authorization and response shape.
-- Rewrite only the relation name in their current definitions, preserving deployed fixes.
do $$ declare f record; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname in ('read_report_event','read_report_comments',
 'read_my_connections','read_leaderboard','read_safety_alerts','read_location_shares') loop
 execute replace(pg_get_functiondef(f.oid),'public.user_aliases','private.user_aliases');
 end loop;
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='private' and p.proname in ('is_user_alias_available','suggest_available_user_alias','invite_connection') loop
 execute replace(replace(replace(replace(replace(pg_get_functiondef(f.oid),
 'public.user_aliases','private.user_alias_data'),
 'lower(alias) = p_alias','alias_lookup = private.alias_lookup(p_alias)'),
 'lower(alias) = candidate','alias_lookup = private.alias_lookup(candidate)'),
 'lower(a.alias) = lower(btrim(p_alias))','a.alias_lookup = private.alias_lookup(btrim(p_alias))'),
 'CREATE FUNCTION','CREATE OR REPLACE FUNCTION');
 end loop;
end $$;

create or replace function private.assign_user_alias(p_user_id uuid)
returns text language plpgsql volatile security invoker set search_path='' as $$
declare existing_alias text; candidate text; assigned uuid; attempt integer;
begin
 select alias into existing_alias from private.user_aliases where user_id=p_user_id;
 if existing_alias is not null then return existing_alias; end if;
 for attempt in 1..32 loop
  candidate:=private.generate_user_alias(attempt>4);
  insert into private.user_alias_data(user_id,alias_lookup,encrypted_alias)
  values(p_user_id,private.alias_lookup(candidate),private.encrypt_user_data(to_jsonb(candidate),'alias:'||p_user_id))
  on conflict do nothing returning user_id into assigned;
  if assigned is not null then return candidate; end if;
  select alias into existing_alias from private.user_aliases where user_id=p_user_id;
  if existing_alias is not null then return existing_alias; end if;
 end loop;
 raise exception 'Unable to assign a unique alias' using errcode='23505';
end $$;

-- The compatibility view delegates to an owner-scoped function, never a generic decrypt RPC.
create function private.read_own_alias()
returns table(user_id uuid,alias text,created_at timestamptz,onboarding_step text)
language sql stable security definer set search_path='' as $$
 select a.user_id,private.decrypt_user_data(a.encrypted_alias,'alias:'||a.user_id)#>>'{}',
 a.created_at,a.onboarding_step from private.user_alias_data a where a.user_id=(select auth.uid());
$$;
revoke all on function private.read_own_alias() from public,anon,service_role;
grant execute on function private.read_own_alias() to authenticated;
create view public.user_aliases with (security_invoker=true,security_barrier=true) as
 select * from private.read_own_alias();
revoke all on public.user_aliases from public,anon,authenticated,service_role;
grant select,update(alias,onboarding_step) on public.user_aliases to authenticated;

create function private.update_own_alias() returns trigger
language plpgsql security definer set search_path='' as $$
declare account uuid:=auth.uid();
begin
 -- Check the current Auth record as well as JWT; guests cannot edit aliases.
 if account is null or old.user_id<>account or not exists
 (select 1 from auth.users where id=account and not is_anonymous)
 or coalesce((nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'is_anonymous')::boolean,false)
 then return null; end if;
 if new.user_id is distinct from old.user_id or new.created_at is distinct from old.created_at
 then raise exception 'alias_owner_immutable' using errcode='42501'; end if;
 if new.alias is null or length(new.alias) not between 4 and 40
 or new.alias !~ '^[a-z]' or new.alias ~ '[^a-z0-9]'
 then raise exception 'alias_invalid' using errcode='23514'; end if;
 update private.user_alias_data set
 alias_lookup=case when new.alias is distinct from old.alias then private.alias_lookup(new.alias) else alias_lookup end,
 encrypted_alias=case when new.alias is distinct from old.alias
 then private.encrypt_user_data(to_jsonb(new.alias),'alias:'||account) else encrypted_alias end,
 onboarding_step=case when new.onboarding_step is distinct from old.onboarding_step then new.onboarding_step else onboarding_step end
 where user_id=account
 returning private.decrypt_user_data(encrypted_alias,'alias:'||user_id)#>>'{}',onboarding_step
 into new.alias,new.onboarding_step;
 return new;
end $$;
revoke all on function private.update_own_alias() from public,anon,authenticated,service_role;
create trigger update_own_alias instead of update on public.user_aliases
 for each row execute function private.update_own_alias();

-- Include aliases in the existing administrative batch rotation without changing its API.
alter function private.reencrypt_user_data_batch(integer) rename to reencrypt_user_data_without_aliases;
create function private.reencrypt_user_data_batch(p_limit integer default 100) returns integer
language plpgsql security invoker set search_path='' as $$
declare count_rows integer; total integer; active_version integer;
begin
 total:=private.reencrypt_user_data_without_aliases(p_limit);
 select version into strict active_version from private.data_encryption_keys where active;
 with batch as (select user_id from private.user_alias_data
 where split_part(encrypted_alias,':',3)::integer<>active_version
 order by user_id limit p_limit for update skip locked)
 update private.user_alias_data a set encrypted_alias=private.encrypt_user_data(
 private.decrypt_user_data(a.encrypted_alias,'alias:'||a.user_id),'alias:'||a.user_id)
 from batch b where a.user_id=b.user_id;
 get diagnostics count_rows=row_count;
 return total+count_rows;
end $$;
revoke all on function private.reencrypt_user_data_batch(integer),private.reencrypt_user_data_without_aliases(integer)
 from public,anon,authenticated,service_role;
-- Fail closed if a future/deployed function was missed by the explicit rewrite list.
do $$ begin
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('private','public') and p.prokind='f' and p.prosrc like '%public.user_aliases%')
 then raise exception 'Unmigrated alias consumer'; end if;
end $$;
notify pgrst,'reload schema';
