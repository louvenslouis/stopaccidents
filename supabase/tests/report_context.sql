begin;
insert into auth.users(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$ declare kind text; report uuid; event uuid; again uuid; detail jsonb; observed timestamptz := now()-interval '3 hours'; begin
  foreach kind in array array['accident','kidnapping','barricade','armed_presence','suspicious_vehicle','gunfire','breakdown'] loop
    report := gen_random_uuid();
    event := public.prepare_manual_report_event(kind,report,null,18.55,-72.3,null,observed);
    again := public.prepare_manual_report_event(kind,report,null,18.55,-72.3,null,observed);
    assert event=again,'Retry must reuse event';
    execute format('select public.save_%s_report_step($1,1,''Lieu choisi'',18.55,-72.3,null)',kind) using report;
    execute format('select public.%s($1)',case when kind='accident' then 'read_accident' else 'read_'||kind||'_report' end) into detail using report;
    assert (detail->>'occurred_at')::timestamptz=observed,kind||': occurrence must persist';
    assert (detail->>'created_at')::timestamptz=now(),kind||': publication audit must remain intact';
    assert detail->>'location_source'='manual';
    assert detail->>'location_accuracy_m' is null,'Map selection is not a GPS fix';
    if kind <> 'barricade' then
      assert jsonb_array_length(public.nearby_report_events(kind,18.55,-72.3,9))=0,'Reports outside the category window must not be current events';
    end if;
    assert (public.read_report_event(kind,report)->'summary'->>'created_at')::timestamptz=observed,'Feed date must be occurrence time';
    -- Changing the historical observation after publication is rejected.
    begin
      perform public.prepare_manual_report_event(kind,report,null,18.55,-72.3,null,observed-interval '1 hour');
      raise exception 'Expected immutable context';
    exception when invalid_parameter_value then null; end;
    perform set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
    begin
      perform public.prepare_manual_report_event(kind,report,null,18.55,-72.3,null,observed);
      raise exception 'Expected owner check';
    exception when insufficient_privilege then null; end;
    perform set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
  end loop;
  -- The age is measured on the server: a client timestamp from before midnight
  -- or a slow connection must not break the 180-minute endpoint.
  report := gen_random_uuid();
  perform public.prepare_manual_report_event('accident',report,null,18.55,-72.3,null,now()-interval '4 hours',180);
  perform public.save_accident_report_step(report,1,'Lieu choisi',18.55,-72.3,null);
  detail := public.read_accident(report);
  assert (detail->>'occurred_at')::timestamptz=now()-interval '3 hours';
  begin
    perform public.prepare_manual_report_event('accident',gen_random_uuid(),null,18.55,-72.3,null,now()-interval '3 hours 1 second');
    raise exception 'Expected old event rejection';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.prepare_manual_report_event('accident',gen_random_uuid(),null,18.55,-72.3,null,now(),195);
    raise exception 'Expected invalid age rejection';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.prepare_manual_report_event('accident',gen_random_uuid(),null,18.55,-72.3,null,now(),5);
    raise exception 'Expected off-notch age rejection';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.prepare_manual_report_event('accident',gen_random_uuid(),null,18.55,-72.3,null,now()+interval '1 hour');
    raise exception 'Expected future time rejection';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.prepare_manual_report_event('accident',gen_random_uuid(),null,18.55,-72.3,null,null);
    raise exception 'Expected missing time rejection';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.prepare_manual_report_event('accident',gen_random_uuid(),null,null,-72.3,null,observed);
    raise exception 'Expected missing position rejection';
  exception when invalid_parameter_value then null; end;
end $$;
rollback;
select 'PASS: manual context for all seven categories' as result;
