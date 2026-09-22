begin;
insert into auth.users(id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');

insert into public.accident_reports(
  id, reporter_id, location_description, latitude, longitude,
  accident_type, severity, completed_step, created_at
) values (
  '33333333-3333-4333-8333-333333333333',
  '11111111-1111-4111-8111-111111111111',
  'Accident public', 18.5, -72.3, 'two_cars', 'serious', 4,
  '2026-01-01T00:00:00Z'
);
insert into public.kidnapping_reports(
  id, reporter_id, location_description, latitude, longitude,
  location_accuracy_m, vehicle_clues, direction_taken,
  abducted_person_clues, completed_step, created_at
) values (
  '44444444-4444-4444-8444-444444444444',
  '22222222-2222-4222-8222-222222222222',
  'Enlèvement public', 18.55, -72.35, 8,
  'Véhicule secret', 'Direction secrète', 'Personne secrète', 3,
  '2026-01-02T00:00:00Z'
);

set local role anon;
select set_config('request.jwt.claims','{}',true);
do $$
declare
  latest jsonb;
  feed jsonb;
  detail jsonb;
begin
  latest := public.read_latest_report();
  assert latest->>'report_kind' = 'kidnapping',
    'The latest kidnapping must appear on home';
  assert latest->>'id' = '44444444-4444-4444-8444-444444444444',
    'The latest report selection is incorrect';
  assert not latest ?| array[
    'reporter_id', 'vehicle_clues', 'direction_taken',
    'abducted_person_clues', 'location_accuracy_m'
  ], 'Sensitive kidnapping fields leaked in the home summary';

  feed := public.read_map_reports();
  assert jsonb_array_length(feed->'reports') = 2,
    'Accident and kidnapping must both appear on the map';
  assert exists (
    select 1 from jsonb_array_elements(feed->'reports') item
    where item->>'report_kind' = 'kidnapping'
  ), 'Kidnapping marker is missing';
  assert not exists (
    select 1 from jsonb_array_elements(feed->'reports') item
    where item ?| array[
      'reporter_id', 'vehicle_clues', 'direction_taken',
      'abducted_person_clues', 'location_accuracy_m'
    ]
  ), 'Sensitive data leaked on the map';

  detail := public.read_kidnapping_report(
    '44444444-4444-4444-8444-444444444444'
  );
  assert detail->>'is_owner' = 'false', 'Guest incorrectly marked as owner';
  assert not detail ?| array[
    'vehicle_clues', 'direction_taken', 'abducted_person_clues'
  ], 'Guest received confidential eyewitness clues';
end $$;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',
  true
);
do $$
declare detail jsonb;
begin
  detail := public.read_kidnapping_report(
    '44444444-4444-4444-8444-444444444444'
  );
  assert detail->>'is_owner' = 'true', 'Author not recognized';
  assert detail->>'vehicle_clues' = 'Véhicule secret',
    'Author cannot read their confidential clues';
  assert jsonb_array_length(public.read_map_reports()->'reports') = 2,
    'Authenticated map feed differs from guest feed';
end $$;

rollback;
select 'PASS: unified public home/map feed and private kidnapping clues' as result;
