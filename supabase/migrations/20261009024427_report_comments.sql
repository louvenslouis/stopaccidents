-- Private storage: the RPC projection exposes aliases, never account IDs or voter identities.
create table private.report_comments (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references private.report_events(id) on delete cascade,
 author_id uuid references auth.users(id) on delete set null,
 parent_id uuid references private.report_comments(id),
 root_id uuid references private.report_comments(id),
 body text not null check (char_length(body) <= 2000),
 created_at timestamptz not null default now(), edited_at timestamptz,
 deleted_at timestamptz, hidden_at timestamptz,
 hidden_by uuid references auth.users(id) on delete set null,
 check ((parent_id is null) = (root_id is null))
);
create index report_comments_event_page_idx on private.report_comments(event_id,created_at,id) where root_id is null;
create index report_comments_thread_page_idx on private.report_comments(root_id,created_at,id);
create index report_comments_parent_idx on private.report_comments(parent_id);
create index report_comments_author_idx on private.report_comments(author_id,created_at);
create index report_comments_hidden_by_idx on private.report_comments(hidden_by);
create table private.report_comment_likes (
 comment_id uuid not null references private.report_comments(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 primary key(comment_id,user_id)
);
create index report_comment_likes_user_idx on private.report_comment_likes(user_id);
create table private.report_comment_flags (
 comment_id uuid not null references private.report_comments(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 reason text not null check(char_length(btrim(reason)) between 3 and 500),
 created_at timestamptz not null default now(), resolved_at timestamptz,
 primary key(comment_id,user_id)
);
create index report_comment_flags_user_idx on private.report_comment_flags(user_id);
alter table private.report_comments enable row level security;
alter table private.report_comment_likes enable row level security;
alter table private.report_comment_flags enable row level security;
revoke all on private.report_comments,private.report_comment_likes,private.report_comment_flags from public,anon,authenticated;

create function private.read_report_comments(p_kind text,p_report_id uuid,p_root_id uuid default null,p_after uuid default null,p_flagged boolean default false)
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
create function public.read_report_comments(p_kind text,p_report_id uuid,p_root_id uuid default null,p_after uuid default null,p_flagged boolean default false)
returns jsonb language sql stable security invoker set search_path='' as $$
 select private.read_report_comments(p_kind,p_report_id,p_root_id,p_after,p_flagged);
$$;

create function private.write_report_comment(p_kind text,p_report_id uuid,p_action text,p_id uuid,p_body text default null,p_parent_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare event uuid; anchor uuid; target private.report_comments%rowtype; parent private.report_comments%rowtype; moderator boolean;
begin
 if not exists(select 1 from auth.users u where u.id=auth.uid() and not u.is_anonymous) then
  raise exception 'Registered account required' using errcode='42501'; end if;
 -- Serializes account writes for rate limits/idempotency, and shares the existing merge lock.
 perform pg_advisory_xact_lock(hashtextextended('report-event-merges',0));
 perform pg_advisory_xact_lock(hashtextextended('comments:'||auth.uid()::text,0));
 select private.report_event_root(c.event_id),c.event_id into event,anchor from private.report_contributions c
 where c.kind=p_kind and c.report_id=p_report_id and c.published and private.publication_visible(c.kind,c.report_id);
 if event is null then raise exception 'Publication unavailable' using errcode='22023'; end if;
 if p_id is null then raise exception 'Comment ID required' using errcode='22023'; end if;
 moderator := private.current_app_role() in ('moderator','admin');
 select * into target from private.report_comments where id=p_id for update;
 if p_action='create' then
  if target.id is not null then
   if target.author_id=auth.uid() and private.report_event_root(target.event_id)=event
    and target.parent_id is not distinct from p_parent_id then return target.id; end if;
   raise exception 'Comment ID conflict' using errcode='42501';
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 2000 then raise exception 'Invalid comment' using errcode='22023'; end if;
  if (select count(*) from private.report_comments where author_id=auth.uid() and created_at>now()-interval '1 minute')>=10 then
   raise exception 'Too many comments' using errcode='P0001'; end if;
  if p_parent_id is not null then
   select * into parent from private.report_comments where id=p_parent_id for update;
   if parent.id is null or private.report_event_root(parent.event_id)<>event or parent.deleted_at is not null or parent.hidden_at is not null then
    raise exception 'Reply unavailable' using errcode='22023'; end if;
   -- Preserve the original branch through event merges and reversals.
   anchor := parent.event_id;
  end if;
  insert into private.report_comments(id,event_id,author_id,parent_id,root_id,body)
   values(p_id,anchor,auth.uid(),p_parent_id,coalesce(parent.root_id,parent.id),btrim(p_body));
  return p_id;
 end if;
 if target.id is null or private.report_event_root(target.event_id)<>event then raise exception 'Comment unavailable' using errcode='22023'; end if;
 if p_action in ('edit','delete') then
  if target.author_id is distinct from auth.uid() then raise exception 'Comment owner required' using errcode='42501'; end if;
  if p_action='delete' then
   update private.report_comments set body='',deleted_at=coalesce(deleted_at,now()) where id=p_id;
   delete from private.report_comment_likes where comment_id=p_id;
  else
   if target.deleted_at is not null or target.hidden_at is not null then raise exception 'Comment unavailable' using errcode='22023'; end if;
   if p_body is null or char_length(btrim(p_body)) not between 1 and 2000 then raise exception 'Invalid comment' using errcode='22023'; end if;
   update private.report_comments set body=btrim(p_body),edited_at=now() where id=p_id;
  end if;
 elsif p_action in ('hide','restore','dismiss_flags') then
  if not moderator then raise exception 'Moderator required' using errcode='42501'; end if;
  if p_action<>'dismiss_flags' then
   update private.report_comments set hidden_at=case when p_action='hide' then now() end,hidden_by=case when p_action='hide' then auth.uid() end where id=p_id;
  end if;
  update private.report_comment_flags set resolved_at=now() where comment_id=p_id and resolved_at is null;
 elsif p_action='unlike' then
  delete from private.report_comment_likes where comment_id=p_id and user_id=auth.uid();
 elsif p_action in ('like','flag') then
  if target.deleted_at is not null or target.hidden_at is not null then raise exception 'Comment unavailable' using errcode='22023'; end if;
  if target.author_id=auth.uid() then raise exception 'Own comment' using errcode='42501'; end if;
  if p_action='like' then
   insert into private.report_comment_likes(comment_id,user_id) values(p_id,auth.uid()) on conflict do nothing;
  else
   if p_body is null or char_length(btrim(p_body)) not between 3 and 500 then raise exception 'Invalid reason' using errcode='22023'; end if;
   insert into private.report_comment_flags(comment_id,user_id,reason) values(p_id,auth.uid(),btrim(p_body)) on conflict do nothing;
  end if;
 else raise exception 'Invalid action' using errcode='22023';
 end if;
 return p_id;
end;
$$;
create function public.write_report_comment(p_kind text,p_report_id uuid,p_action text,p_id uuid,p_body text default null,p_parent_id uuid default null)
returns uuid language sql security invoker set search_path='' as $$
 select private.write_report_comment(p_kind,p_report_id,p_action,p_id,p_body,p_parent_id);
$$;
revoke all on function private.read_report_comments(text,uuid,uuid,uuid,boolean),public.read_report_comments(text,uuid,uuid,uuid,boolean),
 private.write_report_comment(text,uuid,text,uuid,text,uuid),public.write_report_comment(text,uuid,text,uuid,text,uuid) from public,anon,authenticated;
grant execute on function private.read_report_comments(text,uuid,uuid,uuid,boolean),public.read_report_comments(text,uuid,uuid,uuid,boolean) to anon,authenticated;
grant execute on function private.write_report_comment(text,uuid,text,uuid,text,uuid),public.write_report_comment(text,uuid,text,uuid,text,uuid) to authenticated;
