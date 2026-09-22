begin;
insert into auth.users(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}', true);
select public.save_suspicious_vehicle_report_step('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 1, 'Delmas', 18.55, -72.3, 9);
select public.save_suspicious_vehicle_report_step('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 2, p_vehicle_description => 'Couleur : Bleu; Type : Berline; Vitres teintées : Oui', p_observed_behavior => 'Passages répétés');
insert into storage.objects(bucket_id, name) values ('suspicious-vehicle-photos', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cccccccc-cccc-4ccc-8ccc-cccccccccccc/dddddddd-dddd-4ddd-8ddd-dddddddddddd.jpg');
set local role anon;
select set_config('request.jwt.claims', '{}', true);
do $$ begin
  assert (select count(*) from storage.objects where bucket_id = 'suspicious-vehicle-photos') = 0, 'Unattached photo publicly visible';
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}', true);
select public.complete_suspicious_vehicle_report('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '', '[{"storage_path":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cccccccc-cccc-4ccc-8ccc-cccccccccccc/dddddddd-dddd-4ddd-8ddd-dddddddddddd.jpg","captured_at":"2026-09-22T10:00:00Z"}]');
-- Retry is idempotent, including the attachment.
select public.complete_suspicious_vehicle_report('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '', '[{"storage_path":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/cccccccc-cccc-4ccc-8ccc-cccccccccccc/dddddddd-dddd-4ddd-8ddd-dddddddddddd.jpg","captured_at":"2026-09-22T10:00:00Z"}]');
do $$ declare affected integer; begin
  delete from storage.objects where bucket_id = 'suspicious-vehicle-photos';
  get diagnostics affected = row_count;
  assert affected = 0, 'Cleanup deleted attached evidence';
  update storage.objects set name = name where bucket_id = 'suspicious-vehicle-photos';
  get diagnostics affected = row_count;
  assert affected = 0, 'Attached photo could be overwritten';
  begin
    perform public.complete_suspicious_vehicle_report('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'bad', '[{"storage_path":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/cccccccc-cccc-4ccc-8ccc-cccccccccccc/dddddddd-dddd-4ddd-8ddd-dddddddddddd.jpg","captured_at":"2026-09-22T10:00:00Z"}]');
    raise exception 'Cross-owner photo accepted';
  exception when insufficient_privilege then null; end;
  assert (select count(*) from public.suspicious_vehicle_report_photos) = 1, 'Failed save lost attachment';
  assert (select details from public.suspicious_vehicle_reports where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') = '', 'Failed save was not atomic';
end $$;
set local role anon;
select set_config('request.jwt.claims', '{}', true);
do $$ begin
  assert (select count(*) from storage.objects where bucket_id = 'suspicious-vehicle-photos') = 1, 'Attached photo not readable';
  assert jsonb_array_length(public.read_suspicious_vehicle_report('cccccccc-cccc-4ccc-8ccc-cccccccccccc')->'photos') = 1, 'Detail missing photo';
end $$;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}', true);
do $$ begin
  begin
    perform public.complete_suspicious_vehicle_report('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '', '[]');
    raise exception 'Cross-user completion accepted';
  exception when raise_exception then
    if sqlerrm <> 'Save the location first' then raise; end if;
  end;
end $$;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}', true);
select public.complete_suspicious_vehicle_report('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '', '[]');
delete from storage.objects where bucket_id = 'suspicious-vehicle-photos';
do $$ begin
  assert (select count(*) from storage.objects where bucket_id = 'suspicious-vehicle-photos') = 0, 'Detached photo cleanup failed';
  assert (select completed_step from public.suspicious_vehicle_reports where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc') = 3, 'No-photo completion failed';
end $$;
rollback;
select 'PASS: optional vehicle photo, retry, public attachment reads, atomicity and owner isolation' as result;
