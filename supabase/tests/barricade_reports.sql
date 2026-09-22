begin;
insert into auth.users(id) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',
  true
);

select public.save_barricade_report_step(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1,
  'Delmas', 18.55, -72.3, 9
);
do $$ begin
  assert (
    select count(*) from public.barricade_reports
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      and completed_step = 1
      and obstacles = ''
      and status = 'received'
  ) = 1, 'Location-only barricade report was not saved';
  begin
    perform public.save_barricade_report_step(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 3,
      p_details => 'Blocage observé'
    );
    raise exception 'Skipped vehicle step accepted';
  exception when raise_exception then
    if sqlerrm <> 'Save the previous step first' then raise; end if;
  end;
end $$;

select public.save_barricade_report_step(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1,
  'Delmas — devant la pharmacie', 18.56, -72.31, 7
);
select public.save_barricade_report_step(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 2,
  p_obstacles => 'Pneus et pierres sur la chaussée',
  p_passage => 'Passage bloqué dans les deux sens'
);
select public.save_barricade_report_step(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 3,
  p_details => 'Blocage observé depuis une heure'
);

do $$ begin
  assert (
    select completed_step = 3
      and location_description = 'Delmas — devant la pharmacie'
      and obstacles like 'Pneus%'
      and passage like 'Passage bloqué%'
      and details like 'Blocage observé%'
    from public.barricade_reports
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ), 'Progressive barricade report lost a saved step';

  begin
    perform public.save_barricade_report_step(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 2,
      p_obstacles => repeat('X', 1501),
      p_passage => 'Vers le sud'
    );
    raise exception 'Oversized vehicle clues accepted';
  exception when check_violation then null; end;
  assert (
    select obstacles like 'Pneus%'
    from public.barricade_reports
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ), 'Failed correction erased saved vehicle clues';

  begin
    update public.barricade_reports
      set reporter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    raise exception 'Reporter reassignment allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.barricade_reports
      set status = 'closed'
      where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    raise exception 'Client status change allowed';
  exception when insufficient_privilege then null; end;
end $$;

select set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',
  true
);
do $$ declare affected integer; begin
  update public.barricade_reports
    set obstacles = 'Attacker'
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  get diagnostics affected = row_count;
  assert affected = 0, 'Cross-user update allowed';
  assert (
    select count(*) from public.barricade_reports
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ) = 0, 'Cross-user read allowed';
  begin
    perform public.save_barricade_report_step(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 2,
      p_obstacles => 'Autre véhicule',
      p_passage => 'Autre direction'
    );
    raise exception 'Cross-user RPC accepted';
  exception when raise_exception then
    if sqlerrm <> 'Save the location first' then raise; end if;
  end;
end $$;

set local role anon;
select set_config('request.jwt.claims', '{}', true);
do $$ declare detail jsonb; begin
  assert public.read_latest_report()->>'report_kind' = 'barricade', 'Barricade missing on home';
  assert exists (select 1 from jsonb_array_elements(public.read_map_reports()->'reports') item where item->>'report_kind' = 'barricade'), 'Barricade missing on map';
  detail := public.read_barricade_report('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  assert detail->>'obstacles' = 'Pneus et pierres sur la chaussée', 'Public obstacles missing';
  assert detail->>'passage' = 'Passage bloqué dans les deux sens', 'Public passage missing';
  assert detail->>'details' = 'Blocage observé depuis une heure', 'Public details missing';
  assert not detail ? 'reporter_id', 'Reporter identity leaked';
  assert public.read_barricade_report('dddddddd-dddd-4ddd-8ddd-dddddddddddd') is null, 'Missing report must return null';
  begin
    perform public.save_barricade_report_step('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 1, 'Delmas', 18.55, -72.3, 9);
    raise exception 'Guest write allowed';
  exception when insufficient_privilege then null; end;
end $$;

rollback;
select 'PASS: progressive barricade report, validation, private RLS and immutable ownership' as result;
