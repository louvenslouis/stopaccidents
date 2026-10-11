-- Server-side encryption. Vault stores random keys encrypted under the project root key.
-- No secrets are literals in this migration, returned to a client, or logged.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
-- Fail closed if Vault is unavailable; never fall back to a plaintext key table.
do $$ begin
 if to_regclass('vault.decrypted_secrets') is null then raise exception 'Supabase Vault is required'; end if;
end $$;
create table private.data_encryption_keys (
 version integer primary key, secret_id uuid not null unique references vault.secrets(id),
 active boolean not null default false, created_at timestamptz not null default now()
);
create unique index data_encryption_one_active on private.data_encryption_keys(active) where active;
create table private.data_lookup_key (id boolean primary key default true check(id), secret_id uuid not null references vault.secrets(id));
alter table private.data_encryption_keys enable row level security;
alter table private.data_lookup_key enable row level security;
revoke all on private.data_encryption_keys,private.data_lookup_key from public,anon,authenticated,service_role;
-- Vault is managed by Supabase: do not rewrite extension-owned ACLs.
-- Abort if an end-user SQL role can access its secrets.
do $$ begin
 if has_schema_privilege('anon','vault','USAGE') or has_schema_privilege('authenticated','vault','USAGE')
 or has_table_privilege('anon','vault.decrypted_secrets','SELECT') or has_table_privilege('authenticated','vault.decrypted_secrets','SELECT')
 then raise exception 'Vault must not be accessible to client roles'; end if;
end $$;
-- Managed Vault retains provider-granted SQL access for privileged service_role.
-- It is a trusted backend role, never a client credential; Vault is not an exposed API schema.
do $$ declare secret uuid; begin
 secret:=vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'user-data-encryption-v1','Server-side user data encryption; retain for decryption after rotation');
 insert into private.data_encryption_keys(version,secret_id,active) values(1,secret,true);
 secret:=vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'user-data-lookup-v1','Separate HMAC key for private exact matching');
 insert into private.data_lookup_key(secret_id) values(secret);
end $$;

-- Invoker rights: only trusted definer functions and the DB administrator can call these.
create function private.encrypt_user_data(p_value jsonb,p_context text) returns text
language plpgsql volatile set search_path='' as $$
declare v integer; secret text; result bytea;
begin
 if p_value is null or p_context is null then raise exception 'encryption_invalid_input'; end if;
 select k.version,s.decrypted_secret into strict v,secret from private.data_encryption_keys k
 join vault.decrypted_secrets s on s.id=k.secret_id where k.active;
 result:=extensions.pgp_sym_encrypt(jsonb_build_object('context',p_context,'data',p_value)::text,secret,
 'cipher-algo=aes256,compress-algo=0,s2k-mode=3,s2k-count=65536,disable-mdc=0');
 return 'enc:1:'||v::text||':'||encode(result,'base64');
end $$;
create function private.decrypt_user_data(p_value text,p_context text) returns jsonb
language plpgsql stable set search_path='' as $$
declare secret text; envelope jsonb; v integer;
begin
 if p_value is null then return null; end if;
 if p_context is null or p_value !~ '^enc:1:[1-9][0-9]*:' then raise exception 'encrypted_data_invalid'; end if;
 v:=split_part(p_value,':',3)::integer;
 select s.decrypted_secret into strict secret from private.data_encryption_keys k join vault.decrypted_secrets s on s.id=k.secret_id where k.version=v;
 envelope:=extensions.pgp_sym_decrypt(decode(substring(p_value from length('enc:1:'||v::text||':')+1),'base64'),secret)::jsonb;
 if envelope->>'context' is distinct from p_context then raise exception 'encrypted_data_invalid'; end if;
 return envelope->'data';
exception when others then raise exception 'encrypted_data_unavailable' using errcode='22000';
end $$;
create function private.safety_lookup(p_kind text,p_value text) returns text
language plpgsql stable set search_path='' as $$
declare secret text; normalized text:=private.normalize_safety_identifier(p_value);
begin
 if normalized is null then return null; end if;
 select s.decrypted_secret into strict secret from private.data_lookup_key k join vault.decrypted_secrets s on s.id=k.secret_id where k.id;
 return encode(extensions.hmac(convert_to(p_kind||':'||normalized,'UTF8'),decode(secret,'hex'),'sha256'),'hex');
end $$;
revoke all on function private.encrypt_user_data(jsonb,text),private.decrypt_user_data(text,text),private.safety_lookup(text,text) from public,anon,authenticated,service_role;

-- Profile columns retain only a keyed lookup token and encrypted payload.
lock table private.safety_records,public.accident_report_identifiers,private.safety_report_identifiers in access exclusive mode;
alter table private.safety_records add column encrypted_payload text;
do $$ declare c record; begin
 for c in select conname from pg_constraint where conrelid='private.safety_records'::regclass and contype='c' loop
 execute format('alter table private.safety_records drop constraint %I',c.conname); end loop;
end $$;
update private.safety_records set encrypted_payload=private.encrypt_user_data(jsonb_build_object('value',value,'vehicle_type',vehicle_type,'color',color),'safety:'||owner_id||':'||id),
 value=private.safety_lookup(kind,value),vehicle_type=null,color=null;
alter table private.safety_records alter column encrypted_payload set not null;
alter table private.safety_records add constraint safety_record_encrypted check(kind in ('identity','registration') and value ~ '^[a-f0-9]{64}$' and vehicle_type is null and color is null and encrypted_payload like 'enc:1:%');

create or replace function private.read_safety_profile() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare account uuid:=private.connection_account();
begin
 return jsonb_build_object('alerts_enabled',coalesce((select alerts_enabled from private.safety_preferences where owner_id=account),false),
 'records',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'value',payload->>'value',
 'vehicle_type',payload->>'vehicle_type','color',payload->>'color','photo_path',photo_path) order by created_at,id),'[]'::jsonb)
 from private.safety_records s cross join lateral (select private.decrypt_user_data(s.encrypted_payload,'safety:'||s.owner_id||':'||s.id) payload) d where owner_id=account));
end $$;

create or replace function private.save_safety_record(p_id uuid,p_kind text,p_value text,p_vehicle_type text,p_color text,p_photo_path text) returns uuid
language plpgsql security definer set search_path='' as $$
declare account uuid:=private.connection_account(); normalized text:=private.normalize_safety_identifier(p_value); result uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('safety-profile:'||account::text,0));
 if p_id is null or p_kind is null or p_kind not in ('registration','identity') or p_value is null or char_length(p_value)>100
 or normalized is null or char_length(normalized) not between 3 and 80
 or (p_kind='identity' and char_length(normalized)<4)
 or (p_kind='registration' and (char_length(normalized)>32 or p_vehicle_type is null
 or p_vehicle_type not in ('car','motorcycle','suv','pickup','van','truck','bus','other')
 or p_color is null or char_length(trim(p_color)) not between 2 and 40))
 then raise exception 'safety_invalid_record' using errcode='22023'; end if;
 if exists(select 1 from private.safety_records where id=p_id and (owner_id<>account or kind<>p_kind))
 then raise exception 'safety_record_unavailable' using errcode='42501'; end if;
 if not exists(select 1 from private.safety_records where id=p_id) and
 (select count(*) from private.safety_records where owner_id=account and kind=p_kind)>=(case when p_kind='identity' then 1 else 10 end)
 then raise exception 'safety_record_limit' using errcode='22023'; end if;
 if p_photo_path is not null and (p_kind<>'identity' or split_part(p_photo_path,'/',1)<>account::text
 or p_photo_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
 or not exists(select 1 from private.identity_photo_data where owner_id=account and path=p_photo_path))
 then raise exception 'safety_photo_unavailable' using errcode='42501'; end if;
 insert into private.safety_records(id,owner_id,kind,value,vehicle_type,color,photo_path,encrypted_payload)
 values(p_id,account,p_kind,private.safety_lookup(p_kind,normalized),null,null,p_photo_path,
 private.encrypt_user_data(jsonb_build_object('value',normalized,'vehicle_type',case when p_kind='registration' then p_vehicle_type end,
 'color',case when p_kind='registration' then trim(p_color) end),'safety:'||account||':'||p_id))
 on conflict(id) do update set value=excluded.value,vehicle_type=excluded.vehicle_type,color=excluded.color,
 photo_path=excluded.photo_path,encrypted_payload=excluded.encrypted_payload,updated_at=now(),
 -- A changed identifier cannot subscribe to older events.
 created_at=case when safety_records.value=excluded.value then safety_records.created_at else now() end
 returning id into result;
 return result;
exception when unique_violation then raise exception 'safety_duplicate_record' using errcode='23505';
end $$;

-- Encrypt report identifiers before their first write, including direct API inserts.
alter table public.accident_report_identifiers add column value_lookup text;
alter table public.accident_report_identifiers drop constraint accident_report_identifiers_value_check;
alter table public.accident_report_identifiers drop constraint accident_report_identifiers_report_id_kind_value_key;
-- No new alerts are emitted by this format-only backfill.
alter table public.accident_report_identifiers disable trigger safety_identifiers_changed;
update public.accident_report_identifiers set value_lookup=private.safety_lookup(kind,value),
 value=private.encrypt_user_data(to_jsonb(value),'accident-identifier:'||report_id||':'||id);
alter table public.accident_report_identifiers enable trigger safety_identifiers_changed;
alter table public.accident_report_identifiers add constraint accident_identifier_encrypted check(value like 'enc:1:%');
create index accident_identifier_lookup on public.accident_report_identifiers(kind,value_lookup);
create function private.encrypt_accident_identifier() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.value is null or char_length(trim(new.value)) not between 1 and 80 then raise exception 'Invalid identifier' using errcode='23514'; end if;
 new.value_lookup:=private.safety_lookup(new.kind,new.value);
 new.value:=private.encrypt_user_data(to_jsonb(new.value),'accident-identifier:'||new.report_id||':'||new.id);
 return new;
end $$;
revoke all on function private.encrypt_accident_identifier() from public,anon,authenticated,service_role;
create trigger encrypt_accident_identifier before insert on public.accident_report_identifiers for each row execute function private.encrypt_accident_identifier();
-- No direct encrypted-column updates are granted to clients.

alter table private.safety_report_identifiers add column encrypted_payload text;
alter table private.safety_report_identifiers disable trigger safety_extra_identifiers_changed;
update private.safety_report_identifiers set encrypted_payload=private.encrypt_user_data(to_jsonb(value),'report-identifier:'||report_kind||':'||report_id||':'||kind),value=private.safety_lookup(kind,value);
alter table private.safety_report_identifiers enable trigger safety_extra_identifiers_changed;
alter table private.safety_report_identifiers alter column encrypted_payload set not null;
alter table private.safety_report_identifiers add constraint extra_identifier_encrypted check(value ~ '^[a-f0-9]{64}$' and encrypted_payload like 'enc:1:%');


create or replace function private.save_vehicle_report_identifier(p_report uuid,p_registration text) returns void
language plpgsql security definer set search_path='' as $$
declare normalized text:=private.normalize_safety_identifier(p_registration);
begin
 if auth.uid() is null or not exists(select 1 from private.report_contributions where kind='suspicious_vehicle' and report_id=p_report and reporter_id=auth.uid())
 then raise exception 'Report unavailable' using errcode='42501'; end if;
 if p_registration is null or char_length(p_registration)>80 or (trim(p_registration)<>'' and (normalized is null or char_length(normalized) not between 3 and 32))
 then raise exception 'safety_invalid_record' using errcode='22023'; end if;
 delete from private.safety_report_identifiers where report_kind='suspicious_vehicle' and report_id=p_report;
 if normalized is not null then insert into private.safety_report_identifiers(report_kind,report_id,kind,value,encrypted_payload) values('suspicious_vehicle',p_report,'registration',private.safety_lookup('registration',normalized),private.encrypt_user_data(to_jsonb(normalized),'report-identifier:suspicious_vehicle:'||p_report||':registration')); end if;
end $$;

create or replace function private.report_safety_identifiers(p_kind text,p_report uuid) returns table(kind text,value text)
language sql stable security definer set search_path='' as $$
 select i.kind,i.value_lookup from public.accident_report_identifiers i where p_kind='accident' and i.report_id=p_report
 union all select i.kind,i.value from private.safety_report_identifiers i where i.report_kind=p_kind and i.report_id=p_report;
$$;

create or replace function private.safety_event_evidence(p_event uuid,p_subject uuid,p_recipient uuid)
returns table(report_id uuid,report_kind text,location text,occurred_at timestamptz,match_kind text)
language sql stable security definer set search_path='' as $$
 select c.report_id,c.kind,c.summary->>'location_description',c.created_at,i.kind
 from private.report_contributions c
 cross join lateral private.report_safety_identifiers(c.kind,c.report_id) i
 join private.safety_records s on s.owner_id=p_subject and s.kind=i.kind
 and s.value=i.value and s.created_at<=c.created_at
 join private.safety_preferences pref on pref.owner_id=p_subject and pref.alerts_enabled and pref.enabled_at<=c.created_at
 where c.published and c.status<>'closed' and private.report_event_root(c.event_id)=private.report_event_root(p_event)
 and exists(select 1 from private.user_connections x where x.status='accepted' and x.accepted_at<=c.created_at
 and ((x.sender_id=p_subject and x.recipient_id=p_recipient) or (x.recipient_id=p_subject and x.sender_id=p_recipient)))
 order by c.created_at desc,c.report_id,i.kind limit 1;
$$;

create or replace function private.match_safety_report(p_kind text,p_report uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c private.report_contributions%rowtype; candidate record; alert uuid; root uuid;
begin
 select * into c from private.report_contributions where kind=p_kind and report_id=p_report;
 -- Do not alert for historical edits or unpublished, closed or suspended events.
 if not found or not c.published or c.status='closed' or c.created_at<now()-interval '48 hours' then return; end if;
 root:=private.report_event_root(c.event_id);
 for candidate in
 select distinct s.owner_id,case when x.sender_id=s.owner_id then x.recipient_id else x.sender_id end recipient
 from private.report_safety_identifiers(p_kind,p_report) i
 join private.safety_records s on s.kind=i.kind and s.value=i.value and s.created_at<=c.created_at
 join private.safety_preferences p on p.owner_id=s.owner_id and p.alerts_enabled and p.enabled_at<=c.created_at
 join private.user_connections x on (x.sender_id=s.owner_id or x.recipient_id=s.owner_id) and x.status='accepted' and x.accepted_at<=c.created_at
 loop
 -- Serializes different reports about the same person, including concurrent contributions.
 perform pg_advisory_xact_lock(hashtextextended('safety-alert:'||candidate.owner_id::text||candidate.recipient::text,0));
 if exists(select 1 from private.safety_alerts a where a.subject_id=candidate.owner_id and a.recipient_id=candidate.recipient
 and private.report_event_root(a.event_id)=root) then continue; end if;
 insert into private.safety_alerts(event_id,subject_id,recipient_id) values(root,candidate.owner_id,candidate.recipient)
 on conflict do nothing returning id into alert;
 if alert is not null then
 insert into private.safety_push_queue(alert_id,device_id)
 select alert,d.id from private.safety_push_devices d where d.owner_id=candidate.recipient
 and d.updated_at>now()-interval '30 days' on conflict do nothing;
 end if;
 end loop;
end $$;

create or replace function private.read_accident(p_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  report public.accident_reports%rowtype;
  viewer_id uuid := auth.uid();
  is_owner boolean;
  result jsonb;
begin
  if p_id is null then
    select * into report from public.accident_reports where private.publication_visible('accident',id) order by created_at desc, id desc limit 1;
  else
    select * into report from public.accident_reports where id = p_id and private.publication_visible('accident',id);
  end if;
  if not found then return null; end if;
  is_owner := viewer_id is not null and report.reporter_id = viewer_id;
  result := jsonb_build_object(
    'id', report.id, 'location_description', report.location_description,
    'latitude', report.latitude, 'longitude', report.longitude,
    'accident_type', report.accident_type, 'severity', report.severity,
    'occurred_at', report.occurred_at, 'location_source', report.location_source, 'created_at', report.created_at, 'completed_step', report.completed_step
  );
  if p_id is null then return result; end if;
  return result || jsonb_build_object(
    'location_accuracy_m', report.location_accuracy_m, 'notes', report.notes,
    'status', report.status, 'updated_at', report.updated_at,
    'is_owner', is_owner,
    'identifiers', case when is_owner then (
      select coalesce(jsonb_agg(jsonb_build_object('kind', i.kind, 'value', private.decrypt_user_data(i.value,'accident-identifier:'||i.report_id||':'||i.id)#>>'{}') order by i.kind, i.value), '[]'::jsonb)
      from public.accident_report_identifiers i where i.report_id = report.id
    ) else '[]'::jsonb end,
    'photos', (
      select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'storage_path', p.storage_path, 'captured_at', p.captured_at) order by p.captured_at, p.id), '[]'::jsonb)
      from public.accident_report_photos p where p.report_id = report.id
    )
  );
end;
$$;

-- Private identity photographs use the same protected server-side encryption path.
-- Refuse deployment while legacy object bytes still need migration; never discard them.
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='identity-cards') then
 raise exception 'Migrate existing identity-card objects before enabling encrypted photo storage'; end if;
end $$;
create table private.identity_photo_data (
 path text primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 encrypted_payload text not null check(encrypted_payload like 'enc:1:%'), created_at timestamptz not null default now()
);
create index identity_photo_owner on private.identity_photo_data(owner_id);
alter table private.identity_photo_data enable row level security;
revoke all on private.identity_photo_data from public,anon,authenticated,service_role;
drop policy identity_cards_upload on storage.objects;
drop policy identity_cards_read on storage.objects;
drop policy identity_cards_cleanup on storage.objects;

create function private.save_identity_photo(p_path text,p_base64 text) returns void
language plpgsql security definer set search_path='' as $$
declare account uuid:=private.connection_account(); bytes bytea;
begin
 if p_path is null or p_base64 is null or length(p_base64)>8388608 or
 split_part(p_path,'/',1)<>account::text or p_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
 then raise exception 'safety_photo_unavailable' using errcode='22023'; end if;
 bytes:=decode(p_base64,'base64');
 if octet_length(bytes) not between 3 and 6291456 or substring(bytes from 1 for 3)<>decode('ffd8ff','hex') then raise exception 'safety_photo_unavailable' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('safety-profile:'||account::text,0));
 if (select count(*) from private.identity_photo_data where owner_id=account)>=5 then raise exception 'safety_photo_limit' using errcode='22023'; end if;
 insert into private.identity_photo_data(path,owner_id,encrypted_payload)
 values(p_path,account,private.encrypt_user_data(to_jsonb(encode(bytes,'base64')),'identity-photo:'||p_path));
end $$;
create function private.read_identity_photo(p_path text) returns text
language plpgsql stable security definer set search_path='' as $$
declare account uuid:=private.connection_account(); result text;
begin
 select private.decrypt_user_data(encrypted_payload,'identity-photo:'||path)#>>'{}' into result
 from private.identity_photo_data where path=p_path and owner_id=account;
 if not found then raise exception 'safety_photo_unavailable' using errcode='42501'; end if;
 return result;
end $$;
create function private.delete_identity_photo(p_path text) returns void
language plpgsql security definer set search_path='' as $$
declare account uuid:=private.connection_account();
begin
 perform pg_advisory_xact_lock(hashtextextended('safety-profile:'||account::text,0));
 delete from private.identity_photo_data where path=p_path and owner_id=account
 and not exists(select 1 from private.safety_records where photo_path=p_path);
end $$;
create function public.save_identity_photo(p_path text,p_base64 text) returns void
language sql security invoker set search_path='' as $$ select private.save_identity_photo(p_path,p_base64); $$;
create function public.read_identity_photo(p_path text) returns text
language sql security invoker set search_path='' as $$ select private.read_identity_photo(p_path); $$;
create function public.delete_identity_photo(p_path text) returns void
language sql security invoker set search_path='' as $$ select private.delete_identity_photo(p_path); $$;
revoke all on function private.save_identity_photo(text,text),private.read_identity_photo(text),private.delete_identity_photo(text),
 public.save_identity_photo(text,text),public.read_identity_photo(text),public.delete_identity_photo(text) from public,anon,authenticated,service_role;
grant execute on function private.save_identity_photo(text,text),private.read_identity_photo(text),private.delete_identity_photo(text),
 public.save_identity_photo(text,text),public.read_identity_photo(text),public.delete_identity_photo(text) to authenticated;

-- Home/work locations: keep existing writes/RLS, encrypt before committing,
-- and expose plaintext only through an owner-checked read RPC.
alter table public.user_saved_places add column encrypted_payload text;
create function private.encrypt_saved_places() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if char_length(new.home_address)>500 or char_length(new.work_address)>500
 or (new.home_address<>'' and char_length(trim(new.home_address))<3)
 or (new.work_address<>'' and char_length(trim(new.work_address))<3)
 or (new.home_address='' and new.work_address='')
 or (new.home_latitude is null)<>(new.home_longitude is null)
 or (new.work_latitude is null)<>(new.work_longitude is null)
 or (new.home_latitude is not null and (new.home_latitude not between 18.0 and 20.1 or new.home_longitude not between -74.55 and -71.6 or new.home_address=''))
 or (new.work_latitude is not null and (new.work_latitude not between 18.0 and 20.1 or new.work_longitude not between -74.55 and -71.6 or new.work_address=''))
 then raise exception 'Invalid saved place' using errcode='23514'; end if;
 new.encrypted_payload:=private.encrypt_user_data(jsonb_build_object('home_address',new.home_address,'work_address',new.work_address,
 'home_latitude',new.home_latitude,'home_longitude',new.home_longitude,'work_latitude',new.work_latitude,'work_longitude',new.work_longitude),'saved-places:'||new.user_id);
 new.home_address:=''; new.work_address:=''; new.home_latitude:=null; new.home_longitude:=null; new.work_latitude:=null; new.work_longitude:=null;
 return new;
end $$;
revoke all on function private.encrypt_saved_places() from public,anon,authenticated,service_role;
alter table public.user_saved_places drop constraint user_saved_places_not_empty;
update public.user_saved_places set encrypted_payload=private.encrypt_user_data(to_jsonb(user_saved_places)-'user_id'-'updated_at'-'encrypted_payload','saved-places:'||user_id),
 home_address='',work_address='',home_latitude=null,home_longitude=null,work_latitude=null,work_longitude=null;
alter table public.user_saved_places alter column encrypted_payload set not null;
alter table public.user_saved_places add constraint saved_places_encrypted check(encrypted_payload like 'enc:1:%' and home_address='' and work_address='' and home_latitude is null and home_longitude is null and work_latitude is null and work_longitude is null);
-- Upserts run both BEFORE INSERT and BEFORE UPDATE. Use an explicit write RPC instead.
revoke insert,update on public.user_saved_places from authenticated;
revoke insert(updated_at,user_id,home_address,work_address,home_latitude,home_longitude,work_latitude,work_longitude),update(user_id,home_address,work_address,updated_at,home_latitude,home_longitude,work_latitude,work_longitude) on public.user_saved_places from authenticated;
create function private.read_saved_places() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare account uuid:=private.connection_account();
begin return (select private.decrypt_user_data(encrypted_payload,'saved-places:'||user_id) from public.user_saved_places where user_id=account); end $$;
create function private.save_saved_places(p_places jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare account uuid:=private.connection_account(); row public.user_saved_places;
begin
 row:=jsonb_populate_record(null::public.user_saved_places,p_places);
 if row.home_address is null or row.work_address is null then raise exception 'Invalid saved place' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('saved-places:'||account::text,0));
 if exists(select 1 from public.user_saved_places where user_id=account) then
 update public.user_saved_places set home_address=row.home_address,work_address=row.work_address,home_latitude=row.home_latitude,home_longitude=row.home_longitude,work_latitude=row.work_latitude,work_longitude=row.work_longitude,updated_at=now() where user_id=account;
 else
 insert into public.user_saved_places(user_id,home_address,work_address,home_latitude,home_longitude,work_latitude,work_longitude)
 values(account,row.home_address,row.work_address,row.home_latitude,row.home_longitude,row.work_latitude,row.work_longitude);
 end if;
end $$;
create trigger zz_encrypt_saved_places before insert or update of home_address,work_address,home_latitude,home_longitude,work_latitude,work_longitude on public.user_saved_places for each row execute function private.encrypt_saved_places();
create function public.read_saved_places() returns jsonb language sql security invoker set search_path='' as $$ select private.read_saved_places(); $$;
create function public.save_saved_places(p_places jsonb) returns void language sql security invoker set search_path='' as $$ select private.save_saved_places(p_places); $$;
revoke all on function private.read_saved_places(),private.save_saved_places(jsonb),public.read_saved_places(),public.save_saved_places(jsonb) from public,anon,authenticated,service_role;
grant execute on function private.read_saved_places(),private.save_saved_places(jsonb),public.read_saved_places(),public.save_saved_places(jsonb) to authenticated;

-- Latest shared position: encrypt coordinates while preserving expiry and consent checks.
alter table private.location_shares add column encrypted_position text;
update private.location_shares set encrypted_position=case when latitude is not null then private.encrypt_user_data(jsonb_build_object('latitude',latitude,'longitude',longitude,'accuracy',accuracy),'live-location:'||owner_id) end,
 latitude=null,longitude=null,accuracy=null;
alter table private.location_shares add constraint live_location_encrypted check(latitude is null and longitude is null and accuracy is null and (encrypted_position is null or encrypted_position like 'enc:1:%'));


create or replace function private.start_location_share(p_connections uuid[], p_minutes integer)
returns jsonb language plpgsql volatile security definer set search_path = '' as $$
declare account uuid := private.connection_account(); share private.location_shares;
begin
  if p_minutes is null or p_minutes not in (15,60,480) or
     p_connections is null or cardinality(p_connections) = 0 or cardinality(p_connections) > 500 then
    raise exception 'location_invalid_selection' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_connections) selected(id) where selected.id is null or not exists (
    select 1 from private.user_connections c where c.id = selected.id and c.status = 'accepted'
      and account in (c.sender_id,c.recipient_id)
  )) then
    raise exception 'location_invalid_selection' using errcode = '42501';
  end if;
  -- Serializes replacement, stop and publish for this owner, including multiple devices.
  perform pg_advisory_xact_lock(hashtextextended(account::text, 731));
  insert into private.location_shares(owner_id, expires_at)
    values (account, now() + make_interval(mins => p_minutes))
    on conflict (owner_id) do update set token = gen_random_uuid(), expires_at = excluded.expires_at,
      latitude = null, longitude = null, accuracy = null, captured_at = null, encrypted_position=null
    returning * into share;
  delete from private.location_share_recipients where owner_id = account;
  insert into private.location_share_recipients(owner_id,connection_id)
    select account, id from (select distinct unnest(p_connections) id) selected;
  return jsonb_build_object('token',share.token,'expires_at',share.expires_at);
end;
$$;

create or replace function private.publish_live_location(p_token uuid, p_latitude double precision,
  p_longitude double precision, p_accuracy double precision, p_captured_at timestamptz)
returns boolean language plpgsql volatile security definer set search_path = '' as $$
declare account uuid := private.connection_account();
begin
  if p_latitude is null or p_longitude is null or not (p_latitude between -90 and 90)
    or not (p_longitude between -180 and 180)
    or (p_accuracy is not null and not (p_accuracy >= 0 and p_accuracy < 'Infinity'::double precision))
    or p_captured_at is null or p_captured_at < now() - interval '90 seconds'
    or p_captured_at > now() + interval '10 seconds' then
    raise exception 'location_invalid_position' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(account::text, 731));
  update private.location_shares set encrypted_position=private.encrypt_user_data(jsonb_build_object('latitude',p_latitude,'longitude',p_longitude,'accuracy',p_accuracy),'live-location:'||account), captured_at = p_captured_at
    where owner_id = account and token = p_token and expires_at > now()
      and (captured_at is null or captured_at < p_captured_at);
  -- An older sample is ignored, without ending an otherwise active session.
  return exists (select 1 from private.location_shares
    where owner_id = account and token = p_token and expires_at > now());
end;
$$;

create or replace function private.read_location_shares()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare account uuid := private.connection_account();
begin
  return jsonb_build_object(
    'outgoing', (select jsonb_build_object('expires_at',s.expires_at,
      'connections', (select coalesce(jsonb_agg(r.connection_id),'[]'::jsonb)
        from private.location_share_recipients r where r.owner_id = account))
      from private.location_shares s where s.owner_id = account and s.expires_at > now()),
    'incoming', (select coalesce(jsonb_agg(jsonb_build_object(
      'connection_id',c.id,'alias',a.alias,'latitude',position->'latitude','longitude',position->'longitude',
      'accuracy',position->'accuracy','captured_at',s.captured_at,'expires_at',s.expires_at)),'[]'::jsonb)
      from private.location_share_recipients r
      join private.location_shares s on s.owner_id = r.owner_id
      cross join lateral (select private.decrypt_user_data(s.encrypted_position,'live-location:'||s.owner_id) position) decrypted
      join private.user_connections c on c.id = r.connection_id and c.status = 'accepted'
      join public.user_aliases a on a.user_id = s.owner_id
      where account in (c.sender_id,c.recipient_id) and s.owner_id <> account
        and s.owner_id in (c.sender_id,c.recipient_id) and s.expires_at > now()
        and s.captured_at > now() - interval '90 seconds')
  );
end;
$$;

-- Saved routes and their derived geographic bounds are encrypted together.
alter table public.user_routes add column encrypted_payload text;
create function private.route_plain(p_route public.user_routes) returns public.user_routes
language sql stable set search_path='' as $$
 select jsonb_populate_record(p_route,private.decrypt_user_data(p_route.encrypted_payload,'route:'||p_route.user_id||':'||p_route.id));
$$;
revoke all on function private.route_plain(public.user_routes) from public,anon,authenticated,service_role;
drop trigger validate_user_route on public.user_routes;
drop trigger update_route_bounds on public.user_routes;
-- Existing checks evaluate the plaintext in the validating trigger before it is sealed.
do $$ declare col text; begin
 foreach col in array array['name','waypoints','coordinates','distance_meters','duration_seconds','departure_time','weekdays','timezone','duration_minutes','lead_minutes'] loop
 execute format('alter table public.user_routes alter column %I drop not null',col);
 end loop;
end $$;
update public.user_routes set encrypted_payload=private.encrypt_user_data(to_jsonb(user_routes)-'id'-'user_id'-'created_at'-'updated_at'-'alerts_enabled'-'encrypted_payload','route:'||user_id||':'||id),
 name=null,waypoints=null,coordinates=null,distance_meters=null,duration_seconds=null,departure_time=null,weekdays=null,timezone=null,duration_minutes=null,lead_minutes=null;
alter table public.user_routes alter column encrypted_payload set not null;
alter table public.user_routes add constraint route_encrypted check(encrypted_payload like 'enc:1:%' and name is null and waypoints is null and coordinates is null and distance_meters is null and duration_seconds is null and departure_time is null and weekdays is null and timezone is null and duration_minutes is null and lead_minutes is null);
create function private.encrypt_user_route() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.name is null or char_length(trim(new.name)) not between 1 and 80 or new.waypoints is null or new.coordinates is null
 or new.distance_meters is null or not(new.distance_meters>0 and new.distance_meters<=1000000)
 or new.duration_seconds is null or not(new.duration_seconds>0 and new.duration_seconds<=86400)
 or new.departure_time is null or new.departure_time>=time '24:00' or new.weekdays is null or new.timezone is null
 or new.duration_minutes is null or new.duration_minutes not between 5 and 240
 or new.lead_minutes is null or new.lead_minutes not in (0,15,30,60)
 then raise exception 'route_invalid_schedule' using errcode='22023'; end if;
 new.encrypted_payload:=private.encrypt_user_data(to_jsonb(new)-'id'-'user_id'-'created_at'-'updated_at'-'alerts_enabled'-'encrypted_payload','route:'||new.user_id||':'||new.id);
 new.name:=null;new.waypoints:=null;new.coordinates:=null;new.distance_meters:=null;new.duration_seconds:=null;
 new.departure_time:=null;new.weekdays:=null;new.timezone:=null;new.duration_minutes:=null;new.lead_minutes:=null;
 return new;
end $$;
revoke all on function private.encrypt_user_route() from public,anon,authenticated,service_role;
create trigger validate_user_route before insert or update of name,waypoints,coordinates,distance_meters,duration_seconds,departure_time,weekdays,timezone,duration_minutes,lead_minutes
 on public.user_routes for each row execute function private.validate_user_route();
create trigger zz_encrypt_user_route before insert or update of name,waypoints,coordinates,distance_meters,duration_seconds,departure_time,weekdays,timezone,duration_minutes,lead_minutes
 on public.user_routes for each row execute function private.encrypt_user_route();
revoke insert,update on public.user_routes from authenticated;
-- Alert toggles and deletions still use existing owner RLS; content uses the checked RPC.
grant update(alerts_enabled) on public.user_routes to authenticated;

alter table private.route_bounds add column encrypted_payload text;
alter table private.route_bounds alter column min_lat drop not null,alter column max_lat drop not null,alter column min_lon drop not null,alter column max_lon drop not null;
update private.route_bounds set encrypted_payload=private.encrypt_user_data(to_jsonb(route_bounds)-'route_id'-'encrypted_payload','route-bounds:'||route_id),min_lat=null,max_lat=null,min_lon=null,max_lon=null;
alter table private.route_bounds alter column encrypted_payload set not null;
alter table private.route_bounds add constraint route_bounds_encrypted check(encrypted_payload like 'enc:1:%' and min_lat is null and max_lat is null and min_lon is null and max_lon is null);
create function private.route_bounds_plain(p_bounds private.route_bounds) returns private.route_bounds
language sql stable set search_path='' as $$ select jsonb_populate_record(p_bounds,private.decrypt_user_data(p_bounds.encrypted_payload,'route-bounds:'||p_bounds.route_id)); $$;
revoke all on function private.route_bounds_plain(private.route_bounds) from public,anon,authenticated,service_role;
create or replace function private.update_route_bounds() returns trigger
language plpgsql security definer set search_path='' as $$
declare payload jsonb;
begin
 select jsonb_build_object('min_lat',min((p->>1)::double precision),'max_lat',max((p->>1)::double precision),
 'min_lon',min((p->>0)::double precision),'max_lon',max((p->>0)::double precision)) into payload
 from jsonb_array_elements((private.route_plain(new)).coordinates) p;
 insert into private.route_bounds(route_id,encrypted_payload) values(new.id,private.encrypt_user_data(payload,'route-bounds:'||new.id))
 on conflict(route_id) do update set encrypted_payload=excluded.encrypted_payload;
 return new;
end $$;
create trigger update_route_bounds after insert or update of coordinates on public.user_routes for each row execute function private.update_route_bounds();

create function private.read_saved_routes() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare account uuid:=private.connection_account();
begin return (select coalesce(jsonb_agg(to_jsonb(private.route_plain(r))-'encrypted_payload' order by r.created_at desc),'[]'::jsonb) from public.user_routes r where r.user_id=account); end $$;
create function private.save_saved_route(p_id uuid,p_route jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare account uuid:=private.connection_account(); item public.user_routes; result public.user_routes;
begin
 item:=jsonb_populate_record(null::public.user_routes,p_route);
 perform pg_advisory_xact_lock(hashtextextended('saved-routes:'||account::text,0));
 if p_id is null then
 insert into public.user_routes(user_id,name,waypoints,coordinates,distance_meters,duration_seconds,departure_time,weekdays,timezone,duration_minutes,lead_minutes,alerts_enabled)
 values(account,item.name,item.waypoints,item.coordinates,item.distance_meters,item.duration_seconds,item.departure_time,item.weekdays,item.timezone,item.duration_minutes,item.lead_minutes,item.alerts_enabled) returning * into result;
 else
 update public.user_routes set name=item.name,waypoints=item.waypoints,coordinates=item.coordinates,distance_meters=item.distance_meters,duration_seconds=item.duration_seconds,departure_time=item.departure_time,weekdays=item.weekdays,timezone=item.timezone,duration_minutes=item.duration_minutes,lead_minutes=item.lead_minutes,alerts_enabled=item.alerts_enabled
 where id=p_id and user_id=account returning * into result;
 if not found then raise exception 'route_unavailable' using errcode='42501'; end if;
 end if;
 return to_jsonb(private.route_plain(result))-'encrypted_payload';
end $$;
create function public.read_saved_routes() returns jsonb language sql security invoker set search_path='' as $$ select private.read_saved_routes(); $$;
create function public.save_saved_route(p_id uuid,p_route jsonb) returns jsonb language sql security invoker set search_path='' as $$ select private.save_saved_route(p_id,p_route); $$;
revoke all on function private.read_saved_routes(),private.save_saved_route(uuid,jsonb),public.read_saved_routes(),public.save_saved_route(uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private.read_saved_routes(),private.save_saved_route(uuid,jsonb),public.read_saved_routes(),public.save_saved_route(uuid,jsonb) to authenticated;


create or replace function private.route_departures(p_route public.user_routes,p_now timestamptz default now())
returns table(departure_at timestamptz) language plpgsql stable set search_path='' as $$ declare r public.user_routes:=private.route_plain(p_route); begin return query
 select departure from (
 select day,((day+r.departure_time) at time zone r.timezone) departure
 from (select (p_now at time zone r.timezone)::date+offset_day as day from generate_series(-1,1) offset_day) dates
 ) candidates where extract(isodow from day)::integer=any(r.weekdays)
 and p_now>=departure-make_interval(mins=>r.lead_minutes)
 and p_now<departure+make_interval(mins=>r.duration_minutes);
end $$;

create or replace function private.route_event_evidence(p_route public.user_routes,p_event uuid)
returns table(report_id uuid,report_kind text,location text,occurred_at timestamptz)
language sql stable security definer set search_path='' as $$
 select c.report_id,c.kind,c.summary->>'location_description',coalesce(c.occurred_at,c.created_at)
 from private.report_contributions c join private.route_bounds stored on stored.route_id=p_route.id
 cross join lateral private.route_bounds_plain(stored) b
 where c.published and c.status<>'closed' and private.publication_visible(c.kind,c.report_id)
 and private.report_event_root(c.event_id)=private.report_event_root(p_event)
 and c.latitude between b.min_lat-0.00055 and b.max_lat+0.00055
 and c.longitude between b.min_lon-60/(111195.08*cos(radians(c.latitude))) and b.max_lon+60/(111195.08*cos(radians(c.latitude)))
 and private.route_intersects((private.route_plain(p_route)).coordinates,c.latitude,c.longitude)
 order by c.created_at desc,c.report_id limit 1;
$$;

create or replace function private.refresh_route_alerts(p_owner uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare candidate record;
begin
 perform pg_advisory_xact_lock(hashtextextended('route-alert-matching',0));
 for candidate in
 select distinct r.id route_id,private.report_event_root(c.event_id) event_id,d.departure_at
 from public.user_routes r
 join auth.users u on u.id=r.user_id and u.is_anonymous is false
 join private.route_bounds stored on stored.route_id=r.id
 cross join lateral private.route_bounds_plain(stored) b
 cross join lateral private.route_departures(r) d
 join private.report_contributions c on c.published and c.status<>'closed'
  and c.latitude between b.min_lat-0.00055 and b.max_lat+0.00055
  and c.longitude between b.min_lon-60/(111195.08*cos(radians(c.latitude))) and b.max_lon+60/(111195.08*cos(radians(c.latitude)))
 where r.alerts_enabled and (p_owner is null or r.user_id=p_owner)
 and private.publication_visible(c.kind,c.report_id) and private.route_intersects((private.route_plain(r)).coordinates,c.latitude,c.longitude)
 loop
  if not exists(select 1 from private.route_alerts a where a.route_id=candidate.route_id
   and a.departure_at=candidate.departure_at and private.report_event_root(a.event_id)=candidate.event_id) then
   insert into private.route_alerts(route_id,event_id,departure_at) values(candidate.route_id,candidate.event_id,candidate.departure_at)
    on conflict(route_id,event_id,departure_at) do nothing;
  end if;
 end loop;
 insert into private.route_push_queue(alert_id,device_id)
 select a.id,d.id from private.route_alerts a join public.user_routes r on r.id=a.route_id
 join private.route_push_devices d on d.owner_id=r.user_id
 where r.alerts_enabled and (p_owner is null or r.user_id=p_owner)
 and a.departure_at in (select departure_at from private.route_departures(r))
 and not exists(select 1 from private.route_alerts earlier where earlier.route_id=a.route_id
  and earlier.departure_at=a.departure_at and (earlier.created_at,earlier.id)<(a.created_at,a.id)
  and private.report_event_root(earlier.event_id)=private.report_event_root(a.event_id))
 and exists(select 1 from private.route_event_evidence(r,a.event_id))
 on conflict(alert_id,device_id) do nothing;
end $$;

create or replace function private.read_route_alerts() returns jsonb
language plpgsql security definer set search_path='' as $$
declare account uuid:=private.connection_account(); result jsonb;
begin
 perform private.refresh_route_alerts(account);
 select coalesce(jsonb_agg(item order by created_at desc),'[]'::jsonb) into result from (
 select a.created_at,jsonb_build_object('id',a.id,'route_id',r.id,'route_name',(private.route_plain(r)).name,
 'event_id',private.report_event_root(a.event_id),'report_id',e.report_id,'report_kind',e.report_kind,
 'location',e.location,'occurred_at',e.occurred_at,'departure_at',a.departure_at,'created_at',a.created_at,'read_at',a.read_at) item
 from private.route_alerts a join public.user_routes r on r.id=a.route_id and r.user_id=account
 cross join lateral private.route_event_evidence(r,a.event_id) e
 where a.created_at>now()-interval '7 days'
 and not exists(select 1 from private.route_alerts earlier where earlier.route_id=a.route_id
  and earlier.departure_at=a.departure_at and (earlier.created_at,earlier.id)<(a.created_at,a.id)
  and private.report_event_root(earlier.event_id)=private.report_event_root(a.event_id))
 order by a.created_at desc limit 100
 ) items;
 return result;
end $$;

-- Preserve exact-value uniqueness without an unkeyed, guessable digest.
create function private.identifier_fingerprint(p_value text) returns text
language plpgsql stable set search_path='' as $$
declare secret text;
begin
 select s.decrypted_secret into strict secret from private.data_lookup_key k join vault.decrypted_secrets s on s.id=k.secret_id where k.id;
 return encode(extensions.hmac(convert_to('report-exact:'||p_value,'UTF8'),decode(secret,'hex'),'sha256'),'hex');
end $$;
revoke all on function private.identifier_fingerprint(text) from public,anon,authenticated,service_role;
alter table public.accident_report_identifiers add column value_fingerprint text;
alter table public.accident_report_identifiers disable trigger safety_identifiers_changed;
update public.accident_report_identifiers set value_fingerprint=private.identifier_fingerprint(private.decrypt_user_data(value,'accident-identifier:'||report_id||':'||id)#>>'{}');
alter table public.accident_report_identifiers enable trigger safety_identifiers_changed;
alter table public.accident_report_identifiers alter column value_fingerprint set not null;
create unique index accident_identifier_unique on public.accident_report_identifiers(report_id,kind,value_fingerprint);
create or replace function private.encrypt_accident_identifier() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.value is null or char_length(trim(new.value)) not between 1 and 80 then raise exception 'Invalid identifier' using errcode='23514'; end if;
 new.value_lookup:=private.safety_lookup(new.kind,new.value);
 new.value_fingerprint:=private.identifier_fingerprint(new.value);
 new.value:=private.encrypt_user_data(to_jsonb(new.value),'accident-identifier:'||new.report_id||':'||new.id);
 return new;
end $$;

-- Administrative rotation creates a fresh data key; old versions remain readable.
-- The independent matching key is intentionally stable across data-key rotations.
create function private.rotate_user_data_key() returns integer
language plpgsql set search_path='' as $$
declare next_version integer; secret uuid;
begin
 lock table private.data_encryption_keys in exclusive mode;
 select coalesce(max(version),0)+1 into next_version from private.data_encryption_keys;
 secret:=vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'user-data-encryption-v'||next_version,'Rotated server-side user data encryption key');
 update private.data_encryption_keys set active=false where active;
 insert into private.data_encryption_keys(version,secret_id,active) values(next_version,secret,true);
 return next_version;
end $$;
create function private.reencrypt_user_data_batch(p_limit integer default 100) returns integer
language plpgsql set search_path='' as $$
declare v integer; affected integer; total integer:=0;
begin
 if p_limit is null or p_limit not between 1 and 1000 then raise exception 'Invalid batch size'; end if;
 -- Prevent a key rotation racing with this batch; no keys are ever deleted here.
 lock table private.data_encryption_keys in share mode;
 select version into strict v from private.data_encryption_keys where active;
 with batch as (select id from private.safety_records where encrypted_payload not like 'enc:1:'||v||':%' limit p_limit for update skip locked)
 update private.safety_records s set encrypted_payload=private.encrypt_user_data(private.decrypt_user_data(s.encrypted_payload,'safety:'||s.owner_id||':'||s.id),'safety:'||s.owner_id||':'||s.id) from batch where s.id=batch.id;
 get diagnostics affected=row_count; total:=total+affected;
 with batch as (select id from public.accident_report_identifiers where value not like 'enc:1:'||v||':%' limit p_limit for update skip locked)
 update public.accident_report_identifiers s set value=private.encrypt_user_data(private.decrypt_user_data(s.value,'accident-identifier:'||s.report_id||':'||s.id),'accident-identifier:'||s.report_id||':'||s.id) from batch where s.id=batch.id;
 get diagnostics affected=row_count; total:=total+affected;
 with batch as (select report_kind,report_id,kind,value from private.safety_report_identifiers where encrypted_payload not like 'enc:1:'||v||':%' limit p_limit for update skip locked)
 update private.safety_report_identifiers s set encrypted_payload=private.encrypt_user_data(private.decrypt_user_data(s.encrypted_payload,'report-identifier:'||s.report_kind||':'||s.report_id||':'||s.kind),'report-identifier:'||s.report_kind||':'||s.report_id||':'||s.kind)
 from batch b where (s.report_kind,s.report_id,s.kind,s.value)=(b.report_kind,b.report_id,b.kind,b.value);
 get diagnostics affected=row_count; total:=total+affected;
 with batch as (select path from private.identity_photo_data where encrypted_payload not like 'enc:1:'||v||':%' limit least(p_limit,5) for update skip locked)
 update private.identity_photo_data s set encrypted_payload=private.encrypt_user_data(private.decrypt_user_data(s.encrypted_payload,'identity-photo:'||s.path),'identity-photo:'||s.path) from batch where s.path=batch.path;
 get diagnostics affected=row_count; total:=total+affected;
 with batch as (select user_id from public.user_saved_places where encrypted_payload not like 'enc:1:'||v||':%' limit p_limit for update skip locked)
 update public.user_saved_places s set encrypted_payload=private.encrypt_user_data(private.decrypt_user_data(s.encrypted_payload,'saved-places:'||s.user_id),'saved-places:'||s.user_id) from batch where s.user_id=batch.user_id;
 get diagnostics affected=row_count; total:=total+affected;
 with batch as (select owner_id from private.location_shares where encrypted_position not like 'enc:1:'||v||':%' limit p_limit for update skip locked)
 update private.location_shares s set encrypted_position=private.encrypt_user_data(private.decrypt_user_data(s.encrypted_position,'live-location:'||s.owner_id),'live-location:'||s.owner_id) from batch where s.owner_id=batch.owner_id;
 get diagnostics affected=row_count; total:=total+affected;
 with batch as (select id from public.user_routes where encrypted_payload not like 'enc:1:'||v||':%' limit p_limit for update skip locked)
 update public.user_routes s set encrypted_payload=private.encrypt_user_data(private.decrypt_user_data(s.encrypted_payload,'route:'||s.user_id||':'||s.id),'route:'||s.user_id||':'||s.id) from batch where s.id=batch.id;
 get diagnostics affected=row_count; total:=total+affected;
 with batch as (select route_id from private.route_bounds where encrypted_payload not like 'enc:1:'||v||':%' limit p_limit for update skip locked)
 update private.route_bounds s set encrypted_payload=private.encrypt_user_data(private.decrypt_user_data(s.encrypted_payload,'route-bounds:'||s.route_id),'route-bounds:'||s.route_id) from batch where s.route_id=batch.route_id;
 get diagnostics affected=row_count; total:=total+affected;
 return total;
end $$;
revoke all on function private.rotate_user_data_key(),private.reencrypt_user_data_batch(integer) from public,anon,authenticated,service_role;

