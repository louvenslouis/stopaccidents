-- Expose only avatar appearance, never arbitrary account metadata.
create or replace function private.profile_avatar(account uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select (select jsonb_object_agg(key, value) from jsonb_each(
    case when jsonb_typeof(u.raw_user_meta_data->'avatar') = 'object'
      then u.raw_user_meta_data->'avatar' else '{}'::jsonb end)
    where key in ('version','skin','hair','hairColor','expression','beard','glasses','background')
      and jsonb_typeof(value) in ('string','number') and length(value::text) < 64)
  from auth.users u where u.id = account and not u.is_anonymous;
$$;
revoke all on function private.profile_avatar(uuid) from public, anon, authenticated;

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
      select alias, points, private.profile_avatar(user_id) as avatar, coalesce(user_id = viewer, false) as is_me,
        row_number() over(order by points desc, reached_at, alias collate "C") as rank
      from scores
    )
    select jsonb_build_object(
      'entries', (select coalesce(jsonb_agg(to_jsonb(page) order by rank), '[]'::jsonb)
        from (select * from ranked where rank <= 100 order by rank limit 100 offset p_offset) page),
      'total', (select count(*) from ranked),
      'me', coalesce((select to_jsonb(mine) from ranked mine where is_me),
        (select jsonb_build_object('alias', alias, 'avatar', private.profile_avatar(user_id), 'points', 0, 'rank', null, 'is_me', true)
          from public.user_aliases where user_id = viewer))
    )
  );
end;
$$;

-- Only accepted connections share their email with each other.
create or replace function private.read_my_connections()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare account uuid := private.connection_account();
begin
  return jsonb_build_object(
    'alias', (select alias from public.user_aliases where user_id = account),
    'connections', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', c.id, 'alias', a.alias, 'avatar', private.profile_avatar(a.user_id), 'status', c.status,
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


create or replace function private.read_report_comments(p_kind text,p_report_id uuid,p_root_id uuid default null,p_after uuid default null,p_flagged boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare event uuid; moderator boolean; result jsonb;
begin
 select private.report_event_root(c.event_id) into event from private.report_contributions c
 where c.kind=p_kind and c.report_id=p_report_id and c.published and private.publication_visible(c.kind,c.report_id);
 if event is null then raise exception 'Publication unavailable' using errcode='22023'; end if;
 moderator := auth.uid() is not null and private.current_app_role() in ('moderator','admin');
 if p_flagged and not moderator then raise exception 'Moderator required' using errcode='42501'; end if;
 with recursive family as (
  select event id union all select e.id from private.report_events e join family f on e.merged_into=f.id
 ), page as (
  select c.* from private.report_comments c join family f on f.id=c.event_id
  where (case when p_flagged then exists(select 1 from private.report_comment_flags cf where cf.comment_id=c.id and cf.resolved_at is null)
   else c.root_id is not distinct from p_root_id end)
   and (p_after is null or (c.created_at,c.id) < (select a.created_at,a.id from private.report_comments a where a.id=p_after))
  order by c.created_at desc,c.id desc limit 31
 ), items as (select * from page order by created_at desc,id desc limit 30)
 select jsonb_build_object(
  'items',coalesce((select jsonb_agg(jsonb_build_object(
   'id',c.id,'parent_id',c.parent_id,'root_id',c.root_id,
   'alias',case when c.deleted_at is null then coalesce(a.alias,'Compte supprimé') else null end,
   'avatar',case when c.deleted_at is null then private.profile_avatar(c.author_id) else null end,
   'reply_to',case when parent.deleted_at is null then pa.alias else null end,
   'body',case when c.deleted_at is not null or (c.hidden_at is not null and not moderator) then null else c.body end,
   'created_at',c.created_at,'edited_at',c.edited_at,'deleted',c.deleted_at is not null,'hidden',c.hidden_at is not null,
   'mine',coalesce(c.author_id=auth.uid(),false),
   'likes',(select count(*) from private.report_comment_likes l where l.comment_id=c.id),
   'liked',exists(select 1 from private.report_comment_likes l where l.comment_id=c.id and l.user_id=auth.uid()),
   'flagged',exists(select 1 from private.report_comment_flags cf where cf.comment_id=c.id and cf.user_id=auth.uid()),
   'replies',(select count(*) from private.report_comments r where r.root_id=c.id),
   'flags',case when moderator then (select coalesce(jsonb_agg(cf.reason order by cf.created_at),'[]'::jsonb) from private.report_comment_flags cf where cf.comment_id=c.id and cf.resolved_at is null) else '[]'::jsonb end
  ) order by c.created_at desc,c.id desc) from items c left join public.user_aliases a on a.user_id=c.author_id
    left join private.report_comments parent on parent.id=c.parent_id left join public.user_aliases pa on pa.user_id=parent.author_id),'[]'::jsonb),
  'has_more',(select count(*)>30 from page),
  'total',(select count(*) from private.report_comments c join family f on f.id=c.event_id where c.deleted_at is null and c.hidden_at is null),
  'can_comment',exists(select 1 from auth.users u where u.id=auth.uid() and not u.is_anonymous),
  'is_moderator',moderator
 ) into result;
 return result;
end;
$$;
