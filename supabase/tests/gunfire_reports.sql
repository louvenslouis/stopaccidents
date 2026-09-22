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

select public.save_gunfire_report_step(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1,
  'Delmas', 18.55, -72.3, 9
);
do $$ begin
  assert (
    select count(*) from public.gunfire_reports
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      and completed_step = 1
      and shot_count = ''
      and status = 'received'
  ) = 1, 'Location-only gunfire report was not saved';
  begin
    perform public.save_gunfire_report_step(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 3,
      p_details => 'Observation'
    );
    raise exception 'Skipped shot_count step accepted';
  exception when raise_exception then
    if sqlerrm <> 'Save the previous step first' then raise; end if;
  end;
end $$;

select public.save_gunfire_report_step(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1,
  'Delmas — devant la pharmacie', 18.56, -72.31, 7
);
select public.save_gunfire_report_step(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 2,
  p_shot_count => 'two_to_five',
  p_proximity => 'near', p_cadence => 'bursts'
);
select public.save_gunfire_report_step(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 3,
  p_details => 'Observation vers 10 heures'
);

do $$ begin
  assert (
    select completed_step = 3
      and location_description = 'Delmas — devant la pharmacie'
      and shot_count = 'two_to_five'
      and proximity = 'near'
      and details like 'Observation%'
    from public.gunfire_reports
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ), 'Progressive gunfire report lost a saved step';

  begin
    perform public.save_gunfire_report_step(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 2,
      p_shot_count => repeat('X', 1501),
      p_proximity => 'near', p_cadence => 'bursts'
    );
    raise exception 'Oversized observations accepted';
  exception when check_violation then null; end;
  assert (
    select shot_count = 'two_to_five'
    from public.gunfire_reports
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ), 'Failed correction erased saved observations';

  begin
    update public.gunfire_reports
      set reporter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    raise exception 'Reporter reassignment allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.gunfire_reports
      set status = 'closed'
      where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    raise exception 'Client status change allowed';
  exception when insufficient_privilege then null; end;
end $$;

-- Optional final details can be omitted without preventing completion.
select public.save_gunfire_report_step('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 3, p_details => '');
do $$ begin
  assert (select completed_step = 3 and details = '' from public.gunfire_reports where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 'Optional details prevented completion';
end $$;
select public.save_gunfire_report_step('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 3, p_details => 'Observation vers 10 heures');

do $$ begin
  assert (select count(*) = 1 from public.report_rewards where report_kind = 'gunfire'), 'Retries duplicated rewards';
  begin
    perform public.save_gunfire_report_step('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 2, p_shot_count => 'one', p_proximity => 'near');
    raise exception 'Missing cadence accepted';
  exception when check_violation then null; end;
  begin
    perform public.save_gunfire_report_step('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1, 'Delmas', 18.55, -72.3, 100);
    raise exception 'Imprecise location accepted';
  exception when check_violation then null; end;
end $$;
select set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',
  true
);
do $$ declare affected integer; begin
  update public.gunfire_reports
    set shot_count = 'Attacker'
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  get diagnostics affected = row_count;
  assert affected = 0, 'Cross-user update allowed';
  assert (
    select count(*) from public.gunfire_reports
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ) = 0, 'Cross-user read allowed';
  begin
    perform public.save_gunfire_report_step(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 2,
      p_shot_count => 'Autre groupe',
      p_proximity => 'far', p_cadence => 'unknown'
    );
    raise exception 'Cross-user RPC accepted';
  exception when raise_exception then
    if sqlerrm <> 'Save the location first' then raise; end if;
  end;
end $$;

set local role anon;
select set_config('request.jwt.claims', '{}', true);
do $$ declare detail jsonb; begin
  assert public.read_latest_report()->>'report_kind' = 'gunfire', 'Armed shot_count missing on home';
  assert exists (select 1 from jsonb_array_elements(public.read_map_reports()->'reports') item where item->>'report_kind' = 'gunfire'), 'Armed shot_count missing on map';
  detail := public.read_gunfire_report('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  assert detail->>'shot_count' = 'two_to_five', 'Public shot_count missing';
  assert detail->>'cadence' = 'bursts', 'Public cadence missing';
  assert detail->>'proximity' = 'near', 'Public proximity missing';
  assert detail->>'details' = 'Observation vers 10 heures', 'Public details missing';
  assert not detail ? 'reporter_id', 'Reporter identity leaked';
  assert public.read_gunfire_report('dddddddd-dddd-4ddd-8ddd-dddddddddddd') is null, 'Missing report must return null';
  begin
    perform public.save_gunfire_report_step('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 1, 'Delmas', 18.55, -72.3, 9);
    raise exception 'Guest write allowed';
  exception when insufficient_privilege then null; end;
end $$;

rollback;
select 'PASS: progressive gunfire report, validation, private RLS and immutable ownership' as result;
