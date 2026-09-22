-- Reports remain the source of truth. Events group contributions without deleting evidence.
create table private.report_event_rules (
  kind text primary key, radius_m integer not null, window_minutes integer not null
);
insert into private.report_event_rules values
 ('accident',150,30),('kidnapping',150,20),('barricade',100,360),
 ('armed_presence',200,30),('suspicious_vehicle',100,10),('gunfire',500,10);
create table private.report_events (
 id uuid primary key default gen_random_uuid(),
 kind text not null references private.report_event_rules(kind),
 merged_into uuid references private.report_events(id),
 created_at timestamptz not null default now(),
 check (merged_into is distinct from id)
);
create index report_events_parent_idx on private.report_events(merged_into);
create table private.report_contributions (
 kind text not null references private.report_event_rules(kind), report_id uuid not null,
 event_id uuid not null references private.report_events(id),
 reporter_id uuid not null references auth.users(id) on delete cascade,
 latitude double precision, longitude double precision, accuracy double precision,
 created_at timestamptz not null default now(), published boolean not null default false,
 status text not null default 'received', completed_step integer not null default 0,
 summary jsonb not null default '{}'::jsonb,
 primary key(kind, report_id)
);
create index report_contributions_event_idx on private.report_contributions(event_id);
create index report_contributions_nearby_idx on private.report_contributions(kind,created_at desc) where published and status <> 'closed';
create index report_contributions_reporter_idx on private.report_contributions(reporter_id,kind,created_at desc);
create table private.report_event_moderators (user_id uuid primary key references auth.users(id) on delete cascade);
create table private.report_event_merges (
 id uuid primary key default gen_random_uuid(), source_id uuid not null references private.report_events(id),
 target_id uuid not null references private.report_events(id), moderator_id uuid references auth.users(id) on delete set null,
 reason text not null check(char_length(trim(reason)) between 3 and 500), created_at timestamptz not null default now(),
 undone_at timestamptz, undone_by uuid references auth.users(id) on delete set null
);
create unique index report_event_active_merge_idx on private.report_event_merges(source_id) where undone_at is null;
alter table private.report_event_rules enable row level security;
alter table private.report_events enable row level security;
alter table private.report_contributions enable row level security;
alter table private.report_event_moderators enable row level security;
alter table private.report_event_merges enable row level security;
revoke all on private.report_event_rules,private.report_events,private.report_contributions,private.report_event_moderators,private.report_event_merges from public,anon,authenticated;

create function private.report_event_root(p_id uuid) returns uuid
language sql stable set search_path = '' as $$
 with recursive ancestors as (
 select id,merged_into from private.report_events where id=p_id
 union all select e.id,e.merged_into from private.report_events e join ancestors a on e.id=a.merged_into
 ) select id from ancestors where merged_into is null;
$$;
create function private.report_distance(a double precision,b double precision,c double precision,d double precision)
returns double precision language sql immutable set search_path = '' as $$
 select 6371000 * 2 * asin(sqrt(least(1.0,greatest(0.0,
 power(sin(radians(c-a)/2),2)+cos(radians(a))*cos(radians(c))*power(sin(radians(d-b)/2),2)))));
$$;

-- Copy only the existing public projection; never copy private identifiers or photos to the feed.
create function private.sync_report_event() returns trigger
language plpgsql security definer set search_path = '' as $$
declare c private.report_contributions%rowtype; event uuid; value jsonb;
begin
 if tg_op='DELETE' then
  delete from private.report_contributions where kind=tg_argv[0] and report_id=old.id;
  return old;
 end if;
 select * into c from private.report_contributions where kind=tg_argv[0] and report_id=new.id for update;
 if found then
  if c.reporter_id <> new.reporter_id then raise exception 'Contribution owner mismatch' using errcode='42501'; end if;
  event := c.event_id;
 else
  insert into private.report_events(kind) values(tg_argv[0]) returning id into event;
 end if;
 value := jsonb_build_object('id',new.id,'report_kind',tg_argv[0],
 'location_description',new.location_description,'latitude',new.latitude,'longitude',new.longitude,
 'created_at',new.created_at,'completed_step',new.completed_step,
 'accident_type',to_jsonb(new)->'accident_type','severity',to_jsonb(new)->'severity');
 insert into private.report_contributions(kind,report_id,event_id,reporter_id,latitude,longitude,accuracy,created_at,published,status,completed_step,summary)
 values(tg_argv[0],new.id,event,new.reporter_id,new.latitude,new.longitude,new.location_accuracy_m,new.created_at,true,new.status,new.completed_step,value)
 on conflict(kind,report_id) do update set latitude=excluded.latitude,longitude=excluded.longitude,
 accuracy=excluded.accuracy,created_at=excluded.created_at,published=true,status=excluded.status,
 completed_step=excluded.completed_step,summary=excluded.summary;
 return new;
end;
$$;
-- Alphabetical ordering ensures event association exists before completion reward triggers.
do $$ declare kind text; begin
 for kind in select r.kind from private.report_event_rules r loop
 execute format('create trigger a_event_sync after insert or update or delete on public.%I for each row execute function private.sync_report_event(%L)',kind||'_reports',kind);
 -- Backfill through the projection trigger without changing report contents or awarding points.
 execute format('update public.%I set id=id',kind||'_reports');
 end loop;
end $$;

create function private.event_summaries() returns setof jsonb
language sql stable set search_path = '' as $$
 with members as (
 select c.*,private.report_event_root(event_id) root from private.report_contributions c where published
 ), representatives as (
 select distinct on(root) root,summary from members order by root,completed_step desc,created_at,report_id
 ), totals as (
 select root,count(*) testimony_count,count(distinct reporter_id) witness_count,max(created_at) last_observed_at
 from members group by root
 ) select r.summary || jsonb_build_object('event_id',r.root,'testimony_count',t.testimony_count,
 'witness_count',t.witness_count,'last_observed_at',t.last_observed_at)
 from representatives r join totals t using(root);
$$;
create or replace function private.read_map_reports() returns jsonb
language sql stable security definer set search_path = '' as $$
 with candidates as materialized (
 select value from private.event_summaries() value
 where (value->>'latitude')::double precision between 18.0 and 20.1
 and (value->>'longitude')::double precision between -74.55 and -71.6
 order by (value->>'last_observed_at')::timestamptz desc,value->>'event_id' desc limit 501
 ), visible as (select * from candidates limit 500)
 select jsonb_build_object('reports',coalesce((select jsonb_agg(value) from visible),'[]'::jsonb),
 'truncated',(select count(*)>500 from candidates));
$$;
create or replace function private.read_latest_report() returns jsonb
language sql stable security definer set search_path = '' as $$
 select value from private.event_summaries() value
 order by (value->>'last_observed_at')::timestamptz desc,value->>'event_id' desc limit 1;
$$;

create function private.nearby_report_events(p_kind text,p_latitude double precision,p_longitude double precision,p_accuracy double precision,p_exclude uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not exists(select 1 from private.report_event_rules where kind=p_kind)
 or p_latitude is null or p_latitude not between -90 and 90 or p_longitude is null or p_longitude not between -180 and 180
 or p_accuracy is null or p_accuracy not between 0 and 30 then
 raise exception 'Invalid location or category' using errcode='22023'; end if;
 return (with nearby as (
 select private.report_event_root(c.event_id) root,
 min(private.report_distance(p_latitude,p_longitude,c.latitude,c.longitude)) distance_m
 from private.report_contributions c join private.report_event_rules r on r.kind=c.kind
 where c.kind=p_kind and c.published and c.status<>'closed' and c.report_id is distinct from p_exclude
 and c.created_at >= now()-make_interval(mins=>r.window_minutes)
 and private.report_distance(p_latitude,p_longitude,c.latitude,c.longitude) <= r.radius_m+p_accuracy+least(coalesce(c.accuracy,0),30)
 group by private.report_event_root(c.event_id)
 ), candidates as (
 select s || jsonb_build_object('distance_m',round(n.distance_m)::integer) value
 from private.event_summaries() s join nearby n on (s->>'event_id')::uuid=n.root
 order by n.distance_m,(s->>'last_observed_at')::timestamptz desc limit 5
 ) select coalesce(jsonb_agg(value),'[]'::jsonb) from candidates);
end;
$$;
create function public.nearby_report_events(p_kind text,p_latitude double precision,p_longitude double precision,p_accuracy double precision,p_exclude uuid default null)
returns jsonb language sql stable security invoker set search_path='' as $$
 select private.nearby_report_events(p_kind,p_latitude,p_longitude,p_accuracy,p_exclude);
$$;

create function private.prepare_report_event(p_kind text,p_report_id uuid,p_event_id uuid,p_latitude double precision,p_longitude double precision,p_accuracy double precision)
returns uuid language plpgsql security definer set search_path='' as $$
declare c private.report_contributions%rowtype; event uuid; suggestions jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if p_report_id is null then raise exception 'Report ID required'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_report_id::text,0));
 select * into c from private.report_contributions where kind=p_kind and report_id=p_report_id;
 if found then
 if c.reporter_id<>auth.uid() then raise exception 'Not your contribution' using errcode='42501'; end if;
 return private.report_event_root(c.event_id);
 end if;
 suggestions := private.nearby_report_events(p_kind,p_latitude,p_longitude,p_accuracy,p_report_id);
 if p_event_id is not null then
 -- Serialize with merges so a target cannot move between validation and association.
 perform pg_advisory_xact_lock(hashtextextended('report-event-merges',0));
 event := private.report_event_root(p_event_id);
 if not exists(select 1 from jsonb_array_elements(suggestions) x where (x->>'event_id')::uuid=event) then
 raise exception 'Cet événement n’est plus proposé. Actualisez les événements proches.' using errcode='22023'; end if;
 else
 insert into private.report_events(kind) values(p_kind) returning id into event;
 end if;
 insert into private.report_contributions(kind,report_id,event_id,reporter_id,latitude,longitude,accuracy)
 values(p_kind,p_report_id,event,auth.uid(),p_latitude,p_longitude,p_accuracy);
 return event;
end;
$$;
create function public.prepare_report_event(p_kind text,p_report_id uuid,p_event_id uuid,p_latitude double precision,p_longitude double precision,p_accuracy double precision)
returns uuid language sql security invoker set search_path='' as $$
 select private.prepare_report_event(p_kind,p_report_id,p_event_id,p_latitude,p_longitude,p_accuracy);
$$;

create or replace function private.reward_completed_report() returns trigger
language plpgsql security definer set search_path='' as $$
declare contribution private.report_contributions%rowtype; rule private.report_event_rules%rowtype;
begin
 if auth.uid() is null or auth.uid()<>new.reporter_id or new.completed_step<>tg_argv[1]::integer then return new; end if;
 if tg_op='UPDATE' and old.completed_step>=tg_argv[1]::integer then return new; end if;
 -- Serializes simultaneous completions by one identity, including distinct report IDs.
 perform pg_advisory_xact_lock(hashtextextended('reward:'||new.reporter_id::text,0));
 select * into contribution from private.report_contributions where kind=tg_argv[0] and report_id=new.id;
 select * into rule from private.report_event_rules where kind=tg_argv[0];
 if exists (
 select 1 from public.report_rewards r join private.report_contributions c on c.kind=r.report_kind and c.report_id=r.report_id
 where r.user_id=new.reporter_id and r.report_kind=tg_argv[0]
 and (private.report_event_root(c.event_id)=private.report_event_root(contribution.event_id)
 or (abs(extract(epoch from(c.created_at-contribution.created_at)))<=rule.window_minutes*60
 and private.report_distance(c.latitude,c.longitude,contribution.latitude,contribution.longitude)<=rule.radius_m+least(coalesce(c.accuracy,0),30)+least(coalesce(contribution.accuracy,0),30)))
 ) then return new; end if;
 insert into public.report_rewards(report_kind,report_id,user_id) values(tg_argv[0],new.id,new.reporter_id)
 on conflict(report_kind,report_id) do nothing;
 return new;
end;
$$;
-- Keep the reward ledger immutable; merged duplicates count once and undo restores the original balance.
create function private.read_event_rewards(p_report_id uuid,p_report_kind text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 return (with ranked as (
 select r.*,row_number() over(partition by coalesce(private.report_event_root(c.event_id),r.report_id)
 order by r.created_at,r.report_id) position
 from public.report_rewards r left join private.report_contributions c on c.kind=r.report_kind and c.report_id=r.report_id
 where r.user_id=auth.uid()
 ) select jsonb_build_object('total',coalesce(sum(points) filter(where position=1),0),
 'count',count(*) filter(where position=1),'earned',coalesce(max(points) filter(where position=1 and report_id=p_report_id and report_kind=p_report_kind),0)) from ranked);
end;
$$;
create or replace function public.read_my_rewards(p_report_id uuid default null,p_report_kind text default null)
returns jsonb language sql stable security invoker set search_path='' as $$ select private.read_event_rewards(p_report_id,p_report_kind); $$;

create function private.read_report_event(p_kind text,p_report_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare event uuid; moderator boolean;
begin
 select private.report_event_root(event_id) into event from private.report_contributions where kind=p_kind and report_id=p_report_id and published;
 if event is null then return null; end if;
 moderator := exists(select 1 from private.report_event_moderators where user_id=auth.uid());
 return jsonb_build_object('event_id',event,'is_moderator',moderator,
 'summary',(select s from private.event_summaries() s where (s->>'event_id')::uuid=event),
 'contributions',(select coalesce(jsonb_agg(c.summary order by c.created_at desc,c.report_id),'[]'::jsonb)
 from private.report_contributions c where c.published and private.report_event_root(c.event_id)=event),
 'merges',case when moderator then (select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'reason',m.reason,'created_at',m.created_at)),'[]'::jsonb)
 from private.report_event_merges m where undone_at is null and private.report_event_root(m.target_id)=event) else '[]'::jsonb end);
end;
$$;
create function public.read_report_event(p_kind text,p_report_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.read_report_event(p_kind,p_report_id); $$;

create function private.merge_report_events(p_source uuid,p_target uuid,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare source uuid; target uuid; merge uuid;
begin
 if auth.uid() is null or not exists(select 1 from private.report_event_moderators where user_id=auth.uid()) then
 raise exception 'Moderator required' using errcode='42501'; end if;
 if p_reason is null or char_length(trim(p_reason)) not between 3 and 500 then raise exception 'Reason required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('report-event-merges',0));
 source:=private.report_event_root(p_source); target:=private.report_event_root(p_target);
 if source is null or target is null then raise exception 'Unknown event'; end if;
 if source=target then return null; end if;
 if (select kind from private.report_events where id=source)<>(select kind from private.report_events where id=target) then raise exception 'Different categories'; end if;
 update private.report_events set merged_into=target where id=source;
 insert into private.report_event_merges(source_id,target_id,moderator_id,reason) values(source,target,auth.uid(),trim(p_reason)) returning id into merge;
 return merge;
end;
$$;
create function public.merge_report_events(p_source uuid,p_target uuid,p_reason text) returns uuid
language sql security invoker set search_path='' as $$ select private.merge_report_events(p_source,p_target,p_reason); $$;
create function private.undo_report_event_merge(p_merge_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare m private.report_event_merges%rowtype;
begin
 if auth.uid() is null or not exists(select 1 from private.report_event_moderators where user_id=auth.uid()) then raise exception 'Moderator required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('report-event-merges',0));
 select * into m from private.report_event_merges where id=p_merge_id for update;
 if not found then raise exception 'Unknown merge'; end if;
 if m.undone_at is not null then return; end if;
 update private.report_events set merged_into=null where id=m.source_id;
 update private.report_event_merges set undone_at=now(),undone_by=auth.uid() where id=m.id;
end;
$$;
create function public.undo_report_event_merge(p_merge_id uuid) returns void
language sql security invoker set search_path='' as $$ select private.undo_report_event_merge(p_merge_id); $$;

-- Explicit allowlist; helpers and tables remain inaccessible to API roles.
revoke all on function private.report_event_root(uuid),private.report_distance(double precision,double precision,double precision,double precision),private.sync_report_event(),private.event_summaries() from public,anon,authenticated;
do $$ declare signature text; begin
 foreach signature in array array[
 'nearby_report_events(text,double precision,double precision,double precision,uuid)',
 'prepare_report_event(text,uuid,uuid,double precision,double precision,double precision)',
 'merge_report_events(uuid,uuid,text)','undo_report_event_merge(uuid)'
 ] loop
 execute 'revoke all on function private.'||signature||' from public,anon,authenticated';
 execute 'revoke all on function public.'||signature||' from public,anon,authenticated';
 execute 'grant execute on function private.'||signature||' to authenticated';
 execute 'grant execute on function public.'||signature||' to authenticated';
 end loop;
end $$;
revoke all on function private.read_event_rewards(uuid,text) from public,anon,authenticated;
grant execute on function private.read_event_rewards(uuid,text) to authenticated;
revoke all on function private.read_report_event(text,uuid),public.read_report_event(text,uuid) from public,anon,authenticated;
grant execute on function private.read_report_event(text,uuid),public.read_report_event(text,uuid) to anon,authenticated;
