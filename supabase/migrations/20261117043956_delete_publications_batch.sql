create function public.delete_publications(p_reports jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  item record;
  total integer := 0;
begin
  if auth.uid() is null or private.current_app_role() not in ('moderator','admin') then
    raise exception 'Moderator required' using errcode='42501';
  end if;
  if jsonb_typeof(p_reports) is distinct from 'array' or p_reports='[]'::jsonb then
    raise exception 'Select at least one publication' using errcode='22023';
  end if;

  -- Reserve every report before the individual deletion takes the event merge lock.
  -- A concurrent single deletion or overlapping batch follows the same lock order.
  for item in select distinct r.id from jsonb_to_recordset(p_reports) as r(id uuid) order by r.id loop
    perform pg_advisory_xact_lock(hashtextextended(item.id::text,0));
  end loop;

  for item in select distinct r.kind,r.id from jsonb_to_recordset(p_reports) as r(kind text,id uuid) loop
    perform public.delete_publication(item.kind,item.id);
    total := total + 1;
  end loop;
  return total;
end;
$$;
revoke all on function public.delete_publications(jsonb) from public,anon,authenticated;
grant execute on function public.delete_publications(jsonb) to authenticated;
