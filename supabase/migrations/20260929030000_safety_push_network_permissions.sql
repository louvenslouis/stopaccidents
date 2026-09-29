-- pg_net is non-relocatable. It was introduced by this feature and has no
-- retained application data. Refuse recreation if any HTTP request is pending.
do $migration$
begin
 if exists(select 1 from pg_extension where extname='pg_net') then
  if exists(select 1 from pg_extension e join pg_namespace n on n.oid=e.extnamespace
    where e.extname='pg_net' and n.nspname='public') then
   lock table net.http_request_queue in access exclusive mode;
   if exists(select 1 from net.http_request_queue) then raise exception 'Wait for pending HTTP requests before relocating pg_net'; end if;
   create schema if not exists extensions;
   drop extension pg_net;
   create extension pg_net with schema extensions;
  end if;
  revoke all on schema net from public,anon,authenticated;
  revoke all on all tables in schema net from public,anon,authenticated;
  revoke all on all sequences in schema net from public,anon,authenticated;
  revoke all on all functions in schema net from public,anon,authenticated;
 end if;
end $migration$;
