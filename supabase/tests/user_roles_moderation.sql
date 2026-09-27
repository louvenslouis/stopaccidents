begin;
insert into auth.users(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
update auth.users set is_anonymous=true where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
insert into private.report_event_moderators(user_id,role) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','admin');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","is_anonymous":true}',true);
do $$ begin
 assert public.read_my_role()='user';
 begin perform public.set_user_role('cccccccc-cccc-4ccc-8ccc-cccccccccccc','admin'); raise exception 'Escalation allowed'; exception when insufficient_privilege then null; end;
 begin perform public.moderate_publication('accident',gen_random_uuid(),true,'Test'); raise exception 'User moderated'; exception when insufficient_privilege then null; end;
end $$;
select public.save_accident_report_step('dddddddd-dddd-4ddd-8ddd-dddddddddddd',1,'Delmas',18.55,-72.3,9);
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',true);
select public.set_user_role('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','moderator');
do $$ begin
 assert public.read_my_role()='admin';
 begin perform public.set_user_role('cccccccc-cccc-4ccc-8ccc-cccccccccccc','moderator'); raise exception 'Anonymous promotion allowed'; exception when invalid_parameter_value then null; end;
 begin perform public.set_user_role('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','user'); raise exception 'Last admin removed'; exception when invalid_parameter_value then null; end;
end $$;
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}',true);
do $$ begin
 assert public.read_my_role()='moderator';
 begin perform public.set_user_role('cccccccc-cccc-4ccc-8ccc-cccccccccccc','moderator'); raise exception 'Moderator assigned role'; exception when insufficient_privilege then null; end;
end $$;
select public.moderate_publication('accident','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true,'Information incorrecte');
do $$ begin assert jsonb_array_length(public.read_suspended_publications())=1; end $$;
select set_config('request.jwt.claims','{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc"}',true);
select public.save_accident_report_step('dddddddd-dddd-4ddd-8ddd-dddddddddddd',1,'Lieu modifié',18.55,-72.3,9);
set local role anon;
select set_config('request.jwt.claims','{}',true);
do $$ begin
 assert public.read_accident('dddddddd-dddd-4ddd-8ddd-dddddddddddd') is null;
 assert public.read_accident() is null;
 assert jsonb_array_length(public.read_map_accidents()->'reports')=0;
 assert jsonb_array_length(public.read_map_reports()->'reports')=0;
 assert public.read_latest_report() is null;
 assert public.read_report_event('accident','dddddddd-dddd-4ddd-8ddd-dddddddddddd') is null;
end $$;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',true);
select public.moderate_publication('accident','dddddddd-dddd-4ddd-8ddd-dddddddddddd',false,'Information vérifiée');
do $$ begin assert public.read_accident('dddddddd-dddd-4ddd-8ddd-dddddddddddd') is not null; end $$;
select public.set_user_role('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','user');
select set_config('request.jwt.claims','{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"}',true);
do $$ begin
 assert public.read_my_role()='user';
 begin perform public.moderate_publication('accident','dddddddd-dddd-4ddd-8ddd-dddddddddddd',true,'Test'); raise exception 'Revoked moderator accepted'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select set_config('request.jwt.claims','{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}',true);
do $$ declare k text; report uuid; value jsonb; begin
 for k in select kind from private.report_event_rules loop
 report:=gen_random_uuid();
 execute format('select public.save_%I_report_step($1,1,$2,18.55,-72.3,9)',k) using report,'Test catégorie';
 perform public.moderate_publication(k,report,true,'Vérification');
 if k='accident' then value:=public.read_accident(report);
 else execute format('select public.read_%I_report($1)',k) into value using report; end if;
 assert value is null, 'Suspended details remain visible: '||k;
 perform public.moderate_publication(k,report,false,'Vérifié');
 if k='accident' then value:=public.read_accident(report);
 else execute format('select public.read_%I_report($1)',k) into value using report; end if;
 assert value is not null, 'Restored details absent: '||k;
 end loop;
end $$;
rollback;
select 'PASS: roles, escalation prevention, suspension, author edits, restoration and revocation' as result;
