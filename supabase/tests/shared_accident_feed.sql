begin;
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $$ begin
  assert public.read_accident() is null, 'Empty feed must return null';
end $$;
select public.submit_accident_report('33333333-3333-4333-8333-333333333333','Ancien accident',null,null,null,'two_cars','serious','Notes partagées',array['PRIVATE-PLATE'],array['PRIVATE-ID'],'[]');
insert into storage.objects(bucket_id,name) values
  ('accident-photos','11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444.jpg'),
  ('accident-photos','11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333/55555555-5555-4555-8555-555555555555.jpg');
insert into public.accident_report_photos(report_id,storage_path,captured_at) values
  ('33333333-3333-4333-8333-333333333333','11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444.jpg',now());
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select public.save_accident_report_step('66666666-6666-4666-8666-666666666666',1,'Dernier accident');
reset role;
update public.accident_reports set created_at='2026-01-01T00:00:00Z', updated_at='2026-09-21T00:00:00Z' where id='33333333-3333-4333-8333-333333333333';
update public.accident_reports set created_at='2026-01-02T00:00:00Z' where id='66666666-6666-4666-8666-666666666666';
set local role authenticated;
do $$ declare detail jsonb; affected int; begin
  detail := public.read_accident('33333333-3333-4333-8333-333333333333');
  assert detail->>'notes' = 'Notes partagées', 'Other user cannot read shared details';
  assert detail->'identifiers' = '[]'::jsonb, 'Private identifiers leaked';
  assert not (detail ? 'reporter_id'), 'Reporter identity leaked';
  assert detail->>'is_owner' = 'false', 'Incorrect owner flag';
  assert jsonb_array_length(detail->'photos') = 1, 'Photo metadata missing';
  assert (select count(*) from storage.objects) = 1, 'Unattached upload exposed or attached photo hidden';
  assert (select count(*) from public.accident_report_identifiers) = 0, 'Base identifiers exposed';
  update public.accident_reports set notes='FORGED' where id='33333333-3333-4333-8333-333333333333';
  get diagnostics affected = row_count;
  assert affected = 0, 'Shared reader can edit another report';
  delete from storage.objects where name like '11111111-1111-4111-8111-111111111111/%';
  get diagnostics affected = row_count;
  assert affected = 0, 'Shared reader can delete photos';
end $$;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
do $$ declare latest jsonb; detail jsonb; begin
  latest := public.read_accident();
  assert latest->>'id' = '66666666-6666-4666-8666-666666666666', 'Latest must include other users and use creation, not update time';
  assert latest->>'completed_step' = '1' and latest->>'accident_type' is null, 'Partial report hidden or invented type';
  assert not (latest ? 'photos') and not (latest ? 'identifiers'), 'Summary must be lightweight';
  detail := public.read_accident('33333333-3333-4333-8333-333333333333');
  assert detail->>'is_owner' = 'true' and jsonb_array_length(detail->'identifiers') = 2, 'Owner details missing';
  assert public.read_accident('77777777-7777-4777-8777-777777777777') is null, 'Missing report must return null';
end $$;
-- Missing session and the unauthenticated role cannot invoke the shared reader.
select set_config('request.jwt.claims','{}',true);
do $$ begin
  begin
    perform public.read_accident();
    raise exception 'Missing identity accepted';
  exception when insufficient_privilege then null; end;
  assert not private.is_shared_accident_photo('11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444.jpg'), 'Missing identity can read photo';
end $$;
set local role anon;
do $$ begin
  begin
    perform public.read_accident();
    raise exception 'Unauthenticated RPC allowed';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'PASS: global latest, partial reports, full details, private identifiers, attached photos only and read-only access' as result;
