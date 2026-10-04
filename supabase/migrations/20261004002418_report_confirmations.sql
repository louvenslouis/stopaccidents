-- Community endorsements, independent of testimony, freshness, urgency or official verification.
create table private.report_confirmations (
  event_id uuid not null references private.report_events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index report_confirmations_user_idx on private.report_confirmations(user_id);
alter table private.report_confirmations enable row level security;
revoke all on private.report_confirmations from public, anon, authenticated;

create function private.read_report_confirmation(p_kind text, p_report_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare event uuid; total bigint; mine boolean; author boolean; open boolean;
begin
  select private.report_event_root(c.event_id), c.status <> 'closed' into event, open
  from private.report_contributions c where c.kind=p_kind and c.report_id=p_report_id
    and c.published and private.publication_visible(c.kind,c.report_id);
  if event is null then return null; end if;
  -- Recursive descendants use the parent index and preserve votes across moderator merges.
  with recursive family as (
    select event as id
    union all select e.id from private.report_events e join family f on e.merged_into=f.id
  )
  select count(distinct v.user_id), coalesce(bool_or(v.user_id=auth.uid()),false)
    into total,mine from private.report_confirmations v join family f on f.id=v.event_id;
  select exists(select 1 from private.report_contributions c
    where c.reporter_id=auth.uid() and c.published and private.report_event_root(c.event_id)=event) into author;
  -- Public readers receive only an aggregate; voter identities never leave the private schema.
  if auth.uid() is null then mine := false; end if;
  return jsonb_build_object('event_id',event,'count',total,'confirmed',mine,'can_confirm',open and not author);
end;
$$;
create function public.read_report_confirmation(p_kind text,p_report_id uuid)
returns jsonb language sql stable security invoker set search_path='' as $$
  select private.read_report_confirmation(p_kind,p_report_id);
$$;

create function private.set_report_confirmation(p_kind text,p_report_id uuid,p_confirmed boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
declare state jsonb; event uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_confirmed is null then raise exception 'Confirmation required' using errcode='22023'; end if;
  -- Shares the merge lock: resolving a root and writing cannot race a moderator merge.
  perform pg_advisory_xact_lock(hashtextextended('report-event-merges',0));
  state := private.read_report_confirmation(p_kind,p_report_id);
  if state is null then raise exception 'Publication unavailable' using errcode='22023'; end if;
  event := (state->>'event_id')::uuid;
  if p_confirmed then
    if not (state->>'can_confirm')::boolean then raise exception 'Confirmation not allowed' using errcode='42501'; end if;
    if not (state->>'confirmed')::boolean then
      insert into private.report_confirmations(event_id,user_id) values(event,auth.uid()) on conflict do nothing;
    end if;
  else
    -- Remove the caller's endorsements from every merged branch, without touching other users.
    with recursive family as (
      select event as id
      union all select e.id from private.report_events e join family f on e.merged_into=f.id
    )
    delete from private.report_confirmations v using family f where v.event_id=f.id and v.user_id=auth.uid();
  end if;
  return private.read_report_confirmation(p_kind,p_report_id);
end;
$$;
create function public.set_report_confirmation(p_kind text,p_report_id uuid,p_confirmed boolean)
returns jsonb language sql security invoker set search_path='' as $$
  select private.set_report_confirmation(p_kind,p_report_id,p_confirmed);
$$;
revoke all on function private.read_report_confirmation(text,uuid),public.read_report_confirmation(text,uuid),
  private.set_report_confirmation(text,uuid,boolean),public.set_report_confirmation(text,uuid,boolean) from public,anon,authenticated;
grant execute on function private.read_report_confirmation(text,uuid),public.read_report_confirmation(text,uuid) to anon,authenticated;
grant execute on function private.set_report_confirmation(text,uuid,boolean),public.set_report_confirmation(text,uuid,boolean) to authenticated;
