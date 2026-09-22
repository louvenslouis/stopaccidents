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

select public.save_armed_presence_report_step(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1,
  'Delmas', 18.55, -72.3, 9
);
do $$ begin
  assert (
    select count(*) from public.armed_presence_reports
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      and completed_step = 1
      and presence = ''
      and status = 'received'
  ) = 1, 'Location-only armed_presence report was not saved';
  begin
    perform public.save_armed_presence_report_step(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 3,
      p_details => 'Observation'
    );
    raise exception 'Skipped presence step accepted';
  exception when raise_exception then
    if sqlerrm <> 'Save the previous step first' then raise; end if;
  end;
end $$;

select public.save_armed_presence_report_step(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1,
  'Delmas — devant la pharmacie', 18.56, -72.31, 7
);
select public.save_armed_presence_report_step(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 2,
  p_presence => 'Environ trois hommes armés',
  p_activity => 'Présence au carrefour'
);
select public.save_armed_presence_report_step(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 3,
  p_details => 'Observation vers 10 heures'
);

do $$ begin
  assert (
    select completed_step = 3
      and location_description = 'Delmas — devant la pharmacie'
      and presence like 'Environ trois%'
      and activity like 'Présence au carrefour%'
      and details like 'Observation%'
    from public.armed_presence_reports
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ), 'Progressive armed_presence report lost a saved step';

  begin
    perform public.save_armed_presence_report_step(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 2,
      p_presence => repeat('X', 1501),
      p_activity => 'Vers le sud'
    );
    raise exception 'Oversized observations accepted';
  exception when check_violation then null; end;
  assert (
    select presence like 'Environ trois%'
    from public.armed_presence_reports
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ), 'Failed correction erased saved observations';

  begin
    update public.armed_presence_reports
      set reporter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    raise exception 'Reporter reassignment allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.armed_presence_reports
      set status = 'closed'
      where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    raise exception 'Client status change allowed';
  exception when insufficient_privilege then null; end;
end $$;

-- Optional final details can be omitted without preventing completion.
select public.save_armed_presence_report_step('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 3, p_details => '');
do $$ begin
  assert (select completed_step = 3 and details = '' from public.armed_presence_reports where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 'Optional details prevented completion';
end $$;
select public.save_armed_presence_report_step('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 3, p_details => 'Observation vers 10 heures');

select set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',
  true
);
do $$ declare affected integer; begin
  update public.armed_presence_reports
    set presence = 'Attacker'
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  get diagnostics affected = row_count;
  assert affected = 0, 'Cross-user update allowed';
  assert (
    select count(*) from public.armed_presence_reports
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ) = 0, 'Cross-user read allowed';
  begin
    perform public.save_armed_presence_report_step(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 2,
      p_presence => 'Autre groupe',
      p_activity => 'Autre activité'
    );
    raise exception 'Cross-user RPC accepted';
  exception when raise_exception then
    if sqlerrm <> 'Save the location first' then raise; end if;
  end;
end $$;

set local role anon;
select set_config('request.jwt.claims', '{}', true);
do $$ declare detail jsonb; begin
  assert public.read_latest_report()->>'report_kind' = 'armed_presence', 'Armed presence missing on home';
  assert exists (select 1 from jsonb_array_elements(public.read_map_reports()->'reports') item where item->>'report_kind' = 'armed_presence'), 'Armed presence missing on map';
  detail := public.read_armed_presence_report('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  assert detail->>'presence' = 'Environ trois hommes armés', 'Public presence missing';
  assert detail->>'activity' = 'Présence au carrefour', 'Public activity missing';
  assert detail->>'details' = 'Observation vers 10 heures', 'Public details missing';
  assert not detail ? 'reporter_id', 'Reporter identity leaked';
  assert public.read_armed_presence_report('dddddddd-dddd-4ddd-8ddd-dddddddddddd') is null, 'Missing report must return null';
  begin
    perform public.save_armed_presence_report_step('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 1, 'Delmas', 18.55, -72.3, 9);
    raise exception 'Guest write allowed';
  exception when insufficient_privilege then null; end;
end $$;

rollback;
select 'PASS: progressive armed_presence report, validation, private RLS and immutable ownership' as result;
