begin;
insert into auth.users(id) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}',
  true
);

insert into public.user_saved_places(user_id, home_address, work_address) values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  '12, Rue Capois, Port-au-Prince',
  'Delmas 33, Port-au-Prince'
) on conflict (user_id) do update set
  home_address = excluded.home_address,
  work_address = excluded.work_address,
  updated_at = now();

insert into public.user_saved_places(user_id, home_address, work_address) values (
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  '12, Rue Capois, Port-au-Prince',
  'Pétion-Ville, Ouest'
) on conflict (user_id) do update set
  home_address = excluded.home_address,
  work_address = excluded.work_address,
  updated_at = now();

do $$ begin
  assert (
    select home_address = '12, Rue Capois, Port-au-Prince'
      and work_address = 'Pétion-Ville, Ouest'
    from public.user_saved_places
  ), 'Owner could not save and update both places';

  begin
    insert into public.user_saved_places(user_id, home_address)
    values ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Adresse étrangère');
    raise exception 'Cross-user insert allowed';
  exception when insufficient_privilege then null; end;
end $$;

select set_config(
  'request.jwt.claims',
  '{"sub":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","role":"authenticated"}',
  true
);
do $$ declare affected integer; begin
  assert (
    select count(*) from public.user_saved_places
    where user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
  ) = 0, 'Cross-user read allowed';

  update public.user_saved_places
  set home_address = 'Adresse attaquante'
  where user_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  get diagnostics affected = row_count;
  assert affected = 0, 'Cross-user update allowed';
end $$;

rollback;
select 'PASS: private home and work addresses with owner-only RLS' as result;
