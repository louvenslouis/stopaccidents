-- Saved geometry and schedules are private to their registered owner. No live GPS is used.
create function private.route_account_allowed() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=auth.uid() and is_anonymous is false);
$$;
revoke all on function private.route_account_allowed() from public,anon,authenticated;
grant execute on function private.route_account_allowed() to authenticated;

create table public.user_routes (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check(char_length(trim(name)) between 1 and 80),
 waypoints jsonb not null,
 coordinates jsonb not null,
 distance_meters double precision not null check(distance_meters > 0 and distance_meters <= 1000000),
 duration_seconds double precision not null check(duration_seconds > 0 and duration_seconds <= 86400),
 departure_time time not null check(departure_time < time '24:00'),
 weekdays integer[] not null,
 timezone text not null default 'America/Port-au-Prince',
 duration_minutes integer not null default 60 check(duration_minutes between 5 and 240),
 lead_minutes integer not null default 30 check(lead_minutes in (0,15,30,60)),
 alerts_enabled boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index user_routes_owner on public.user_routes(user_id,created_at desc);
create index user_routes_enabled on public.user_routes(id) where alerts_enabled;
alter table public.user_routes enable row level security;
revoke all on public.user_routes from public,anon,authenticated;
grant select,insert,update,delete on public.user_routes to authenticated;
create policy user_routes_read on public.user_routes for select to authenticated
 using(user_id=(select auth.uid()) and (select private.route_account_allowed()));
create policy user_routes_insert on public.user_routes for insert to authenticated
 with check(user_id=(select auth.uid()) and (select private.route_account_allowed()));
create policy user_routes_update on public.user_routes for update to authenticated
 using(user_id=(select auth.uid()) and (select private.route_account_allowed()))
 with check(user_id=(select auth.uid()) and (select private.route_account_allowed()));
create policy user_routes_delete on public.user_routes for delete to authenticated
 using(user_id=(select auth.uid()) and (select private.route_account_allowed()));

create function private.validate_user_route() returns trigger
language plpgsql security definer set search_path='' as $$
declare point jsonb;
begin
 if auth.uid() is not null and new.user_id<>auth.uid() then raise exception 'route_owner_immutable' using errcode='42501'; end if;
 if jsonb_typeof(new.waypoints) is distinct from 'array' or jsonb_typeof(new.coordinates) is distinct from 'array'
 then raise exception 'route_invalid_geometry' using errcode='22023'; end if;
 if jsonb_array_length(new.waypoints) not between 2 and 25 or jsonb_array_length(new.coordinates) not between 2 and 10000
 then raise exception 'route_invalid_geometry' using errcode='22023'; end if;
 for point in select value from jsonb_array_elements(new.coordinates) loop
  if jsonb_typeof(point) is distinct from 'array' then raise exception 'route_invalid_geometry' using errcode='22023'; end if;
  if jsonb_array_length(point)<>2 or jsonb_typeof(point->0) is distinct from 'number' or jsonb_typeof(point->1) is distinct from 'number'
  then raise exception 'route_invalid_geometry' using errcode='22023'; end if;
  if (point->>0)::double precision not between -180 and 180 or (point->>1)::double precision not between -85 and 85
  then raise exception 'route_invalid_geometry' using errcode='22023'; end if;
 end loop;
 for point in select value from jsonb_array_elements(new.waypoints) loop
  if jsonb_typeof(point) is distinct from 'object' or jsonb_typeof(point->'label') is distinct from 'string'
  or char_length(trim(point->>'label')) not between 1 and 200
  or jsonb_typeof(point->'latitude') is distinct from 'number' or jsonb_typeof(point->'longitude') is distinct from 'number'
  then raise exception 'route_invalid_waypoints' using errcode='22023'; end if;
  if (point->>'longitude')::double precision not between -180 and 180 or (point->>'latitude')::double precision not between -85 and 85
  then raise exception 'route_invalid_waypoints' using errcode='22023'; end if;
 end loop;
 if cardinality(new.weekdays) not between 1 and 7 or array_position(new.weekdays,null) is not null
 or not new.weekdays <@ array[1,2,3,4,5,6,7]
 or cardinality(new.weekdays) <> (select count(distinct day) from unnest(new.weekdays) day)
 or not exists(select 1 from pg_timezone_names where name=new.timezone)
 then raise exception 'route_invalid_schedule' using errcode='22023'; end if;
 if tg_op='INSERT' then
  perform pg_advisory_xact_lock(hashtextextended('saved-routes:'||new.user_id::text,0));
  if (select count(*) from public.user_routes where user_id=new.user_id)>=20
  then raise exception 'route_limit_reached' using errcode='22023'; end if;
  new.created_at:=now();
 else
  if new.user_id<>old.user_id or new.id<>old.id then raise exception 'route_owner_immutable' using errcode='42501'; end if;
  new.created_at:=old.created_at;
 end if;
 new.name:=trim(new.name); new.updated_at:=now();
 return new;
end $$;
revoke all on function private.validate_user_route() from public,anon,authenticated;
create trigger validate_user_route before insert or update on public.user_routes for each row execute function private.validate_user_route();

-- A coarse bounds filter avoids scanning every geometry for each incident.
create table private.route_bounds (
 route_id uuid primary key references public.user_routes(id) on delete cascade,
 min_lat double precision not null,max_lat double precision not null,
 min_lon double precision not null,max_lon double precision not null
);
alter table private.route_bounds enable row level security;
revoke all on private.route_bounds from public,anon,authenticated;
create function private.update_route_bounds() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into private.route_bounds(route_id,min_lat,max_lat,min_lon,max_lon)
 select new.id,min((p->>1)::double precision),max((p->>1)::double precision),
 min((p->>0)::double precision),max((p->>0)::double precision) from jsonb_array_elements(new.coordinates) p
 on conflict(route_id) do update set min_lat=excluded.min_lat,max_lat=excluded.max_lat,min_lon=excluded.min_lon,max_lon=excluded.max_lon;
 return new;
end $$;
revoke all on function private.update_route_bounds() from public,anon,authenticated;
create trigger update_route_bounds after insert or update of coordinates on public.user_routes for each row execute function private.update_route_bounds();

-- Point-to-segment projection (metres), including segment interiors and zero-length segments.
-- The corridor is deliberately narrow: no endpoint-radius or city-wide matching.
create function private.route_intersects(p_coordinates jsonb,p_lat double precision,p_lon double precision,p_radius double precision default 60)
returns boolean language plpgsql immutable set search_path='' as $$
declare previous jsonb; point jsonb; ax double precision; ay double precision; bx double precision; by_ double precision;
 dx double precision; dy double precision; ratio double precision; scale double precision;
begin
 if p_lat is null or p_lon is null then return false; end if;
 scale:=111195.08*cos(radians(p_lat));
 for point in select value from jsonb_array_elements(p_coordinates) loop
  if previous is not null then
   ax:=((previous->>0)::double precision-p_lon)*scale; ay:=((previous->>1)::double precision-p_lat)*111195.08;
   bx:=((point->>0)::double precision-p_lon)*scale; by_:=((point->>1)::double precision-p_lat)*111195.08;
   dx:=bx-ax; dy:=by_-ay;
   ratio:=case when dx*dx+dy*dy=0 then 0 else greatest(0,least(1,-(ax*dx+ay*dy)/(dx*dx+dy*dy))) end;
   if power(ax+ratio*dx,2)+power(ay+ratio*dy,2)<=p_radius*p_radius then return true; end if;
  end if;
  previous:=point;
 end loop;
 return false;
end $$;
revoke all on function private.route_intersects(jsonb,double precision,double precision,double precision) from public,anon,authenticated;

create function private.route_departures(p_route public.user_routes,p_now timestamptz default now())
returns table(departure_at timestamptz) language sql stable set search_path='' as $$
 select departure from (
 select day,((day+p_route.departure_time) at time zone p_route.timezone) departure
 from (select (p_now at time zone p_route.timezone)::date+offset_day as day from generate_series(-1,1) offset_day) dates
 ) candidates where extract(isodow from day)::integer=any(p_route.weekdays)
 and p_now>=departure-make_interval(mins=>p_route.lead_minutes)
 and p_now<departure+make_interval(mins=>p_route.duration_minutes);
$$;
revoke all on function private.route_departures(public.user_routes,timestamptz) from public,anon,authenticated;

create table private.route_alerts (
 id uuid primary key default gen_random_uuid(),
 route_id uuid not null references public.user_routes(id) on delete cascade,
 event_id uuid not null references private.report_events(id),
 departure_at timestamptz not null,
 created_at timestamptz not null default now(),read_at timestamptz,
 unique(route_id,event_id,departure_at)
);
create index route_alerts_event on private.route_alerts(event_id);
create index route_alerts_recent on private.route_alerts(created_at desc);
create table private.route_push_devices (
 id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,
 token text not null unique,session_id uuid not null,updated_at timestamptz not null default now()
);
create index route_push_devices_owner on private.route_push_devices(owner_id);
create table private.route_push_queue (
 id uuid primary key default gen_random_uuid(),
 alert_id uuid not null references private.route_alerts(id) on delete cascade,
 device_id uuid not null references private.route_push_devices(id) on delete cascade,
 state text not null default 'pending' check(state in ('pending','sending','receipt','delivered','failed','cancelled')),
 attempts integer not null default 0,available_at timestamptz not null default now(),lease uuid,ticket_id text,last_error text,
 unique(alert_id,device_id)
);
create index route_push_due on private.route_push_queue(available_at) where state in ('pending','sending','receipt');
create index route_push_device on private.route_push_queue(device_id);
do $$ declare t text; begin foreach t in array array['route_alerts','route_push_devices','route_push_queue'] loop
 execute format('alter table private.%I enable row level security',t);
 execute format('revoke all on private.%I from public,anon,authenticated',t);
end loop; end $$;

create function private.route_event_evidence(p_route public.user_routes,p_event uuid)
returns table(report_id uuid,report_kind text,location text,occurred_at timestamptz)
language sql stable security definer set search_path='' as $$
 select c.report_id,c.kind,c.summary->>'location_description',coalesce(c.occurred_at,c.created_at)
 from private.report_contributions c join private.route_bounds b on b.route_id=p_route.id
 where c.published and c.status<>'closed' and private.publication_visible(c.kind,c.report_id)
 and private.report_event_root(c.event_id)=private.report_event_root(p_event)
 and c.latitude between b.min_lat-0.00055 and b.max_lat+0.00055
 and c.longitude between b.min_lon-60/(111195.08*cos(radians(c.latitude))) and b.max_lon+60/(111195.08*cos(radians(c.latitude)))
 and private.route_intersects(p_route.coordinates,c.latitude,c.longitude)
 order by c.created_at desc,c.report_id limit 1;
$$;
revoke all on function private.route_event_evidence(public.user_routes,uuid) from public,anon,authenticated;

-- Called every minute by the existing authenticated worker, and at inbox reads.
-- Serialize matching so concurrent workers cannot produce duplicate merged-event alerts.
create function private.refresh_route_alerts(p_owner uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare candidate record;
begin
 perform pg_advisory_xact_lock(hashtextextended('route-alert-matching',0));
 for candidate in
 select distinct r.id route_id,private.report_event_root(c.event_id) event_id,d.departure_at
 from public.user_routes r
 join auth.users u on u.id=r.user_id and u.is_anonymous is false
 join private.route_bounds b on b.route_id=r.id
 cross join lateral private.route_departures(r) d
 join private.report_contributions c on c.published and c.status<>'closed'
  and c.latitude between b.min_lat-0.00055 and b.max_lat+0.00055
  and c.longitude between b.min_lon-60/(111195.08*cos(radians(c.latitude))) and b.max_lon+60/(111195.08*cos(radians(c.latitude)))
 where r.alerts_enabled and (p_owner is null or r.user_id=p_owner)
 and private.publication_visible(c.kind,c.report_id) and private.route_intersects(r.coordinates,c.latitude,c.longitude)
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
revoke all on function private.refresh_route_alerts(uuid) from public,anon,authenticated;

create function private.read_route_alerts() returns jsonb
language plpgsql security definer set search_path='' as $$
declare account uuid:=private.connection_account(); result jsonb;
begin
 perform private.refresh_route_alerts(account);
 select coalesce(jsonb_agg(item order by created_at desc),'[]'::jsonb) into result from (
 select a.created_at,jsonb_build_object('id',a.id,'route_id',r.id,'route_name',r.name,
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
create function private.mark_route_alert_read(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare account uuid:=private.connection_account();
begin
 update private.route_alerts a set read_at=coalesce(a.read_at,now()) from public.user_routes r
 where a.id=p_id and r.id=a.route_id and r.user_id=account;
 if not found then raise exception 'route_alert_unavailable' using errcode='42501'; end if;
end $$;

create function private.register_route_push_device(p_id uuid,p_token text) returns void
language plpgsql security definer set search_path='' as $$
declare account uuid:=private.connection_account(); session uuid:=(nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'session_id')::uuid;
begin
 if p_id is null or p_token is null or p_token !~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$'
 or session is null or not exists(select 1 from auth.sessions s where id=session and user_id=account and ((to_jsonb(s)->>'not_after') is null or (to_jsonb(s)->>'not_after')::timestamptz>now()))
 then raise exception 'route_push_invalid' using errcode='22023'; end if;
 -- Rebinding the same installation/token cancels all deliveries for its former account.
 delete from private.route_push_devices where (id=p_id and (owner_id<>account or token<>p_token or session_id<>session)) or (token=p_token and id<>p_id);
 insert into private.route_push_devices(id,owner_id,token,session_id) values(p_id,account,p_token,session)
 on conflict(id) do update set updated_at=now();
end $$;
create function private.unregister_route_push_device(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare account uuid:=private.connection_account();
begin delete from private.route_push_devices where id=p_id and owner_id=account; end $$;

create function private.route_push_job_eligible(p_id uuid,p_lease uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare eligible boolean;
begin
 select exists(select 1 from private.route_push_queue q
 join private.route_alerts a on a.id=q.alert_id join public.user_routes r on r.id=a.route_id
 join private.route_push_devices d on d.id=q.device_id and d.owner_id=r.user_id
 join auth.users u on u.id=r.user_id and u.is_anonymous is false
 join auth.sessions s on s.id=d.session_id and s.user_id=d.owner_id
 and ((to_jsonb(s)->>'not_after') is null or (to_jsonb(s)->>'not_after')::timestamptz>now())
 where q.id=p_id and q.lease=p_lease and q.state in ('sending','receipt') and r.alerts_enabled
 and d.updated_at>now()-interval '90 days'
 -- Receipt requests confirm an already accepted send; they never trigger a new push.
 and ((q.ticket_id is not null and a.created_at>now()-interval '24 hours')
  or a.departure_at in (select departure_at from private.route_departures(r)))
 and not exists(select 1 from private.route_alerts earlier where earlier.route_id=a.route_id
  and earlier.departure_at=a.departure_at and (earlier.created_at,earlier.id)<(a.created_at,a.id)
  and private.report_event_root(earlier.event_id)=private.report_event_root(a.event_id))
 and exists(select 1 from private.route_event_evidence(r,a.event_id))) into eligible;
 if not eligible then update private.route_push_queue set state='cancelled',lease=null where id=p_id and lease=p_lease; end if;
 return eligible;
end $$;

create function private.claim_route_push_jobs() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb; job record;
begin
 delete from private.route_push_devices d where d.updated_at<now()-interval '90 days' or not exists(
 select 1 from auth.sessions s where s.id=d.session_id and s.user_id=d.owner_id
 and ((to_jsonb(s)->>'not_after') is null or (to_jsonb(s)->>'not_after')::timestamptz>now()));
 perform private.refresh_route_alerts();
 -- Bound retained state while preserving a week's in-app alert history.
 delete from private.route_alerts where created_at<now()-interval '8 days';
 with due as (
 select q.id from private.route_push_queue q where q.state in ('pending','sending','receipt') and q.available_at<=now()
 and q.attempts<12 order by q.available_at limit 25 for update skip locked
 ), claimed as (
 update private.route_push_queue q set lease=gen_random_uuid(),available_at=now()+interval '5 minutes',
 attempts=q.attempts+1,state=case when ticket_id is null then 'sending' else 'receipt' end
 from due where q.id=due.id returning q.*
 ) select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'lease',q.lease,'token',d.token,'ticket_id',q.ticket_id,
 'ttl',greatest(1,least(3600,extract(epoch from (a.departure_at+make_interval(mins=>r.duration_minutes)-now()))::integer)))),'[]'::jsonb)
 into result from claimed q join private.route_push_devices d on d.id=q.device_id
 join private.route_alerts a on a.id=q.alert_id join public.user_routes r on r.id=a.route_id;
 update private.route_push_queue set state='failed',last_error='retry_limit' where attempts>=12 and available_at<=now() and state in ('pending','sending','receipt');
 -- The worker repeats this check immediately before sending, guarding changes after claim.
 for job in select * from jsonb_to_recordset(result) as j(id uuid,lease uuid) loop
  perform private.route_push_job_eligible(job.id,job.lease);
 end loop;
 return (select coalesce(jsonb_agg(item),'[]'::jsonb) from jsonb_array_elements(result) item
  where exists(select 1 from private.route_push_queue q where q.id=(item->>'id')::uuid and q.lease=(item->>'lease')::uuid));
end $$;
create function private.finish_route_push_job(p_id uuid,p_lease uuid,p_status text,p_ticket text default null,p_error text default null) returns void
language plpgsql security definer set search_path='' as $$
declare job private.route_push_queue%rowtype;
begin
 select * into job from private.route_push_queue where id=p_id and lease=p_lease for update;
 if not found then return; end if;
 if p_status='unregistered' then delete from private.route_push_devices where id=job.device_id; return; end if;
 if p_status not in ('receipt','delivered','retry','failed') or p_status is null then raise exception 'Invalid delivery status'; end if;
 if p_status='receipt' and (p_ticket is null or char_length(p_ticket)>200) then raise exception 'Invalid receipt'; end if;
 update private.route_push_queue set state=case when p_status='retry' then case when ticket_id is null then 'pending' else 'receipt' end else p_status end,
 ticket_id=coalesce(p_ticket,ticket_id),lease=null,last_error=left(p_error,80),
 available_at=now()+case when p_status='receipt' then interval '15 minutes' else least(3600,power(2,least(attempts,10))::integer*15)*interval '1 second' end where id=p_id;
end $$;

-- Public invoker wrappers expose only the intended authenticated/worker APIs.
create function public.read_route_alerts() returns jsonb language sql security invoker set search_path='' as $$ select private.read_route_alerts(); $$;
create function public.mark_route_alert_read(p_id uuid) returns void language sql security invoker set search_path='' as $$ select private.mark_route_alert_read(p_id); $$;
create function public.register_route_push_device(p_id uuid,p_token text) returns void language sql security invoker set search_path='' as $$ select private.register_route_push_device(p_id,p_token); $$;
create function public.unregister_route_push_device(p_id uuid) returns void language sql security invoker set search_path='' as $$ select private.unregister_route_push_device(p_id); $$;
create function public.claim_route_push_jobs() returns jsonb language sql security invoker set search_path='' as $$ select private.claim_route_push_jobs(); $$;
create function public.route_push_job_eligible(p_id uuid,p_lease uuid) returns boolean language sql security invoker set search_path='' as $$ select private.route_push_job_eligible(p_id,p_lease); $$;
create function public.finish_route_push_job(p_id uuid,p_lease uuid,p_status text,p_ticket text default null,p_error text default null) returns void language sql security invoker set search_path='' as $$ select private.finish_route_push_job(p_id,p_lease,p_status,p_ticket,p_error); $$;
do $$ declare signature text; begin
 foreach signature in array array['read_route_alerts()','mark_route_alert_read(uuid)','register_route_push_device(uuid,text)','unregister_route_push_device(uuid)'] loop
 execute 'revoke all on function public.'||signature||',private.'||signature||' from public,anon,authenticated';
 execute 'grant execute on function public.'||signature||',private.'||signature||' to authenticated';
 end loop;
 foreach signature in array array['claim_route_push_jobs()','route_push_job_eligible(uuid,uuid)','finish_route_push_job(uuid,uuid,text,text,text)'] loop
 execute 'revoke all on function public.'||signature||',private.'||signature||' from public,anon,authenticated';
 if exists(select 1 from pg_roles where rolname='service_role') then
 execute 'grant execute on function public.'||signature||',private.'||signature||' to service_role';
 end if;
 end loop;
end $$;
