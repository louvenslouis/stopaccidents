-- The existing unique index on lower(alias) prevents case collisions already.
-- Keep it and the UNIQUE constraint as the final authority for concurrent saves.
lock table public.user_aliases in access exclusive mode;
alter table public.user_aliases drop constraint user_aliases_alias_check;
update public.user_aliases set alias = lower(alias) where alias <> lower(alias);
alter table public.user_aliases add constraint user_aliases_alias_check
  check (length(alias) between 4 and 40 and alias ~ '^[a-z]' and alias !~ '[^a-z0-9]');

create or replace function private.generate_user_alias(p_with_digits boolean default false)
returns text language plpgsql volatile security invoker set search_path = '' as $$
declare
  nouns text[];
  qualities text[];
  candidate text;
begin
  -- Keep both words in the same language; French nouns are masculine.
  if random() < 0.5 then
    nouns := array['Zwazo','Soley','Flanbo','Mapou','Lak','Rivye','Zetwal','Van',
      'Lanme','Pyebwa','Kolibri','Dife','Kokoye','Palmis','Woch','Bambou'];
    qualities := array['Lib','Kle','Vanyan','Djanm','Trankil','Fidel','Solid','Rapid',
      'Briyan','Saj','Dous','Vijilan','Kalm','Leje','Cho','Pridan'];
  else
    nouns := array['Colibri','Phare','Soleil','Cedre','Bambou','Ocean','Horizon','Jardin',
      'Fleuve','Rocher','Vent','Sentier','Flambeau','Palmier','Lac','Oiseau'];
    qualities := array['Serein','Libre','Calme','Fidele','Vaillant','Solide','Paisible','Clair',
      'Vif','Brillant','Sage','Doux','Vigilant','Agile','Lumineux','Prudent'];
  end if;
  candidate := nouns[1 + floor(random() * cardinality(nouns))::integer]
    || qualities[1 + floor(random() * cardinality(qualities))::integer];
  if p_with_digits then
    candidate := candidate || (1000 + floor(random() * 999000)::integer)::text;
  end if;
  return lower(candidate);
end;
$$;

-- A definer is needed to check aliases hidden by RLS. Only a boolean is exposed,
-- never the owner, email, metadata, or a list of aliases. Registered accounts only.
create function private.is_user_alias_available(p_alias text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare account uuid := private.connection_account();
begin
  if p_alias is null or length(p_alias) not between 4 and 40
    or p_alias !~ '^[a-z]' or p_alias ~ '[^a-z0-9]' then return false; end if;
  return not exists (
    select 1 from public.user_aliases where lower(alias) = p_alias and user_id <> account
  );
end;
$$;
revoke all on function private.is_user_alias_available(text) from public, anon;
grant execute on function private.is_user_alias_available(text) to authenticated;
create function public.is_user_alias_available(p_alias text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.is_user_alias_available(p_alias);
$$;
revoke all on function public.is_user_alias_available(text) from public, anon;
grant execute on function public.is_user_alias_available(text) to authenticated;

-- Suggestions use the existing word generator and are checked globally.
-- Availability is not a reservation: UNIQUE still decides at save time.
create function private.suggest_available_user_alias()
returns text language plpgsql volatile security definer set search_path = '' as $$
declare account uuid := private.connection_account(); candidate text; attempt integer;
begin
  for attempt in 1..32 loop
    candidate := private.generate_user_alias(true);
    if not exists (select 1 from public.user_aliases where lower(alias) = candidate) then
      return candidate;
    end if;
  end loop;
  raise exception 'alias_generation_unavailable';
end;
$$;
revoke all on function private.suggest_available_user_alias() from public, anon;
grant execute on function private.suggest_available_user_alias() to authenticated;
create or replace function public.suggest_user_alias()
returns text language sql volatile security invoker set search_path = '' as $$
  select private.suggest_available_user_alias();
$$;
