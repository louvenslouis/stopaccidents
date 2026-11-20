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
 begin perform public.delete_publications('[]'); raise exception 'User allowed batch deletion'; exception when insufficient_privilege then null; end;
 begin perform public.delete_publication('accident',gen_random_uuid()); raise exception 'Ordinary user deleted'; exception when insufficient_privilege then null; end;
 begin perform public.pending_report_photo_deletions(); raise exception 'Ordinary user read cleanup paths'; exception when insufficient_privilege then null; end;
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
do $$ declare k text; report uuid; value jsonb; remains boolean; begin
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
 perform public.delete_publication(k,report);
 perform public.delete_publication(k,report);
 assert not exists(select 1 from private.report_contributions where kind=k and report_id=report);
 execute format('select exists(select 1 from public.%I where id=$1)',k||'_reports') into remains using report;
 assert not remains;
 begin
   execute format('select public.save_%I_report_step($1,1,$2,18.55,-72.3,9)',k) using report,'Reprise tardive';
   raise exception 'Offline save recreated deleted publication';
 exception when invalid_parameter_value then null; end;
 end loop;
end $$;

do $$ declare
 target uuid := 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'; other uuid := gen_random_uuid();
 group_id uuid; path text; keep text;
begin
 select event_id into strict group_id from private.report_contributions where kind='accident' and report_id=target;
 perform public.prepare_report_testimony('accident',other,target);
 perform public.save_accident_report_step(other,1,'Autre témoignage',18.55,-72.3,9);
 path:='cccccccc-cccc-4ccc-8ccc-cccccccccccc/'||target||'/example.jpg';
 keep:='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/'||other||'/example.jpg';
 insert into storage.objects(bucket_id,name) values('accident-photos',path),('accident-photos',keep);
 insert into public.accident_report_photos(report_id,storage_path,captured_at) values(target,path,now());
 insert into private.report_comments(event_id,body) values(group_id,'Discussion');
 insert into private.report_confirmations(event_id,user_id) values(group_id,auth.uid());
 insert into public.report_rewards(report_kind,report_id,user_id) values('accident',target,auth.uid());
 perform public.moderate_publication('accident',target,true,'Test de retrait');
 perform public.delete_publication('accident',target);
 assert public.read_accident(target) is null;
 assert public.read_accident(other) is not null;
 assert not exists(select 1 from public.report_rewards where report_kind='accident' and report_id=target);
 assert not exists(select 1 from private.publication_moderation_history where kind='accident' and report_id=target);
 assert exists(select 1 from private.report_comments where event_id=group_id);
 assert exists(select 1 from private.report_confirmations where event_id=group_id);
 assert not exists(select 1 from public.accident_report_photos where report_id=target);
 assert exists(select 1 from private.report_events where id=group_id);
 assert (select count(*)=1 from public.pending_report_photo_deletions());
 assert exists(select 1 from public.pending_report_photo_deletions() q where q.name=path);
 assert not exists(select 1 from public.pending_report_photo_deletions() q where q.name=keep);
 perform public.delete_publication('accident',other);
 assert not exists(select 1 from private.report_events where id=group_id);
 assert not exists(select 1 from private.report_comments where event_id=group_id);
 assert not exists(select 1 from private.report_confirmations where event_id=group_id);
end $$;
-- Only selected publications are deleted, including mixed categories and retries.
do $$ declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); keeper uuid := gen_random_uuid(); batch jsonb;
begin
 perform public.save_accident_report_step(a,1,'Lot A',18.55,-72.3,9);
 perform public.save_fire_report_step(b,1,'Lot B',18.55,-72.3,9);
 perform public.save_accident_report_step(keeper,1,'À conserver',18.55,-72.3,9);
 batch := jsonb_build_array(jsonb_build_object('kind','accident','id',a),jsonb_build_object('kind','fire','id',b));
 begin
   perform public.delete_publications(batch || jsonb_build_array(jsonb_build_object('kind','accident','id',gen_random_uuid())));
   raise exception 'Invalid batch succeeded';
 exception when invalid_parameter_value then null; end;
 assert public.read_accident(a) is not null and public.read_fire_report(b) is not null;
 assert public.delete_publications(batch || batch)=2;
 assert public.delete_publications(batch)=2;
 assert public.read_accident(a) is null and public.read_fire_report(b) is null and public.read_accident(keeper) is not null;
end $$;
rollback;
select 'PASS: roles, escalation prevention, suspension, author edits, restoration and revocation' as result;
