begin;
set local role anon;
select set_config('request.jwt.claims','{}',true);
do $$ begin
  assert public.read_map_accidents() = '{"reports":[],"truncated":false}'::jsonb, 'Empty feed must be explicit';
end $$;
reset role;
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
insert into public.accident_reports(id,reporter_id,location_description,latitude,longitude,accident_type,severity,completed_step,created_at) values
  ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111','Accident A',18.5,-72.3,'two_cars','serious',4,'2026-01-01'),
  ('44444444-4444-4444-8444-444444444444','22222222-2222-4222-8222-222222222222','',18.5,-72.3,null,'unknown',1,'2026-01-02'),
  ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111','Sans GPS',null,null,'other','unknown',4,'2026-01-03'),
  ('66666666-6666-4666-8666-666666666666','11111111-1111-4111-8111-111111111111','Hors zone',40,-70,'other','unknown',4,'2026-01-04');
insert into public.accident_report_identifiers(report_id,kind,value) values
  ('33333333-3333-4333-8333-333333333333','identity','PRIVATE-ID');
set local role anon;
do $$ declare result jsonb; item jsonb; begin
  result := public.read_map_accidents();
  assert jsonb_array_length(result->'reports') = 2, 'Missing GPS and outside area must be excluded';
  assert result->'reports'->0->>'id' = '44444444-4444-4444-8444-444444444444', 'Newest partial report must be first';
  assert result->'reports'->0->>'accident_type' is null, 'Partial report type must not be invented';
  for item in select value from jsonb_array_elements(result->'reports') loop
    assert (select count(*) from jsonb_object_keys(item)) = 8, 'Unexpected public fields';
    assert not item ?| array['reporter_id','notes','identifiers','photos','storage_path'], 'Private fields leaked';
  end loop;
  assert not (result->>'truncated')::boolean, 'Small feed incorrectly truncated';
  begin
    perform 1 from public.accident_reports;
    raise exception 'Guest direct table access allowed';
  exception when insufficient_privilege then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222"}',true);
do $$ begin
  assert jsonb_array_length(public.read_map_accidents()->'reports') = 2, 'Authenticated users must see all public markers';
  assert (select count(*) from public.accident_reports) = 1, 'Owner-only RLS changed';
  assert (select count(*) from public.accident_report_identifiers) = 0, 'Private identifiers exposed';
end $$;
reset role;
insert into public.accident_reports(id,reporter_id,location_description,latitude,longitude,accident_type,severity,created_at)
select gen_random_uuid(),'11111111-1111-4111-8111-111111111111','Volume',19,-72.5,'other','unknown','2026-02-01'
from generate_series(1,499);
set local role anon;
do $$ declare result jsonb; begin
  result := public.read_map_accidents();
  assert jsonb_array_length(result->'reports') = 500 and (result->>'truncated')::boolean, 'Large feed must be bounded and disclose truncation';
  assert not exists (select 1 from jsonb_array_elements(result->'reports') r where r->>'id' = '33333333-3333-4333-8333-333333333333'), 'Oldest report should be outside limit';
end $$;
rollback;
select 'PASS: map public projection, Haiti bounds, partial and colocated reports, privacy and bounded results' as result;
