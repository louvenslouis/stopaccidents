begin;
do $$ begin
 assert (select count(*) from private.report_communes)=140;
 assert (select count(distinct department_code) from private.report_communes)=10;
 assert private.report_commune_at(18.5392,-72.3350)='HT0111', 'Port-au-Prince';
 assert private.report_commune_at(18.5125,-72.2853)='HT0114', 'Pétion-Ville';
 assert private.report_commune_at(19.7590,-72.2000)='HT0311', 'Cap-Haïtien';
 assert private.report_commune_at(18.2353,-72.5367)='HT0211', 'Jacmel';
 assert private.report_commune_at(null,-72.3) is null;
 assert private.report_commune_at(0,0) is null, 'Do not assign nearest commune outside Haiti';
 assert private.report_commune_at(18.47,-69.90) is null, 'Dominican Republic';
end $$;

insert into auth.users(id) values ('00000000-0000-0000-0000-00000000b001');
insert into private.report_events(id,kind)
 select md5('territory-event-'||g)::uuid,'gunfire' from generate_series(1,29) g;
insert into private.report_contributions(kind,report_id,event_id,reporter_id,created_at,published,completed_step,latitude,longitude,summary)
 select 'gunfire',md5('territory-report-'||g)::uuid,md5('territory-event-'||g)::uuid,
 '00000000-0000-0000-0000-00000000b001',
 case when g=25 then '2026-09-19 12:00:00-04'::timestamptz else '2026-09-20 12:00:00-04'::timestamptz end,
 g<>29,3,
 case when g<=25 then 18.5392 when g=26 then 18.5125 when g=27 then 19.7590 else null end,
 case when g<=25 then -72.3350 when g=26 then -72.2853 when g=27 then -72.2000 else null end,
 jsonb_build_object('id',md5('territory-report-'||g)::uuid,'report_kind','gunfire','completed_step',3)
 from generate_series(1,29) g;
-- A second testimony in another commune must not double-count or move the event.
insert into private.report_contributions(kind,report_id,event_id,reporter_id,created_at,published,completed_step,latitude,longitude)
 values ('gunfire',md5('territory-extra')::uuid,md5('territory-event-1')::uuid,
 '00000000-0000-0000-0000-00000000b001','2026-09-20 13:00:00-04',true,1,19.7590,-72.2);

set local role anon;
do $$ declare r jsonb; begin
 r := public.read_report_analytics('2026-09-20','2026-09-20');
 assert (r->>'total')::int=27;
 assert (r->'territories'->>'unlocated')::int=1;
 assert jsonb_array_length(r->'territories'->'departments')=2;
 assert jsonb_array_length(r->'territories'->'communes')=3;
 assert (select sum((x->>'count')::int) from jsonb_array_elements(r->'territories'->'communes') x)=26;
 assert (select sum((x->>'count')::int) from jsonb_array_elements(r->'territories'->'departments') x)=26;
 assert r->'territories'->'departments'->0->>'name'='Ouest';
 assert (r->'territories'->'departments'->0->>'count')::int=25;
 r := public.read_report_analytics('2026-09-20','2026-09-20','security','gunfire',0,'HT01','HT0111');
 assert (r->>'total')::int=24;
 assert (r->>'testimonies')::int=25;
 assert (r->>'previous_total')::int=1, 'Previous period must use same territory';
 assert (r->'territories'->>'unlocated')::int=0;
 assert jsonb_array_length(r->'reports')=20;
 assert not exists(select 1 from jsonb_array_elements(r->'reports') x where x->>'commune_name'<>'Port-au-Prince');
 assert jsonb_array_length(public.read_report_analytics('2026-09-20','2026-09-20','security','gunfire',20,'HT01','HT0111')->'reports')=4;
 assert (public.read_report_analytics('2026-09-20','2026-09-20','all','all',0,'HT03')->>'total')::int=1;
 assert (public.read_report_analytics('2026-09-20','2026-09-20','all','all',0,null,'HT0114')->>'total')::int=1;
 assert (public.read_report_analytics('2026-09-20','2026-09-20','accidents','all',0,'HT01')->>'total')::int=0;
 assert (public.read_report_analytics('2026-09-20','2026-09-20','all','all',0,'HT02')->>'total')::int=0;
 assert (public.read_report_analytics('2026-09-20','2026-09-20','all','all',0,'unknown')->>'total')::int=1;
 begin perform public.read_report_analytics(null,'2026-09-20','all','all',0,'HT03','HT0111'); raise exception 'Mismatched parent accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.read_report_analytics(null,'2026-09-20','all','all',0,'invalid'); raise exception 'Unknown department accepted'; exception when invalid_parameter_value then null; end;
 begin perform public.read_report_analytics(null,'2026-09-20','all','all',0,null,'invalid'); raise exception 'Unknown commune accepted'; exception when invalid_parameter_value then null; end;
 begin perform 1 from private.report_communes; raise exception 'Reference table exposed'; exception when insufficient_privilege then null; end;
 begin perform private.report_commune_at(18.5,-72.3); raise exception 'Internal lookup exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update private.report_contributions set latitude=19.759,longitude=-72.2 where report_id=md5('territory-report-26')::uuid;
do $$ begin
 assert (select commune_code from private.report_contributions where report_id=md5('territory-report-26')::uuid)='HT0311', 'Position correction updates territory';
end $$;
-- Geometry edge cases: holes, separate islands and ambiguous borders.
insert into private.report_communes values ('TEST1','Test 1','TEST','Test'),('TEST2','Test 2','TEST','Test');
insert into private.report_commune_boundaries(commune_code,exterior,holes) values
 ('TEST1','((0,0),(4,0),(4,4),(0,4),(0,0))',array['((1,1),(2,1),(2,2),(1,2),(1,1))'::polygon]),
 ('TEST1','((6,0),(7,0),(7,1),(6,1),(6,0))','{}'),
 ('TEST2','((4,0),(5,0),(5,4),(4,4),(4,0))','{}');
do $$ begin
 assert private.report_commune_at(0.5,0.5)='TEST1';
 assert private.report_commune_at(1.5,1.5) is null, 'Hole is excluded';
 assert private.report_commune_at(0.5,6.5)='TEST1', 'Disconnected polygon included';
 assert private.report_commune_at(0.5,4) is null, 'Shared border is ambiguous';
 assert (select department_code from private.report_territory_at(0.5,4))='TEST', 'A shared commune border must retain a certain department';
end $$;
-- Same-department overlap is independently filterable from an unknown department.
update private.report_contributions set latitude=0.5,longitude=4 where report_id=md5('territory-report-26')::uuid;
set local role anon;
do $$ declare r jsonb; begin
 r:=public.read_report_analytics('2026-09-20','2026-09-20','all','all',0,'TEST');
 assert (r->>'total')::int=1;
 assert r->'territories'->'departments'->0->>'name'='Test';
 assert (r->'territories'->>'unlocated')::int=1;
 assert (r->'territories'->>'unlocated_departments')::int=0;
 assert r->'reports'->0->>'department_name'='Test';
 assert r->'reports'->0->>'commune_name' is null;
 assert (public.read_report_analytics('2026-09-20','2026-09-20','all','all',0,'TEST','unknown')->>'total')::int=1;
 assert (public.read_report_analytics('2026-09-20','2026-09-20','all','all',0,null,'unknown')->>'total')::int=2;
 assert (public.read_report_analytics('2026-09-20','2026-09-20','all','all',0,'unknown')->>'total')::int=1;
end $$;
reset role;
update private.report_communes set department_code='OTHER' where code='TEST2';
do $$ begin
 assert (select department_code from private.report_territory_at(0.5,4)) is null, 'An ambiguous department stays unassigned';
end $$;
rollback;
select 'PASS: territories, coordinates, deduplication, filters, comparisons, pagination and permissions' result;
