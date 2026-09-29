-- The API exposes aliases and invitation IDs, never another account's UUID/email.
create table private.user_connections (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  check (sender_id <> recipient_id),
  check ((status = 'accepted') = (accepted_at is not null))
);
alter table private.user_connections enable row level security;
revoke all on private.user_connections from public, anon, authenticated;
create unique index user_connections_pair on private.user_connections
  (least(sender_id, recipient_id), greatest(sender_id, recipient_id));
create index user_connections_sender on private.user_connections(sender_id, created_at desc);
create index user_connections_recipient on private.user_connections(recipient_id, created_at desc);
create unique index user_aliases_case_insensitive on public.user_aliases(lower(alias));

create function private.connection_account()
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare account uuid := auth.uid();
begin
  if account is null or not exists (
    select 1 from auth.users where id = account and is_anonymous is false
  ) then
    raise exception 'connection_account_required' using errcode = '42501';
  end if;
  return account;
end;
$$;

create function private.read_my_connections()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare account uuid := private.connection_account();
begin
  return jsonb_build_object(
    'alias', (select alias from public.user_aliases where user_id = account),
    'connections', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'alias', a.alias, 'status', c.status,
      'direction', case when c.sender_id = account then 'outgoing' else 'incoming' end,
      'created_at', c.created_at
    ) order by c.created_at desc, c.id), '[]'::jsonb)
    from private.user_connections c
    join public.user_aliases a on a.user_id = case when c.sender_id = account
      then c.recipient_id else c.sender_id end
    where c.sender_id = account or c.recipient_id = account)
  );
end;
$$;

create function private.invite_connection(p_alias text)
returns uuid language plpgsql volatile security definer set search_path = '' as $$
declare
  account uuid := private.connection_account();
  recipient uuid;
  invitation uuid;
begin
  if p_alias is null or btrim(p_alias) !~ '^[A-Za-z][A-Za-z0-9]{3,39}$' then
    raise exception 'connection_invalid_alias' using errcode = '22023';
  end if;
  select a.user_id into recipient from public.user_aliases a
    join auth.users u on u.id = a.user_id and u.is_anonymous is false
    where lower(a.alias) = lower(btrim(p_alias));
  if recipient is null then
    raise exception 'connection_alias_not_found' using errcode = '22023';
  end if;
  if recipient = account then
    raise exception 'connection_self_invitation' using errcode = '22023';
  end if;
  -- The unordered unique pair also protects against simultaneous reverse invites.
  insert into private.user_connections(sender_id, recipient_id) values (account, recipient)
    on conflict do nothing returning id into invitation;
  if invitation is null then
    raise exception 'connection_already_exists' using errcode = '23505';
  end if;
  return invitation;
end;
$$;

create function private.respond_connection(p_id uuid, p_action text)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare account uuid := private.connection_account();
begin
  if p_action = 'accept' then
    update private.user_connections set status = 'accepted', accepted_at = now()
      where id = p_id and recipient_id = account and status = 'pending';
  elsif p_action = 'decline' then
    delete from private.user_connections
      where id = p_id and recipient_id = account and status = 'pending';
  elsif p_action = 'cancel' then
    delete from private.user_connections
      where id = p_id and sender_id = account and status = 'pending';
  else
    raise exception 'connection_invalid_action' using errcode = '22023';
  end if;
  if not found then
    raise exception 'connection_invitation_unavailable' using errcode = '42501';
  end if;
end;
$$;

-- Only the private implementations need privileged access to account mappings.
create function public.read_my_connections()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.read_my_connections();
$$;
create function public.invite_connection(p_alias text)
returns uuid language sql volatile security invoker set search_path = '' as $$
  select private.invite_connection(p_alias);
$$;
create function public.respond_connection(p_id uuid, p_action text)
returns void language sql volatile security invoker set search_path = '' as $$
  select private.respond_connection(p_id, p_action);
$$;

revoke all on function private.connection_account(), private.read_my_connections(),
  private.invite_connection(text), private.respond_connection(uuid, text),
  public.read_my_connections(), public.invite_connection(text), public.respond_connection(uuid, text)
  from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.read_my_connections(), private.invite_connection(text),
  private.respond_connection(uuid, text), public.read_my_connections(),
  public.invite_connection(text), public.respond_connection(uuid, text) to authenticated;
