begin;
do $$ begin
 assert private.report_distance(null,-72.3,18.55,-72.3) is null,'Missing coordinates must never be treated as zero distance';
 assert private.report_distance(18.55,null,18.55,-72.3) is null;
end $$;
insert into auth.users(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$ declare event uuid; again uuid; begin
 event:=public.prepare_report_event('barricade','11111111-1111-4111-8111-111111111111',null,18.55,-72.3,9);
 again:=public.prepare_report_event('barricade','11111111-1111-4111-8111-111111111111',null,18.55,-72.3,9);
 assert event=again,'Retry must reuse event';
 assert jsonb_array_length(public.read_map_reports()->'reports')=0,'Reservation must not appear on map';
end $$;
select public.save_barricade_report_step('11111111-1111-4111-8111-111111111111',1,'Delmas',18.55,-72.3,9);
select public.save_barricade_report_step('11111111-1111-4111-8111-111111111111',2,p_obstacles=>'Pierres',p_passage=>'Bloqué');
select public.save_barricade_report_step('11111111-1111-4111-8111-111111111111',3,p_details=>'Premier témoignage');
do $$ begin
 assert (public.read_my_rewards()->>'total')::int=25;
 assert jsonb_array_length(public.nearby_report_events('barricade',18.55,-72.3,9))=1;
 assert jsonb_array_length(public.nearby_report_events('accident',18.55,-72.3,9))=0,'Categories must not be mixed';
 assert jsonb_array_length(public.nearby_report_events('barricade',18.8,-72.3,9))=0,'Distant events must not match';
 begin perform public.nearby_report_events('barricade',18.55,-72.3,100); raise exception 'Expected invalid accuracy'; exception when invalid_parameter_value then null; end;
 begin perform public.merge_report_events(gen_random_uuid(),gen_random_uuid(),'Test'); raise exception 'Expected moderator rejection'; exception when insufficient_privilege then null; end;
 begin perform public.undo_report_event_merge(gen_random_uuid()); raise exception 'Expected moderator rejection'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}',true);
do $$ declare event uuid; begin
 event := (public.read_report_event('barricade','11111111-1111-4111-8111-111111111111')->>'event_id')::uuid;
 begin perform public.prepare_report_event('barricade','11111111-1111-4111-8111-111111111111',event,18.55,-72.3,9); raise exception 'Expected owner check'; exception when insufficient_privilege then null; end;
 begin perform public.prepare_report_event('barricade',gen_random_uuid(),event,19.5,-72.3,9); raise exception 'Expected distance check'; exception when invalid_parameter_value then null; end;
 perform public.prepare_report_event('barricade','22222222-2222-4222-8222-222222222222',event,18.5501,-72.3,9);
end $$;
select public.save_barricade_report_step('22222222-2222-4222-8222-222222222222',1,'Même barricade',18.5501,-72.3,9);
select public.save_barricade_report_step('22222222-2222-4222-8222-222222222222',2,p_obstacles=>'Pierres et pneus',p_passage=>'Bloqué');
select public.save_barricade_report_step('22222222-2222-4222-8222-222222222222',3,p_details=>'Second témoignage');
do $$ declare value jsonb; begin
 value:=public.read_report_event('barricade','22222222-2222-4222-8222-222222222222');
 assert (value->'summary'->>'testimony_count')::int=2;
 assert (value->'summary'->>'witness_count')::int=2;
 assert jsonb_array_length(value->'contributions')=2;
 assert not (value::text like '%reporter_id%'),'Public event must not expose identities';
 assert jsonb_array_length(public.read_map_reports()->'reports')=1,'Two witnesses, one marker';
 assert (public.read_my_rewards()->>'total')::int=25,'Each independent witness can earn points';
end $$;
-- The same person cannot farm rewards by confirming again, or choosing another nearby event.
select public.prepare_report_event('barricade','33333333-3333-4333-8333-333333333333',
 (public.read_report_event('barricade','11111111-1111-4111-8111-111111111111')->>'event_id')::uuid,18.55,-72.3,9);
select public.save_barricade_report_step('33333333-3333-4333-8333-333333333333',1,'Confirmation',18.55,-72.3,9);
select public.save_barricade_report_step('33333333-3333-4333-8333-333333333333',2,p_obstacles=>'Pierres',p_passage=>'Bloqué');
select public.save_barricade_report_step('33333333-3333-4333-8333-333333333333',3,p_details=>'Confirmation sur place');
select public.save_barricade_report_step('44444444-4444-4444-8444-444444444444',1,'Autre événement',18.5501,-72.3,9);
select public.save_barricade_report_step('44444444-4444-4444-8444-444444444444',2,p_obstacles=>'Pierres',p_passage=>'Bloqué');
select public.save_barricade_report_step('44444444-4444-4444-8444-444444444444',3,p_details=>'Confirmation sur place');
select public.save_barricade_report_step('44444444-4444-4444-8444-444444444444',3,p_details=>'Confirmation sur place');
do $$ begin
 assert (public.read_my_rewards()->>'total')::int=25,'No duplicate reward';
 assert jsonb_array_length(public.read_map_reports()->'reports')=2,'Explicit distinct event remains distinct';
 assert (public.read_report_event('barricade','11111111-1111-4111-8111-111111111111')->'summary'->>'witness_count')::int=2,'Repeated witness is not an independent witness';
end $$;
reset role;
insert into private.report_event_moderators values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}',true);
do $$ declare source uuid; target uuid; merge uuid; begin
 source:=(public.read_report_event('barricade','44444444-4444-4444-8444-444444444444')->>'event_id')::uuid;
 target:=(public.read_report_event('barricade','11111111-1111-4111-8111-111111111111')->>'event_id')::uuid;
 merge:=public.merge_report_events(source,target,'Même barricade vérifiée');
 assert jsonb_array_length(public.read_map_reports()->'reports')=1,'Merge removes duplicate marker';
 assert jsonb_array_length(public.read_report_event('barricade','44444444-4444-4444-8444-444444444444')->'contributions')=4,'Merge retains all source contributions';
 assert public.merge_report_events(source,target,'Même opération') is null,'Retry must not create another merge';
 perform public.undo_report_event_merge(merge);
 perform public.undo_report_event_merge(merge);
 assert jsonb_array_length(public.read_map_reports()->'reports')=2,'Undo restores the separate events';
 assert (public.read_barricade_report('22222222-2222-4222-8222-222222222222')->>'details')='Second témoignage','Original evidence must not change';
end $$;
-- Visibility and all category thresholds are checked against server timestamps.
reset role;
update public.barricade_reports set created_at=now()-interval '2 hours';
set local role authenticated;
do $$ begin
 assert jsonb_array_length(public.nearby_report_events('barricade',18.55,-72.3,9))=2,'Barricades remain candidates after 2 hours';
end $$;
reset role;
update public.barricade_reports set status='closed';
set local role authenticated;
do $$ begin
 assert jsonb_array_length(public.nearby_report_events('barricade',18.55,-72.3,9))=0,'Closed events not proposed';
end $$;
reset role;
do $$ declare k text; id uuid; event uuid; rule private.report_event_rules%rowtype; begin
 for rule in select * from private.report_event_rules loop
 k:=rule.kind; id:=gen_random_uuid();
 execute format('select public.save_%I_report_step($1,1,$2,18.6,-72.4,9)',k) using id,'Catégorie '||k;
 assert jsonb_array_length(public.nearby_report_events(k,18.6,-72.4,9))=1;
 assert jsonb_array_length(public.nearby_report_events(k,18.6+((rule.radius_m+17)/111195.0),-72.4,9))=1,'GPS accuracy should widen search';
 assert jsonb_array_length(public.nearby_report_events(k,18.6+((rule.radius_m+25)/111195.0),-72.4,9))=0,'Outside category radius';
 execute format('update public.%I set created_at=now()-make_interval(mins=>$1) where id=$2',k||'_reports') using rule.window_minutes+1,id;
 assert jsonb_array_length(public.nearby_report_events(k,18.6,-72.4,9))=0,'Outside category time window';
 end loop;
end $$;
-- Rewards are recomputed after a later verified merge, and restored by undo.
savepoint reward_merge_test;
set local role authenticated;
select public.save_barricade_report_step('55555555-5555-4555-8555-555555555555',1,'Lieu éloigné A',18.8,-72.3,9);
select public.save_barricade_report_step('55555555-5555-4555-8555-555555555555',2,p_obstacles=>'Pierres',p_passage=>'Bloqué');
select public.save_barricade_report_step('55555555-5555-4555-8555-555555555555',3,p_details=>'Nouveau témoignage A');
select public.save_barricade_report_step('66666666-6666-4666-8666-666666666666',1,'Lieu éloigné B',19.2,-72.3,9);
select public.save_barricade_report_step('66666666-6666-4666-8666-666666666666',2,p_obstacles=>'Pierres',p_passage=>'Bloqué');
select public.save_barricade_report_step('66666666-6666-4666-8666-666666666666',3,p_details=>'Nouveau témoignage B');
do $$ declare source uuid; target uuid; merge uuid; before_total int; begin
 before_total:=(public.read_my_rewards()->>'total')::int;
 source:=(public.read_report_event('barricade','55555555-5555-4555-8555-555555555555')->>'event_id')::uuid;
 target:=(public.read_report_event('barricade','66666666-6666-4666-8666-666666666666')->>'event_id')::uuid;
 merge:=public.merge_report_events(source,target,'Correction après examen des deux témoignages');
 assert (public.read_my_rewards()->>'total')::int=before_total-25,'Merged reward must count once per identity';
 perform public.undo_report_event_merge(merge);
 assert (public.read_my_rewards()->>'total')::int=before_total,'Undo restores original reward eligibility';
end $$;
rollback to savepoint reward_merge_test;
set local role anon;
select set_config('request.jwt.claims','{"role":"anon"}',true);
do $$ begin
 assert jsonb_array_length(public.read_map_reports()->'reports')=8,'Guests can still read grouped public events';
 assert not (public.read_report_event('barricade','11111111-1111-4111-8111-111111111111')->>'is_moderator')::boolean;
 begin perform public.nearby_report_events('accident',18.55,-72.3,9); raise exception 'Expected auth check'; exception when insufficient_privilege then null; end;
 begin perform * from private.report_contributions; raise exception 'Expected private data rejection'; exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'PASS: event grouping, idempotency, rewards, moderation, undo, category rules and privacy' as result;
