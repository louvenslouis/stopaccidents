begin;
insert into auth.users(id) values ('00000000-0000-0000-0000-00000000a001'),('00000000-0000-0000-0000-00000000a002');
insert into private.report_events(id,kind) values
 ('00000000-0000-0000-0000-00000000e001','accident'),
 ('00000000-0000-0000-0000-00000000e002','gunfire'),
 ('00000000-0000-0000-0000-00000000e003','barricade');
insert into private.report_contributions(kind,report_id,event_id,reporter_id,created_at,published,completed_step,summary) values
 ('accident','00000000-0000-0000-0000-00000000c001','00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-00000000a001','2026-09-20 23:30:00-04',true,1,'{"id":"00000000-0000-0000-0000-00000000c001","report_kind":"accident","accident_type":null,"severity":"unknown","completed_step":1}'),
 ('accident','00000000-0000-0000-0000-00000000c002','00000000-0000-0000-0000-00000000e001','00000000-0000-0000-0000-00000000a002','2026-09-21 01:00:00-04',true,3,'{"id":"00000000-0000-0000-0000-00000000c002","report_kind":"accident","accident_type":"two_cars","severity":"injuries","completed_step":3}'),
 ('gunfire','00000000-0000-0000-0000-00000000c003','00000000-0000-0000-0000-00000000e002','00000000-0000-0000-0000-00000000a001','2026-09-19 12:00:00-04',true,3,'{"id":"00000000-0000-0000-0000-00000000c003","report_kind":"gunfire","completed_step":3}'),
 ('barricade','00000000-0000-0000-0000-00000000c004','00000000-0000-0000-0000-00000000e003','00000000-0000-0000-0000-00000000a001','2026-09-20 12:00:00-04',false,0,'{}');
set local role anon;
do $$ declare result jsonb; begin
 result := public.read_report_analytics('2026-09-20','2026-09-20');
 assert (result->>'total')::int=1, 'Do not count multiple testimonies as multiple events';
 assert (result->>'testimonies')::int=2;
 assert (result->>'previous_total')::int=1;
 assert result->'daily'->0->>'date'='2026-09-20', 'Use first testimony and Haiti timezone';
 assert (result->'hours'->0->>'hour')::int=23;
 assert (result->>'detailed')::int=1;
 assert result->'severity'->0->>'severity'='injuries';
 assert (result->'reports'->0->>'witness_count')::int=2;
 assert not ((result->'reports'->0) ? 'reporter_id'), 'Never expose contributor identities';
 assert (public.read_report_analytics('2026-09-20','2026-09-20','accidents','two_cars')->>'total')::int=1;
 assert (public.read_report_analytics('2026-09-20','2026-09-20','accidents','single_car')->>'total')::int=0;
 assert (public.read_report_analytics('2026-09-20','2026-09-20','traffic')->>'total')::int=0, 'Unpublished drafts stay hidden';
 assert (public.read_report_analytics(null,'2026-09-22')->>'total')::int=2;
 assert public.read_report_analytics(null,'2026-09-22')->>'previous_total' is null;
 assert (public.read_report_analytics('2020-01-01','2020-01-02')->'reports')='[]'::jsonb;
 assert (public.read_report_analytics(null,'2026-09-22','security','gunfire')->>'total')::int=1;
 begin perform public.read_report_analytics('2026-09-22','2026-09-01'); raise exception 'Invalid dates accepted'; exception when invalid_parameter_value then null; end;
end $$;
reset role;
-- Verify all-history aggregation beyond the map cap and deterministic pagination.
insert into private.report_events(id,kind) select md5('analytics-event-'||g)::uuid,'gunfire' from generate_series(1,505) g;
insert into private.report_contributions(kind,report_id,event_id,reporter_id,created_at,published,summary)
 select 'gunfire',md5('analytics-report-'||g)::uuid,md5('analytics-event-'||g)::uuid,'00000000-0000-0000-0000-00000000a001','2026-09-22 12:00:00-04',true,
 jsonb_build_object('id',md5('analytics-report-'||g)::uuid,'report_kind','gunfire','completed_step',1) from generate_series(1,505) g;
set local role authenticated;
do $$ declare result jsonb; begin
 result := public.read_report_analytics('2026-09-22','2026-09-22');
 assert (result->>'total')::int=505, 'Statistics must not inherit map cap';
 assert jsonb_array_length(result->'reports')=20;
 assert jsonb_array_length(public.read_report_analytics('2026-09-22','2026-09-22','all','all',500)->'reports')=5;
 assert not exists (select 1 from jsonb_array_elements(result->'reports') a join jsonb_array_elements(public.read_report_analytics('2026-09-22','2026-09-22','all','all',20)->'reports') b on a->>'event_id'=b->>'event_id');
end $$;
reset role;
rollback;
select 'PASS: analytics periods, timezone, deduplication, filters, private data, pagination and uncapped totals' result;
