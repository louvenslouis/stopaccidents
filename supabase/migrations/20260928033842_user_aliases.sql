-- Alias assignments stay private; published testimony exposes only the alias.
create table public.user_aliases (
  user_id uuid primary key references auth.users(id) on delete cascade,
  alias text not null unique check (alias ~ '^[A-Z][A-Za-z0-9]{3,39}$'),
  created_at timestamptz not null default now()
);
alter table public.user_aliases enable row level security;
revoke all on public.user_aliases from public, anon, authenticated;
grant select on public.user_aliases to authenticated;
create policy user_aliases_read_own on public.user_aliases for select to authenticated
  using (user_id = (select auth.uid()));

create function private.generate_user_alias(p_with_digits boolean default false)
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
  return candidate;
end;
$$;

create function private.assign_user_alias(p_user_id uuid)
returns text language plpgsql volatile security invoker set search_path = '' as $$
declare
  existing_alias text;
  assigned_alias text;
  attempt integer;
begin
  select alias into existing_alias from public.user_aliases where user_id = p_user_id;
  if existing_alias is not null then return existing_alias; end if;
  for attempt in 1..32 loop
    insert into public.user_aliases(user_id, alias)
    values (p_user_id, private.generate_user_alias(attempt > 4))
    on conflict do nothing returning alias into assigned_alias;
    if assigned_alias is not null then return assigned_alias; end if;
    -- Concurrent assignments for one account reuse the winner's alias.
    select alias into existing_alias from public.user_aliases where user_id = p_user_id;
    if existing_alias is not null then return existing_alias; end if;
  end loop;
  raise exception 'Unable to assign a unique alias' using errcode = '23505';
end;
$$;

create function private.assign_new_user_alias()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Trigger-only entry point, also used for anonymous Auth accounts.
  perform private.assign_user_alias(new.id);
  return new;
end;
$$;
revoke all on function private.generate_user_alias(boolean), private.assign_user_alias(uuid),
  private.assign_new_user_alias() from public, anon, authenticated;
create trigger assign_user_alias after insert on auth.users
  for each row execute function private.assign_new_user_alias();

-- Existing accounts receive the same treatment as future signups.
do $$ declare account record; begin
  for account in select id from auth.users loop
    perform private.assign_user_alias(account.id);
  end loop;
end $$;

create or replace function private.read_report_event(p_kind text, p_report_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare event uuid; moderator boolean;
begin
  select private.report_event_root(event_id) into event from private.report_contributions
    where kind = p_kind and report_id = p_report_id and published;
  if event is null then return null; end if;
  moderator := (private.current_app_role() in ('moderator', 'admin'));
  return jsonb_build_object('event_id', event, 'is_moderator', moderator,
    'summary', (select s from private.event_summaries() s where (s->>'event_id')::uuid = event),
    'contributions', (select coalesce(jsonb_agg(
      c.summary || jsonb_build_object('author_alias', a.alias)
      order by c.created_at desc, c.report_id), '[]'::jsonb)
      from private.report_contributions c left join public.user_aliases a on a.user_id = c.reporter_id
      where c.published and private.report_event_root(c.event_id) = event),
    'merges', case when moderator then (select coalesce(jsonb_agg(
      jsonb_build_object('id', m.id, 'reason', m.reason, 'created_at', m.created_at)), '[]'::jsonb)
      from private.report_event_merges m where undone_at is null
        and private.report_event_root(m.target_id) = event) else '[]'::jsonb end);
end;
$$;
