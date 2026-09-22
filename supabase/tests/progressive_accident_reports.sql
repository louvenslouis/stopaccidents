begin;
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
-- Location alone creates a received report. No accident subtype is invented.
select public.save_accident_report_step('33333333-3333-4333-8333-333333333333',1,'Lieu de test',18.5,-72.3,12);
do $$ begin
  assert (select count(*) from public.accident_reports where id='33333333-3333-4333-8333-333333333333' and status='received' and completed_step=1 and accident_type is null and severity='unknown') = 1, 'Step one was not received';
  begin
    perform public.save_accident_report_step('33333333-3333-4333-8333-333333333333',3,p_severity=>'serious');
    raise exception 'Skipped step accepted';
  exception when raise_exception then
    if sqlerrm <> 'Save the previous step first' then raise; end if;
  end;
end $$;
-- Same UUID retries update the location without a duplicate.
select public.save_accident_report_step('33333333-3333-4333-8333-333333333333',1,'Lieu corrigé',18.6,-72.2,8);
-- Every illustrated situation must round-trip through the public save endpoint.
do $$ declare kind text; begin
  foreach kind in array array['car_motorcycle','car_pedestrian','car_tuktuk','single_motorcycle'] loop
    perform public.save_accident_report_step('33333333-3333-4333-8333-333333333333',2,p_accident_type=>kind);
    assert (select accident_type=kind from public.accident_reports where id='33333333-3333-4333-8333-333333333333'), 'Illustrated accident type was not saved';
  end loop;
  begin
    perform public.save_accident_report_step('33333333-3333-4333-8333-333333333333',2,p_accident_type=>'invalid_type');
    raise exception 'Unknown accident type accepted';
  exception when check_violation then null; end;
end $$;
select public.save_accident_report_step('33333333-3333-4333-8333-333333333333',2,p_accident_type=>'motorcycle');
select public.save_accident_report_step('33333333-3333-4333-8333-333333333333',3,p_severity=>'injuries');
-- Upload after the parent exists: storage policies must allow this now.
insert into storage.objects(bucket_id,name) values ('accident-photos','11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444.jpg');
select public.save_accident_report_step('33333333-3333-4333-8333-333333333333',4,p_notes=>'Complément',p_registrations=>array['TEST-01'],p_photos=>'[{"storage_path":"11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444.jpg","captured_at":"2026-09-21T00:00:00Z"}]');
do $$ declare affected int; begin
  assert (select count(*) from public.accident_reports where id='33333333-3333-4333-8333-333333333333')=1, 'Duplicate report';
  assert (select completed_step=4 and location_description='Lieu corrigé' and accident_type='motorcycle' and severity='injuries' from public.accident_reports where id='33333333-3333-4333-8333-333333333333'), 'Later step erased saved fields';
  update storage.objects set name=name where name='11111111-1111-4111-8111-111111111111/33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444.jpg';
  get diagnostics affected = row_count;
  assert affected=0, 'Referenced photo can be overwritten';
  begin
    perform public.save_accident_report_step('33333333-3333-4333-8333-333333333333',4,p_notes=>'Must roll back',p_identities=>array[repeat('X',81)]);
    raise exception 'Invalid identifier accepted';
  exception when check_violation then null; end;
  assert (select notes='Complément' from public.accident_reports where id='33333333-3333-4333-8333-333333333333'), 'Failed complement erased previous details';
  assert (select count(*) from public.accident_report_photos where report_id='33333333-3333-4333-8333-333333333333')=1, 'Failed step deleted photos';
end $$;
-- Adjusting the first stage must keep all later stages and processing status.
select public.save_accident_report_step('33333333-3333-4333-8333-333333333333',1,'Nouvelle précision',18.7,-72.1,5);
do $$ begin
  assert (select completed_step=4 and notes='Complément' and severity='injuries' and status='received' from public.accident_reports where id='33333333-3333-4333-8333-333333333333'), 'Adjustment reset progress';
  begin
    update public.accident_reports set reporter_id='22222222-2222-4222-8222-222222222222' where id='33333333-3333-4333-8333-333333333333';
    raise exception 'Reporter reassignment allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.accident_reports set status='closed' where id='33333333-3333-4333-8333-333333333333';
    raise exception 'Review status change allowed';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
do $$ declare affected int; begin
  update public.accident_reports set location_description='Attacker' where id='33333333-3333-4333-8333-333333333333';
  get diagnostics affected = row_count;
  assert affected=0, 'Cross-user update allowed';
  delete from public.accident_report_photos where report_id='33333333-3333-4333-8333-333333333333';
  get diagnostics affected = row_count;
  assert affected=0, 'Cross-user photo deletion allowed';
  begin
    perform public.save_accident_report_step('33333333-3333-4333-8333-333333333333',2,p_accident_type=>'single_car');
    raise exception 'Cross-user RPC accepted';
  exception when raise_exception then
    if sqlerrm <> 'Save the location first' then raise; end if;
  end;
end $$;
rollback;
select 'PASS: location-first creation, per-step persistence, retries, adjustments, atomic complements, private storage and ownership' as result;
