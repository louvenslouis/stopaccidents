-- Only accepted connections share their email with each other.
create or replace function private.read_my_connections()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare account uuid := private.connection_account();
begin
  return jsonb_build_object(
    'alias', (select alias from public.user_aliases where user_id = account),
    'connections', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'alias', a.alias, 'status', c.status,
      'email', case when c.status = 'accepted' then u.email else null end,
      'direction', case when c.sender_id = account then 'outgoing' else 'incoming' end,
      'created_at', c.created_at
    ) order by c.created_at desc, c.id), '[]'::jsonb)
    from private.user_connections c
    join public.user_aliases a on a.user_id = case when c.sender_id = account
      then c.recipient_id else c.sender_id end
    join auth.users u on u.id = a.user_id
    where c.sender_id = account or c.recipient_id = account)
  );
end;
$$;

