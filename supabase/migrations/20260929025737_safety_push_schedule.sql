-- PGlite tests lack network/cron extensions. Managed Supabase has both.
-- The worker itself authenticates the random private header; no client secret is used.
do $migration$
begin
 if exists(select 1 from pg_available_extensions where name='pg_cron')
 and exists(select 1 from pg_available_extensions where name='pg_net') then
  create extension if not exists pg_cron;
  create extension if not exists pg_net;
  perform cron.schedule('stopaccidents-safety-push','* * * * *', $job$
    select net.http_post(
      url := 'https://vqzmzblwmbhmfoikpbhy.supabase.co/functions/v1/safety-push',
      headers := jsonb_build_object('Content-Type','application/json','x-safety-worker-key',
        (select secret::text from private.safety_push_worker_config where id)),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $job$);
 end if;
end $migration$;
