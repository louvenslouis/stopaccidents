-- Initial administrator explicitly designated by the project owner.
with appointed as (
  insert into private.report_event_moderators(user_id,role)
  select u.id,'admin' from auth.users u
  where lower(to_jsonb(u)->>'email')='louvenslouisl@gmail.com'
    and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false)
  on conflict(user_id) do update set role=excluded.role
  returning user_id
)
insert into private.role_changes(actor_id,user_id,role)
select null,user_id,'admin' from appointed;
