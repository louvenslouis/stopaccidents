-- Integration test: rolled back, including the synthetic users/storage metadata.
begin;
insert into auth.users (id) values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
select public.submit_accident_report('33333333-3333-4333-8333-333333333333','TEST AUTOMATISÉ — lieu fictif',null,null,null,'two_cars','unknown','Test annulé par rollback',array['TEST-001','TEST-002'],array['IDENTITE-FICTIVE'],'[]');
select public.submit_accident_report('33333333-3333-4333-8333-333333333333','TEST RETRY',null,null,null,'two_cars','unknown','',array[]::text[],array[]::text[],'[]');
do $$ begin
  assert (select count(*) from public.accident_reports where id='33333333-3333-4333-8333-333333333333') = 1, 'Retry duplicated report';
  assert (select count(*) from public.accident_report_identifiers where report_id='33333333-3333-4333-8333-333333333333') = 3, 'Identifiers missing';
  begin
    perform public.submit_accident_report('44444444-4444-4444-8444-444444444444','',null,null,null,'two_cars','unknown','',array[]::text[],array[]::text[],'[]');
    raise exception 'Missing location accepted';
  exception when check_violation then null; end;
  begin
    perform public.submit_accident_report('44444444-4444-4444-8444-444444444444','Test',null,null,null,'invalid','unknown','',array[]::text[],array[]::text[],'[]');
    raise exception 'Invalid accident type accepted';
  exception when check_violation then null; end;
  begin
    perform public.submit_accident_report('44444444-4444-4444-8444-444444444444','Test',null,null,null,'other','unknown','',array['TEST'],array[]::text[],'[{"storage_path":"missing.jpg","captured_at":"2026-09-21T00:00:00Z"}]');
    raise exception 'Nonexistent photo accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform public.submit_accident_report('44444444-4444-4444-8444-444444444444','Test',null,null,null,'other','unknown','',array[repeat('X',81)],array[]::text[],'[]');
    raise exception 'Oversized identity accepted';
  exception when check_violation then null; end;
  assert not exists(select 1 from public.accident_reports where id='44444444-4444-4444-8444-444444444444'), 'Failed request left a report';
end $$;
-- Synthetic storage row stands in for a completed camera upload.
insert into storage.objects(bucket_id, name) values ('accident-photos','11111111-1111-4111-8111-111111111111/55555555-5555-4555-8555-555555555555/66666666-6666-4666-8666-666666666666.jpg');
select public.submit_accident_report('55555555-5555-4555-8555-555555555555','',18.5,-72.3,8,'motorcycle','injuries','',array[]::text[],array[]::text[],'[{"storage_path":"11111111-1111-4111-8111-111111111111/55555555-5555-4555-8555-555555555555/66666666-6666-4666-8666-666666666666.jpg","captured_at":"2026-09-21T00:00:00Z"}]');
do $$ begin
  assert (select count(*) from public.accident_report_photos where report_id='55555555-5555-4555-8555-555555555555') = 1, 'Photo not attached';
  begin
    update public.accident_reports set status='closed' where id='33333333-3333-4333-8333-333333333333';
    raise exception 'Client can change review status';
  exception when insufficient_privilege then null; end;
end $$;
-- Another user cannot read or attach identifiers to the first user's report.
select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}', true);
do $$ begin
  assert (select count(*) from public.accident_reports where id in ('33333333-3333-4333-8333-333333333333','55555555-5555-4555-8555-555555555555')) = 0, 'Cross-user report exposure';
  assert (select count(*) from public.accident_report_identifiers where report_id='33333333-3333-4333-8333-333333333333') = 0, 'Cross-user identity exposure';
  assert (select count(*) from public.accident_report_photos where report_id='55555555-5555-4555-8555-555555555555') = 0, 'Cross-user photo exposure';
  assert (select count(*) from storage.objects where name like '11111111-1111-4111-8111-111111111111/%') = 1, 'Attached photo unavailable in the shared feed';
  begin
    insert into public.accident_report_identifiers(report_id,kind,value) values('33333333-3333-4333-8333-333333333333','registration','FORGED');
    raise exception 'Cross-user insert accepted';
  exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin
    perform 1 from public.accident_reports limit 1;
    raise exception 'Unauthenticated read accepted';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'PASS: atomic reports, retries, validation, private photos, RLS, immutable review status' as result;
