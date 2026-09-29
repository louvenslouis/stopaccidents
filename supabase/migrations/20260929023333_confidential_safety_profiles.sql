-- Identifiers never enter user_metadata, public feeds, push payloads or logs.
create function private.normalize_safety_identifier(p_value text) returns text
language sql immutable set search_path='' as $$
 select case when p_value ~ '^[A-Za-z0-9[:space:]-]+$'
 then nullif(upper(regexp_replace(p_value,'[[:space:]-]','','g')),'') end;
$$;
create table private.safety_records (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('registration','identity')),
 value text not null check(value ~ '^[A-Z0-9]{3,80}$'),
 vehicle_type text, color text, photo_path text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(owner_id,kind,value),
 check((kind='identity' and vehicle_type is null and color is null and char_length(value)>=4)
 or (kind='registration' and vehicle_type in ('car','motorcycle','suv','pickup','van','truck','bus','other')
 and color is not null and char_length(trim(color)) between 2 and 40 and photo_path is null and char_length(value)<=32))
);
create unique index safety_one_identity on private.safety_records(owner_id) where kind='identity';
create index safety_records_match on private.safety_records(kind,value);
create table private.safety_preferences (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 alerts_enabled boolean not null default false,
 enabled_at timestamptz not null default now()
);
create table private.safety_alerts (
 id uuid primary key default gen_random_uuid(),
 event_id uuid not null references private.report_events(id),
 subject_id uuid not null references auth.users(id) on delete cascade,
 recipient_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(), read_at timestamptz,
 unique(event_id,subject_id,recipient_id)
);
create index safety_alerts_inbox on private.safety_alerts(recipient_id,created_at desc);
create index safety_alerts_subject on private.safety_alerts(subject_id);
create table private.safety_push_devices (
 id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 token text not null unique, session_id uuid not null, updated_at timestamptz not null default now()
);
create index safety_push_devices_owner on private.safety_push_devices(owner_id);
create table private.safety_push_queue (
 id uuid primary key default gen_random_uuid(),
 alert_id uuid not null references private.safety_alerts(id) on delete cascade,
 device_id uuid not null references private.safety_push_devices(id) on delete cascade,
 state text not null default 'pending' check(state in ('pending','sending','receipt','delivered','failed','cancelled')),
 attempts integer not null default 0, available_at timestamptz not null default now(),
 lease uuid, ticket_id text, last_error text,
 unique(alert_id,device_id)
);
create index safety_push_due on private.safety_push_queue(available_at) where state in ('pending','sending','receipt');
create index safety_push_queue_device on private.safety_push_queue(device_id);

do $$ declare t text; begin
 foreach t in array array['safety_records','safety_preferences','safety_alerts','safety_push_devices','safety_push_queue'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated',t);
 end loop;
end $$;

create function private.read_safety_profile() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare account uuid:=private.connection_account();
begin
 return jsonb_build_object('alerts_enabled',coalesce((select alerts_enabled from private.safety_preferences where owner_id=account),false),
 'records',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'value',value,
 'vehicle_type',vehicle_type,'color',color,'photo_path',photo_path) order by created_at,id),'[]'::jsonb)
 from private.safety_records where owner_id=account));
end $$;
create function private.save_safety_record(p_id uuid,p_kind text,p_value text,p_vehicle_type text,p_color text,p_photo_path text) returns uuid
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
 or not exists(select 1 from storage.objects where bucket_id='identity-cards' and name=p_photo_path))
 then raise exception 'safety_photo_unavailable' using errcode='42501'; end if;
 insert into private.safety_records(id,owner_id,kind,value,vehicle_type,color,photo_path)
 values(p_id,account,p_kind,normalized,case when p_kind='registration' then p_vehicle_type end,
 case when p_kind='registration' then trim(p_color) end,p_photo_path)
 on conflict(id) do update set value=excluded.value,vehicle_type=excluded.vehicle_type,color=excluded.color,
 photo_path=excluded.photo_path,updated_at=now(),
 -- A changed identifier cannot subscribe to older events.
 created_at=case when safety_records.value=excluded.value then safety_records.created_at else now() end
 returning id into result;
 return result;
exception when unique_violation then raise exception 'safety_duplicate_record' using errcode='23505';
end $$;
create function private.delete_safety_record(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare account uuid:=private.connection_account();
begin
 delete from private.safety_records where id=p_id and owner_id=account;
 if not found then raise exception 'safety_record_unavailable' using errcode='42501'; end if;
end $$;
create function private.set_safety_alerts_enabled(p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
declare account uuid:=private.connection_account();
begin
 if p_enabled is null then raise exception 'safety_invalid_record' using errcode='22023'; end if;
 insert into private.safety_preferences(owner_id,alerts_enabled) values(account,p_enabled)
 on conflict(owner_id) do update set alerts_enabled=excluded.alerts_enabled,
 enabled_at=case when excluded.alerts_enabled and not safety_preferences.alerts_enabled then now() else safety_preferences.enabled_at end;
end $$;

-- Explicit identifiers from additional report types, inaccessible to public feeds.
create table private.safety_report_identifiers (
 report_kind text not null, report_id uuid not null,
 kind text not null check(kind in ('registration','identity')),
 value text not null check(char_length(value) between 3 and 80),
 primary key(report_kind,report_id,kind,value),
 foreign key(report_kind,report_id) references private.report_contributions(kind,report_id) on delete cascade
);
alter table private.safety_report_identifiers enable row level security;
revoke all on private.safety_report_identifiers from public,anon,authenticated;
create function private.report_safety_identifiers(p_kind text,p_report uuid) returns table(kind text,value text)
language sql stable security definer set search_path='' as $$
 select i.kind,i.value from public.accident_report_identifiers i where p_kind='accident' and i.report_id=p_report
 union all select i.kind,i.value from private.safety_report_identifiers i where i.report_kind=p_kind and i.report_id=p_report;
$$;
create function private.save_vehicle_report_identifier(p_report uuid,p_registration text) returns void
language plpgsql security definer set search_path='' as $$
declare normalized text:=private.normalize_safety_identifier(p_registration);
begin
 if auth.uid() is null or not exists(select 1 from private.report_contributions where kind='suspicious_vehicle' and report_id=p_report and reporter_id=auth.uid())
 then raise exception 'Report unavailable' using errcode='42501'; end if;
 if p_registration is null or char_length(p_registration)>80 or (trim(p_registration)<>'' and (normalized is null or char_length(normalized) not between 3 and 32))
 then raise exception 'safety_invalid_record' using errcode='22023'; end if;
 delete from private.safety_report_identifiers where report_kind='suspicious_vehicle' and report_id=p_report;
 if normalized is not null then insert into private.safety_report_identifiers values('suspicious_vehicle',p_report,'registration',normalized); end if;
end $$;
create function public.save_suspicious_vehicle_identity(p_id uuid,p_vehicle_description text,p_observed_behavior text,p_registration text) returns uuid
language plpgsql security invoker set search_path='' as $$
begin
 perform public.save_suspicious_vehicle_report_step(p_id,2,p_vehicle_description=>p_vehicle_description,p_observed_behavior=>p_observed_behavior);
 perform private.save_vehicle_report_identifier(p_id,p_registration);
 return p_id;
end $$;
revoke all on function private.report_safety_identifiers(text,uuid),private.save_vehicle_report_identifier(uuid,text),public.save_suspicious_vehicle_identity(uuid,text,text,text) from public,anon,authenticated;
grant execute on function private.save_vehicle_report_identifier(uuid,text),public.save_suspicious_vehicle_identity(uuid,text,text,text) to authenticated;

-- The same eligibility predicate is evaluated at creation, reading and delivery.
-- Only exact normalized matches in explicit accident identifier fields qualify.
create function private.safety_event_evidence(p_event uuid,p_subject uuid,p_recipient uuid)
returns table(report_id uuid,report_kind text,location text,occurred_at timestamptz,match_kind text)
language sql stable security definer set search_path='' as $$
 select c.report_id,c.kind,c.summary->>'location_description',c.created_at,i.kind
 from private.report_contributions c
 cross join lateral private.report_safety_identifiers(c.kind,c.report_id) i
 join private.safety_records s on s.owner_id=p_subject and s.kind=i.kind
 and s.value=private.normalize_safety_identifier(i.value) and s.created_at<=c.created_at
 join private.safety_preferences pref on pref.owner_id=p_subject and pref.alerts_enabled and pref.enabled_at<=c.created_at
 where c.published and c.status<>'closed' and private.report_event_root(c.event_id)=private.report_event_root(p_event)
 and exists(select 1 from private.user_connections x where x.status='accepted' and x.accepted_at<=c.created_at
 and ((x.sender_id=p_subject and x.recipient_id=p_recipient) or (x.recipient_id=p_subject and x.sender_id=p_recipient)))
 order by c.created_at desc,c.report_id,i.kind limit 1;
$$;

create function private.match_safety_report(p_kind text,p_report uuid) returns void
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
 join private.safety_records s on s.kind=i.kind and s.value=private.normalize_safety_identifier(i.value) and s.created_at<=c.created_at
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
create function private.on_safety_identifiers_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform private.match_safety_report('accident',coalesce(new.report_id,old.report_id));
 return null;
end $$;
-- Deferred triggers see the final identifier set after step-four delete/reinsert.
create constraint trigger safety_identifiers_changed after insert or update or delete on public.accident_report_identifiers
 deferrable initially deferred for each row execute function private.on_safety_identifiers_changed();
create function private.on_safety_report_changed() returns trigger
language plpgsql security definer set search_path='' as $$ begin perform private.match_safety_report(tg_argv[0],new.id); return null; end $$;
create constraint trigger safety_report_changed after insert or update on public.accident_reports
 deferrable initially deferred for each row execute function private.on_safety_report_changed('accident');
create constraint trigger safety_report_changed after insert or update on public.suspicious_vehicle_reports
 deferrable initially deferred for each row execute function private.on_safety_report_changed('suspicious_vehicle');

create function private.read_safety_alerts() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare account uuid:=private.connection_account();
begin
 return (select coalesce(jsonb_agg(value order by created_at desc),'[]'::jsonb) from (select * from (
 select distinct on(private.report_event_root(a.event_id),a.subject_id)
 a.created_at,jsonb_build_object('id',a.id,'alias',u.alias,'report_id',e.report_id,'report_kind',e.report_kind,
 'location',e.location,'occurred_at',e.occurred_at,'match_kind',e.match_kind,'created_at',a.created_at,'read_at',a.read_at) value
 from private.safety_alerts a join public.user_aliases u on u.user_id=a.subject_id
 cross join lateral private.safety_event_evidence(a.event_id,a.subject_id,a.recipient_id) e
 where a.recipient_id=account
 order by private.report_event_root(a.event_id),a.subject_id,a.created_at desc) distinct_alerts
 order by created_at desc limit 100) visible);
end $$;
create function private.mark_safety_alert_read(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare account uuid:=private.connection_account();
begin
 update private.safety_alerts set read_at=coalesce(read_at,now()) where id=p_id and recipient_id=account;
 if not found then raise exception 'safety_alert_unavailable' using errcode='42501'; end if;
end $$;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('identity-cards','identity-cards',false,6291456,array['image/jpeg']);
create function private.safety_photo_owned(p_path text) returns boolean
language plpgsql stable security definer set search_path='' as $$
begin return split_part(p_path,'/',1)=auth.uid()::text and exists(select 1 from auth.users where id=auth.uid() and is_anonymous is false); end $$;
create function private.safety_photo_unattached(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select not exists(select 1 from private.safety_records where photo_path=p_path);
$$;
create policy identity_cards_read on storage.objects for select to authenticated
 using(bucket_id='identity-cards' and private.safety_photo_owned(name));
create policy identity_cards_upload on storage.objects for insert to authenticated
 with check(bucket_id='identity-cards' and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$' and private.safety_photo_owned(name));
-- Immutable objects; failed/replaced uploads can be removed only when unreferenced.
create policy identity_cards_cleanup on storage.objects for delete to authenticated
 using(bucket_id='identity-cards' and private.safety_photo_owned(name) and private.safety_photo_unattached(name));

create function private.register_safety_push_device(p_id uuid,p_token text) returns void
language plpgsql security definer set search_path='' as $$
declare account uuid:=private.connection_account(); session uuid:=
 (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')::uuid;
begin
 if p_id is null or p_token is null or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$'
 or session is null or not exists(select 1 from auth.sessions s where id=session and user_id=account and ((to_jsonb(s)->>'not_after') is null or (to_jsonb(s)->>'not_after')::timestamptz>now()))
 then raise exception 'safety_push_invalid' using errcode='22023'; end if;
 -- A random installation ID is kept in secure storage; reassignment cancels old delivery jobs.
 if exists(select 1 from private.safety_push_devices where id=p_id and (owner_id<>account or token<>p_token or session_id<>session)) then
 delete from private.safety_push_devices where id=p_id;
 end if;
 delete from private.safety_push_devices where token=p_token and owner_id=account and id<>p_id;
 insert into private.safety_push_devices(id,owner_id,token,session_id) values(p_id,account,p_token,session)
 on conflict(id) do update set updated_at=now();
end $$;
create function private.unregister_safety_push_device(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare account uuid:=private.connection_account();
begin delete from private.safety_push_devices where id=p_id and owner_id=account; end $$;

-- Worker-only RPCs. The client cannot claim, send or acknowledge deliveries.
create function private.claim_safety_push_jobs() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 delete from private.safety_push_devices d where not exists(select 1 from auth.sessions s where s.id=d.session_id and s.user_id=d.owner_id and ((to_jsonb(s)->>'not_after') is null or (to_jsonb(s)->>'not_after')::timestamptz>now()))
 or d.updated_at<now()-interval '30 days';
 update private.safety_push_queue q set state='cancelled',lease=null from private.safety_alerts a
 where a.id=q.alert_id and q.state in ('pending','sending','receipt')
 and (a.created_at<now()-interval '24 hours' or not exists(select 1 from private.safety_event_evidence(a.event_id,a.subject_id,a.recipient_id)));
 with due as (
 select q.id from private.safety_push_queue q where q.state in ('pending','sending','receipt') and q.available_at<=now()
 and q.attempts<12 order by q.available_at limit 25 for update skip locked
 ), claimed as (
 update private.safety_push_queue q set lease=gen_random_uuid(),available_at=now()+interval '5 minutes',
 attempts=q.attempts+1,state=case when ticket_id is null then 'sending' else 'receipt' end
 from due where q.id=due.id returning q.*
 ) select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'lease',q.lease,'token',d.token,'ticket_id',q.ticket_id)),'[]'::jsonb)
 into result from claimed q join private.safety_push_devices d on d.id=q.device_id;
 update private.safety_push_queue set state='failed',last_error='retry_limit' where attempts>=12 and available_at<=now() and state in ('pending','sending','receipt');
 return result;
end $$;
create function private.finish_safety_push_job(p_id uuid,p_lease uuid,p_status text,p_ticket text default null,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
declare job private.safety_push_queue%rowtype;
begin
 select * into job from private.safety_push_queue where id=p_id and lease=p_lease for update;
 if not found then return; end if;
 if p_status='unregistered' then delete from private.safety_push_devices where id=job.device_id; return; end if;
 if p_status not in ('receipt','delivered','retry','failed') or p_status is null then raise exception 'Invalid delivery status'; end if;
 if p_status='receipt' and (p_ticket is null or char_length(p_ticket)>200) then raise exception 'Invalid receipt'; end if;
 update private.safety_push_queue set state=case when p_status='retry' then case when ticket_id is null then 'pending' else 'receipt' end else p_status end,
 ticket_id=coalesce(p_ticket,ticket_id),lease=null,last_error=left(p_error,80),
 available_at=now()+case when p_status='receipt' then interval '15 minutes' else least(3600,power(2,least(attempts,10))::integer*15)*interval '1 second' end
 where id=p_id;
end $$;
revoke all on function private.claim_safety_push_jobs(), private.finish_safety_push_job(uuid,uuid,text,text,text) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function private.claim_safety_push_jobs(),private.finish_safety_push_job(uuid,uuid,text,text,text) to service_role;
end if; end $$;

create function public.read_safety_profile() returns jsonb
language sql security invoker set search_path='' as $$ select private.read_safety_profile(); $$;
revoke all on function public.read_safety_profile(),private.read_safety_profile() from public,anon,authenticated;
grant execute on function public.read_safety_profile(),private.read_safety_profile() to authenticated;

create function public.save_safety_record(p_id uuid,p_kind text,p_value text,p_vehicle_type text,p_color text,p_photo_path text) returns uuid
language sql security invoker set search_path='' as $$ select private.save_safety_record(p_id,p_kind,p_value,p_vehicle_type,p_color,p_photo_path); $$;
revoke all on function public.save_safety_record(uuid,text,text,text,text,text),private.save_safety_record(uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.save_safety_record(uuid,text,text,text,text,text),private.save_safety_record(uuid,text,text,text,text,text) to authenticated;

create function public.delete_safety_record(p_id uuid) returns void
language sql security invoker set search_path='' as $$ select private.delete_safety_record(p_id); $$;
revoke all on function public.delete_safety_record(uuid),private.delete_safety_record(uuid) from public,anon,authenticated;
grant execute on function public.delete_safety_record(uuid),private.delete_safety_record(uuid) to authenticated;

create function public.set_safety_alerts_enabled(p_enabled boolean) returns void
language sql security invoker set search_path='' as $$ select private.set_safety_alerts_enabled(p_enabled); $$;
revoke all on function public.set_safety_alerts_enabled(boolean),private.set_safety_alerts_enabled(boolean) from public,anon,authenticated;
grant execute on function public.set_safety_alerts_enabled(boolean),private.set_safety_alerts_enabled(boolean) to authenticated;

create function public.read_safety_alerts() returns jsonb
language sql security invoker set search_path='' as $$ select private.read_safety_alerts(); $$;
revoke all on function public.read_safety_alerts(),private.read_safety_alerts() from public,anon,authenticated;
grant execute on function public.read_safety_alerts(),private.read_safety_alerts() to authenticated;

create function public.mark_safety_alert_read(p_id uuid) returns void
language sql security invoker set search_path='' as $$ select private.mark_safety_alert_read(p_id); $$;
revoke all on function public.mark_safety_alert_read(uuid),private.mark_safety_alert_read(uuid) from public,anon,authenticated;
grant execute on function public.mark_safety_alert_read(uuid),private.mark_safety_alert_read(uuid) to authenticated;

create function public.register_safety_push_device(p_id uuid,p_token text) returns void
language sql security invoker set search_path='' as $$ select private.register_safety_push_device(p_id,p_token); $$;
revoke all on function public.register_safety_push_device(uuid,text),private.register_safety_push_device(uuid,text) from public,anon,authenticated;
grant execute on function public.register_safety_push_device(uuid,text),private.register_safety_push_device(uuid,text) to authenticated;

create function public.unregister_safety_push_device(p_id uuid) returns void
language sql security invoker set search_path='' as $$ select private.unregister_safety_push_device(p_id); $$;
revoke all on function public.unregister_safety_push_device(uuid),private.unregister_safety_push_device(uuid) from public,anon,authenticated;
grant execute on function public.unregister_safety_push_device(uuid),private.unregister_safety_push_device(uuid) to authenticated;

revoke all on function private.normalize_safety_identifier(text),private.safety_event_evidence(uuid,uuid,uuid),
 private.match_safety_report(text,uuid),private.on_safety_identifiers_changed(),private.on_safety_report_changed(),
 private.safety_photo_owned(text),private.safety_photo_unattached(text) from public,anon,authenticated;
grant execute on function private.safety_photo_owned(text),private.safety_photo_unattached(text) to authenticated;

create table private.safety_push_worker_config (
 id boolean primary key default true check(id), secret uuid not null default gen_random_uuid()
);
alter table private.safety_push_worker_config enable row level security;
revoke all on private.safety_push_worker_config from public,anon,authenticated;
insert into private.safety_push_worker_config default values;
create function private.authorize_safety_push_worker(p_secret uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from private.safety_push_worker_config where secret=p_secret);
$$;
revoke all on function private.authorize_safety_push_worker(uuid) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function private.authorize_safety_push_worker(uuid) to service_role;
end if; end $$;

create function public.claim_safety_push_jobs() returns jsonb
language sql security invoker set search_path='' as $$ select private.claim_safety_push_jobs(); $$;
revoke all on function public.claim_safety_push_jobs() from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant usage on schema private to service_role;
 grant execute on function public.claim_safety_push_jobs(),private.claim_safety_push_jobs() to service_role;
end if; end $$;

create function public.finish_safety_push_job(p_id uuid,p_lease uuid,p_status text,p_ticket text default null,p_error text default null) returns void
language sql security invoker set search_path='' as $$ select private.finish_safety_push_job(p_id,p_lease,p_status,p_ticket,p_error); $$;
revoke all on function public.finish_safety_push_job(uuid,uuid,text,text,text) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant usage on schema private to service_role;
 grant execute on function public.finish_safety_push_job(uuid,uuid,text,text,text),private.finish_safety_push_job(uuid,uuid,text,text,text) to service_role;
end if; end $$;

create function public.authorize_safety_push_worker(p_secret uuid) returns boolean
language sql security invoker set search_path='' as $$ select private.authorize_safety_push_worker(p_secret); $$;
revoke all on function public.authorize_safety_push_worker(uuid) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant usage on schema private to service_role;
 grant execute on function public.authorize_safety_push_worker(uuid),private.authorize_safety_push_worker(uuid) to service_role;
end if; end $$;

create function private.safety_push_job_eligible(p_id uuid,p_lease uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare eligible boolean;
begin
 select exists(
 select 1 from private.safety_push_queue q join private.safety_alerts a on a.id=q.alert_id
 join private.safety_push_devices d on d.id=q.device_id and d.owner_id=a.recipient_id
 join auth.sessions s on s.id=d.session_id and s.user_id=d.owner_id
 and ((to_jsonb(s)->>'not_after') is null or (to_jsonb(s)->>'not_after')::timestamptz>now())
 where q.id=p_id and q.lease=p_lease and q.state in ('sending','receipt')
 and a.created_at>now()-interval '24 hours' and d.updated_at>now()-interval '30 days'
 and exists(select 1 from private.safety_event_evidence(a.event_id,a.subject_id,a.recipient_id))) into eligible;
 if not eligible then update private.safety_push_queue set state='cancelled',lease=null where id=p_id and lease=p_lease; end if;
 return eligible;
end $$;
create function public.safety_push_job_eligible(p_id uuid,p_lease uuid) returns boolean
language sql security invoker set search_path='' as $$ select private.safety_push_job_eligible(p_id,p_lease); $$;
revoke all on function public.safety_push_job_eligible(uuid,uuid),private.safety_push_job_eligible(uuid,uuid) from public,anon,authenticated;
do $$ begin if exists(select 1 from pg_roles where rolname='service_role') then
 grant execute on function public.safety_push_job_eligible(uuid,uuid),private.safety_push_job_eligible(uuid,uuid) to service_role;
end if; end $$;

create function private.on_extra_safety_identifiers_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin perform private.match_safety_report(coalesce(new.report_kind,old.report_kind),coalesce(new.report_id,old.report_id)); return null; end $$;
revoke all on function private.on_extra_safety_identifiers_changed() from public,anon,authenticated;
create constraint trigger safety_extra_identifiers_changed after insert or update or delete on private.safety_report_identifiers
 deferrable initially deferred for each row execute function private.on_extra_safety_identifiers_changed();

-- Legacy clients may update the public description without the new explicit plate.
-- Invalidate the previous private match; the new atomic wrapper replaces it next.
create function private.clear_vehicle_report_identifier() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 delete from private.safety_report_identifiers where report_kind='suspicious_vehicle' and report_id=new.id;
 return new;
end $$;
revoke all on function private.clear_vehicle_report_identifier() from public,anon,authenticated;
create trigger b_clear_vehicle_identifier after update of vehicle_description on public.suspicious_vehicle_reports
 for each row when (old.vehicle_description is distinct from new.vehicle_description)
 execute function private.clear_vehicle_report_identifier();
