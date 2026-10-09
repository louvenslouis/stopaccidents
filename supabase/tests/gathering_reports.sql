begin;
do $$
declare
  owner_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  device_id uuid := gen_random_uuid();
  manual_id uuid := gen_random_uuid();
  testimony_id uuid := gen_random_uuid();
  report jsonb;
  event jsonb;
  confirmation jsonb;
  rejected boolean;
begin
  -- Disposable fixtures: the entire transaction is rolled back below.
  insert into auth.users(id, is_anonymous) values (owner_id, false), (other_id, true);
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',owner_id,'role','authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  perform public.prepare_report_event('gathering',device_id,null,18.55,-72.3,9);
  perform public.save_gathering_report_step(device_id,1,'TEST TRANSACTION Rassemblement',18.55,-72.3,9);
  perform public.save_gathering_report_step(device_id,3,p_gathering_state=>'moving');
  rejected := false;
  begin
    perform public.save_gathering_report_step(device_id,2,p_gathering_type=>'invalid');
  exception when check_violation then rejected := true;
  end;
  if not rejected then raise exception 'QA: invalid gathering type accepted'; end if;
  perform public.save_gathering_report_step(device_id,2,p_gathering_type=>'demonstration');
  perform public.save_gathering_report_step(device_id,3,p_gathering_state=>'stationary');
  perform public.save_gathering_report_step(device_id,4,p_traffic_impact=>'blocked',p_details=>'QA rollback');
  perform public.save_gathering_report_step(device_id,4,p_traffic_impact=>'blocked',p_details=>'QA rollback');
  report := public.read_gathering_report(device_id);
  if report is null or report->>'gathering_type'<>'demonstration' or report->>'gathering_state'<>'stationary'
    or report->>'traffic_impact'<>'blocked' or (report->>'completed_step')::int<>4 or report ? 'reporter_id'
    then raise exception 'QA: device report projection mismatch'; end if;
  if (select count(*) from public.gathering_reports where id=device_id)<>1
    then raise exception 'QA: duplicate report'; end if;
  if (select count(*) from public.report_rewards where report_kind='gathering' and report_id=device_id)<>1
    then raise exception 'QA: reward mismatch'; end if;
  if not exists(select 1 from jsonb_array_elements(public.read_map_reports()->'reports') r where r->>'id'=device_id::text)
    then raise exception 'QA: report missing from map'; end if;
  if not exists(select 1 from jsonb_array_elements(public.nearby_report_events('gathering',18.55,-72.3,9,null)) r where r->>'id'=device_id::text)
    then raise exception 'QA: nearby event missing'; end if;
  perform public.prepare_manual_report_event('gathering',manual_id,null,18.61,-72.29,null,now(),30);
  perform public.save_gathering_report_step(manual_id,1,'TEST TRANSACTION Marche',18.61,-72.29,null);
  perform public.save_gathering_report_step(manual_id,2,p_gathering_type=>'march');
  perform public.save_gathering_report_step(manual_id,3,p_gathering_state=>'moving');
  perform public.save_gathering_report_step(manual_id,4,p_traffic_impact=>'slowed');
  report := public.read_gathering_report(manual_id);
  if report->>'location_source'<>'manual' or report->>'occurred_at' is null
    or report->>'gathering_type'<>'march' or report->>'gathering_state'<>'moving'
    then raise exception 'QA: manual context mismatch'; end if;
  if not exists(select 1 from jsonb_array_elements(public.read_report_analytics(null,(now() at time zone 'America/Port-au-Prince')::date,'security','gathering')->'reports') r where r->>'id'=device_id::text)
    then raise exception 'QA: report missing from analytics'; end if;
  confirmation := public.read_report_confirmation('gathering',device_id);
  if (confirmation->>'can_confirm')::boolean then raise exception 'QA: author can endorse own event'; end if;
  perform set_config('request.jwt.claim.sub', other_id::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',other_id,'role','authenticated')::text, true);
  rejected := false;
  begin
    perform public.save_gathering_report_step(device_id,2,p_gathering_type=>'other');
  exception when raise_exception or insufficient_privilege or unique_violation then rejected := true;
  end;
  if not rejected then raise exception 'QA: another author can update report'; end if;
  if exists(select 1 from public.gathering_reports where id=device_id)
    then raise exception 'QA: another author can read raw report'; end if;
  confirmation := public.set_report_confirmation('gathering',device_id,true);
  if (confirmation->>'count')::int<>1 or not (confirmation->>'confirmed')::boolean
    then raise exception 'QA: confirmation missing'; end if;
  confirmation := public.set_report_confirmation('gathering',device_id,true);
  if (confirmation->>'count')::int<>1 then raise exception 'QA: duplicate confirmation'; end if;
  confirmation := public.set_report_confirmation('gathering',device_id,false);
  if (confirmation->>'count')::int<>0 or (confirmation->>'confirmed')::boolean
    then raise exception 'QA: confirmation not removed'; end if;
  perform public.prepare_report_testimony('gathering',testimony_id,device_id);
  perform public.save_gathering_report_step(testimony_id,1,'TEST TRANSACTION Témoignage',18.55,-72.3,null);
  perform public.save_gathering_report_step(testimony_id,2,p_gathering_type=>'demonstration');
  perform public.save_gathering_report_step(testimony_id,3,p_gathering_state=>'stationary');
  perform public.save_gathering_report_step(testimony_id,4,p_traffic_impact=>'blocked');
  event := public.read_report_event('gathering',device_id);
  if jsonb_array_length(event->'contributions')<>2
    then raise exception 'QA: testimony not attached to source event'; end if;
  perform public.flag_publication('gathering',device_id,'TEST TRANSACTION QA');
  perform set_config('role','none',true);
  if (select count(*) from private.publication_flags where kind='gathering' and report_id=device_id and reporter_id=other_id)<>1
    then raise exception 'QA: publication flag missing'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  perform set_config('role','anon',true);
  report := public.read_gathering_report(device_id);
  if report is null or report ? 'reporter_id' then raise exception 'QA: anonymous public read failed'; end if;
  rejected := false;
  begin perform count(*) from public.gathering_reports;
  exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'QA: anonymous raw table exposed'; end if;
  rejected := false;
  begin perform public.save_gathering_report_step(device_id,2,p_gathering_type=>'other');
  exception when insufficient_privilege then rejected := true; end;
  if not rejected then raise exception 'QA: anonymous role can submit without Auth'; end if;
  perform set_config('role','none',true);
  insert into private.publication_moderation(kind,report_id,suspended,reason,actor_id)
    values('gathering',device_id,true,'TEST TRANSACTION QA',owner_id);
  perform set_config('role','anon',true);
  if public.read_gathering_report(device_id) is not null then raise exception 'QA: suspended report exposed'; end if;
  perform set_config('role','none',true);
end;
$$;
rollback;
select jsonb_build_object('passed',true,'device_report',true,'manual_report',true,'idempotent_retry',true,
  'analytics',true,'confirmations',true,'map_feed',true,'nearby_events',true,'testimony',true,'publication_flag',true,'ownership',true,
  'anonymous_public_read',true,'moderation',true,'reward_once',true,'fixtures_rolled_back',true) as verification;
