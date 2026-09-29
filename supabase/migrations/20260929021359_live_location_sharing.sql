-- Only the current position is retained, never a route history.
create table private.location_shares (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  token uuid not null default gen_random_uuid(),
  expires_at timestamptz not null,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  accuracy double precision check (accuracy >= 0 and accuracy < 'Infinity'::double precision),
  captured_at timestamptz
);
create table private.location_share_recipients (
  owner_id uuid references private.location_shares(owner_id) on delete cascade,
  connection_id uuid references private.user_connections(id) on delete cascade,
  primary key (owner_id, connection_id)
);
create index location_share_recipients_connection on private.location_share_recipients(connection_id);
alter table private.location_shares enable row level security;
alter table private.location_share_recipients enable row level security;
revoke all on private.location_shares, private.location_share_recipients from public, anon, authenticated;

create function private.start_location_share(p_connections uuid[], p_minutes integer)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare account uuid := private.connection_account(); share private.location_shares;
begin
  if p_minutes is null or p_minutes not in (15,60,480) or
     p_connections is null or cardinality(p_connections) = 0 or cardinality(p_connections) > 500 then
    raise exception 'location_invalid_selection' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_connections) selected(id) where selected.id is null or not exists (
    select 1 from private.user_connections c where c.id = selected.id and c.status = 'accepted'
      and account in (c.sender_id,c.recipient_id)
  )) then
    raise exception 'location_invalid_selection' using errcode = '42501';
  end if;
  -- Serializes replacement, stop and publish for this owner, including multiple devices.
  perform pg_advisory_xact_lock(hashtextextended(account::text, 731));
  insert into private.location_shares(owner_id, expires_at)
    values (account, now() + make_interval(mins => p_minutes))
    on conflict (owner_id) do update set token = gen_random_uuid(), expires_at = excluded.expires_at,
      latitude = null, longitude = null, accuracy = null, captured_at = null
    returning * into share;
  delete from private.location_share_recipients where owner_id = account;
  insert into private.location_share_recipients(owner_id,connection_id)
    select account, id from (select distinct unnest(p_connections) id) selected;
  return jsonb_build_object('token',share.token,'expires_at',share.expires_at);
end;
$$;

create function private.publish_live_location(p_token uuid, p_latitude double precision,
  p_longitude double precision, p_accuracy double precision, p_captured_at timestamptz)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare account uuid := private.connection_account();
begin
  if p_latitude is null or p_longitude is null or not (p_latitude between -90 and 90)
    or not (p_longitude between -180 and 180)
    or (p_accuracy is not null and not (p_accuracy >= 0 and p_accuracy < 'Infinity'::double precision))
    or p_captured_at is null or p_captured_at < now() - interval '90 seconds'
    or p_captured_at > now() + interval '10 seconds' then
    raise exception 'location_invalid_position' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(account::text, 731));
  update private.location_shares set latitude = p_latitude, longitude = p_longitude,
    accuracy = p_accuracy, captured_at = p_captured_at
    where owner_id = account and token = p_token and expires_at > now()
      and (captured_at is null or captured_at < p_captured_at);
  -- An older sample is ignored, without ending an otherwise active session.
  return exists (select 1 from private.location_shares
    where owner_id = account and token = p_token and expires_at > now());
end;
$$;

create function private.stop_location_share(p_token uuid default null)
returns void language plpgsql volatile security definer set search_path = '' as $$
declare account uuid := private.connection_account();
begin
  perform pg_advisory_xact_lock(hashtextextended(account::text, 731));
  delete from private.location_shares where owner_id = account and (p_token is null or token = p_token);
end;
$$;

create function private.read_location_shares()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare account uuid := private.connection_account();
begin
  return jsonb_build_object(
    'outgoing', (select jsonb_build_object('expires_at',s.expires_at,
      'connections', (select coalesce(jsonb_agg(r.connection_id),'[]'::jsonb)
        from private.location_share_recipients r where r.owner_id = account))
      from private.location_shares s where s.owner_id = account and s.expires_at > now()),
    'incoming', (select coalesce(jsonb_agg(jsonb_build_object(
      'connection_id',c.id,'alias',a.alias,'latitude',s.latitude,'longitude',s.longitude,
      'accuracy',s.accuracy,'captured_at',s.captured_at,'expires_at',s.expires_at)),'[]'::jsonb)
      from private.location_share_recipients r
      join private.location_shares s on s.owner_id = r.owner_id
      join private.user_connections c on c.id = r.connection_id and c.status = 'accepted'
      join public.user_aliases a on a.user_id = s.owner_id
      where account in (c.sender_id,c.recipient_id) and s.owner_id <> account
        and s.owner_id in (c.sender_id,c.recipient_id) and s.expires_at > now()
        and s.captured_at > now() - interval '90 seconds')
  );
end;
$$;

create function public.start_location_share(p_connections uuid[], p_minutes integer)
returns jsonb language sql volatile security invoker set search_path = '' as $$
  select private.start_location_share(p_connections,p_minutes);
$$;
create function public.publish_live_location(p_token uuid, p_latitude double precision,
  p_longitude double precision, p_accuracy double precision, p_captured_at timestamptz)
returns boolean language sql volatile security invoker set search_path = '' as $$
  select private.publish_live_location(p_token,p_latitude,p_longitude,p_accuracy,p_captured_at);
$$;
create function public.stop_location_share(p_token uuid default null)
returns void language sql volatile security invoker set search_path = '' as $$
  select private.stop_location_share(p_token);
$$;
create function public.read_location_shares()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.read_location_shares();
$$;

revoke all on function private.start_location_share(uuid[],integer),
  private.publish_live_location(uuid,double precision,double precision,double precision,timestamptz),
  private.stop_location_share(uuid), private.read_location_shares(),
  public.start_location_share(uuid[],integer),
  public.publish_live_location(uuid,double precision,double precision,double precision,timestamptz),
  public.stop_location_share(uuid), public.read_location_shares() from public, anon, authenticated;
grant execute on function private.start_location_share(uuid[],integer),
  private.publish_live_location(uuid,double precision,double precision,double precision,timestamptz),
  private.stop_location_share(uuid), private.read_location_shares(),
  public.start_location_share(uuid[],integer),
  public.publish_live_location(uuid,double precision,double precision,double precision,timestamptz),
  public.stop_location_share(uuid), public.read_location_shares() to authenticated;
