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

-- Preserve each environment's existing RPC behavior while adding appearance.
do $migration$
declare target regprocedure; definition text;
begin
  foreach target in array array[
    'private.read_leaderboard(text,text,integer)'::regprocedure,
    'private.read_my_connections()'::regprocedure,
    'private.read_report_comments(text,uuid,uuid,uuid,boolean)'::regprocedure
  ] loop
    definition := pg_get_functiondef(target);
    if position('private.profile_avatar(' in definition) > 0 then continue; end if;
    definition := replace(definition,
      'select alias, points, coalesce(user_id = viewer, false) as is_me,',
      'select alias, points, private.profile_avatar(user_id) as avatar, coalesce(user_id = viewer, false) as is_me,');
    definition := replace(definition,
      '''alias'', alias, ''points'', 0',
      '''alias'', alias, ''avatar'', private.profile_avatar(user_id), ''points'', 0');
    definition := replace(definition,
      '''id'', c.id, ''alias'', a.alias,',
      '''id'', c.id, ''alias'', a.alias, ''avatar'', private.profile_avatar(a.user_id),');
    definition := replace(definition,
      '''reply_to'',case',
      '''avatar'',case when c.deleted_at is null then private.profile_avatar(c.author_id) else null end, ''reply_to'',case');
    if position('private.profile_avatar(' in definition) = 0 then
      raise exception 'Avatar projection could not be added to %', target;
    end if;
    execute definition;
  end loop;
end;
$migration$;
