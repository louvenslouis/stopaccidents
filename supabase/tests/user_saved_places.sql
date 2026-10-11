-- Owner-only RPCs encrypt locations before persistence; all fixture data is rolled back.
begin;
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111"}',true);
select public.save_saved_places('{"home_address":"Maison test","work_address":"","home_latitude":18.55,"home_longitude":-72.31}');
do $$ begin
 assert public.read_saved_places()->>'home_address'='Maison test';
 assert (select home_address='' and home_latitude is null and encrypted_payload like 'enc:1:%' from public.user_saved_places);
 begin
 perform public.save_saved_places('{"home_address":"Hors zone","work_address":"","home_latitude":95,"home_longitude":-72.31}');
 raise exception 'Invalid coordinates accepted';
 exception when check_violation then null; end;
 begin
 insert into public.user_saved_places(user_id,home_address) values('22222222-2222-4222-8222-222222222222','Forbidden');
 raise exception 'Direct plaintext write accepted';
 exception when insufficient_privilege then null; end;
end $$;
select public.save_saved_places('{"home_address":"Nouvelle maison","work_address":"Bureau","home_latitude":18.56,"home_longitude":-72.30,"work_latitude":18.54,"work_longitude":-72.32}');
do $$ begin assert public.read_saved_places()->>'home_address'='Nouvelle maison'; end $$;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222"}',true);
do $$ begin
 assert public.read_saved_places() is null;
 assert (select count(*)=0 from public.user_saved_places);
end $$;
set local role anon;
do $$ begin
 begin perform public.read_saved_places(); raise exception 'Anonymous access accepted';
 exception when insufficient_privilege then null; end;
end $$;
rollback;
select 'PASS: encrypted saved places preserve owner access and reject cross-account access' result;
