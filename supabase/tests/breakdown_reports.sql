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

select public.prepare_report_event(
  'breakdown', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', null,
  18.55, -72.3, 9
);
select public.save_breakdown_report_step(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1,
  'Delmas', 18.55, -72.3, 9
);

do $$ begin
  assert (
    select count(*) from public.breakdown_reports
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      and completed_step = 1
      and status = 'received'
  ) = 1, 'Location-only breakdown report was not saved';
  begin
    perform public.save_breakdown_report_step(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 3,
      p_vehicle_type => 'truck'
    );
    raise exception 'Skipped position step accepted';
  exception when raise_exception then
    if sqlerrm <> 'Save the previous step first' then raise; end if;
  end;
end $$;

select public.save_breakdown_report_step(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 2,
  p_breakdown_position => 'roadway'
);
select public.save_breakdown_report_step(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 3,
  p_vehicle_type => 'truck'
);
select public.save_breakdown_report_step(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 4,
  p_traffic_impact => 'major_slowdown',
  p_details => 'Voie de droite bloquée'
);

do $$ begin
  assert (
    select completed_step = 4
      and breakdown_position = 'roadway'
      and vehicle_type = 'truck'
      and traffic_impact = 'major_slowdown'
      and details = 'Voie de droite bloquée'
    from public.breakdown_reports
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ), 'Progressive breakdown report lost a saved step';
  assert exists (
    select 1 from public.report_rewards
    where report_kind = 'breakdown'
      and report_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ), 'Completed breakdown report was not rewarded';
  begin
    update public.breakdown_reports
      set reporter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    raise exception 'Reporter reassignment allowed';
  exception when insufficient_privilege then null; end;
end $$;

select set_config(
  'request.jwt.claims',
  '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',
  true
);
do $$ declare affected integer; begin
  update public.breakdown_reports
    set details = 'Attacker'
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  get diagnostics affected = row_count;
  assert affected = 0, 'Cross-user update allowed';
  assert (
    select count(*) from public.breakdown_reports
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ) = 0, 'Cross-user read allowed';
end $$;

set local role anon;
select set_config('request.jwt.claims', '{}', true);
do $$ declare detail jsonb; begin
  assert public.read_latest_report()->>'report_kind' = 'breakdown',
    'Breakdown missing on home';
  assert exists (
    select 1 from jsonb_array_elements(public.read_map_reports()->'reports') item
    where item->>'report_kind' = 'breakdown'
  ), 'Breakdown missing on map';
  detail := public.read_breakdown_report('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
  assert detail->>'breakdown_position' = 'roadway', 'Public position missing';
  assert detail->>'vehicle_type' = 'truck', 'Public vehicle type missing';
  assert detail->>'traffic_impact' = 'major_slowdown', 'Public traffic impact missing';
  assert not detail ? 'reporter_id', 'Reporter identity leaked';
  begin
    perform public.save_breakdown_report_step(
      'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 1,
      'Delmas', 18.55, -72.3, 9
    );
    raise exception 'Guest write allowed';
  exception when insufficient_privilege then null; end;
end $$;

rollback;
select 'PASS: progressive breakdown report, public feed, rewards and private ownership' as result;
