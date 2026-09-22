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

select public.save_kidnapping_report_step(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1,
  'Delmas', 18.55, -72.3, 9
);
do $$ begin
  assert (
    select count(*) from public.kidnapping_reports
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
      and completed_step = 1
      and vehicle_clues = ''
      and status = 'received'
  ) = 1, 'Location-only kidnapping report was not saved';
  begin
    perform public.save_kidnapping_report_step(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 3,
      p_abducted_person_clues => 'Chemise bleue'
    );
    raise exception 'Skipped vehicle step accepted';
  exception when raise_exception then
    if sqlerrm <> 'Save the previous step first' then raise; end if;
  end;
end $$;

select public.save_kidnapping_report_step(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1,
  'Delmas — devant la pharmacie', 18.56, -72.31, 7
);
select public.save_kidnapping_report_step(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 2,
  p_vehicle_clues => 'SUV noir, vitre arrière cassée, plaque partielle AA',
  p_direction_taken => 'Vers le nord par la route de Delmas'
);
select public.save_kidnapping_report_step(
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 3,
  p_abducted_person_clues => 'Chemise bleue, sac rouge, environ 20 ans'
);

do $$ begin
  assert (
    select completed_step = 3
      and location_description = 'Delmas — devant la pharmacie'
      and vehicle_clues like 'SUV noir%'
      and direction_taken like 'Vers le nord%'
      and abducted_person_clues like 'Chemise bleue%'
    from public.kidnapping_reports
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ), 'Progressive kidnapping report lost a saved step';

  begin
    perform public.save_kidnapping_report_step(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 2,
      p_vehicle_clues => repeat('X', 1501),
      p_direction_taken => 'Vers le sud'
    );
    raise exception 'Oversized vehicle clues accepted';
  exception when check_violation then null; end;
  assert (
    select vehicle_clues like 'SUV noir%'
    from public.kidnapping_reports
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ), 'Failed correction erased saved vehicle clues';

  begin
    update public.kidnapping_reports
      set reporter_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
      where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    raise exception 'Reporter reassignment allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.kidnapping_reports
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
  update public.kidnapping_reports
    set vehicle_clues = 'Attacker'
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  get diagnostics affected = row_count;
  assert affected = 0, 'Cross-user update allowed';
  assert (
    select count(*) from public.kidnapping_reports
    where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
  ) = 0, 'Cross-user read allowed';
  begin
    perform public.save_kidnapping_report_step(
      'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 2,
      p_vehicle_clues => 'Autre véhicule',
      p_direction_taken => 'Autre direction'
    );
    raise exception 'Cross-user RPC accepted';
  exception when raise_exception then
    if sqlerrm <> 'Save the location first' then raise; end if;
  end;
end $$;

rollback;
select 'PASS: progressive kidnapping report, validation, private RLS and immutable ownership' as result;
