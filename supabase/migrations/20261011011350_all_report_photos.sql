-- The two existing photo collections keep their API and storage paths.
create table private.report_photos (
  kind text not null check (kind in ('fire','gathering','breakdown','armed_presence','kidnapping','barricade','gunfire')),
  report_id uuid not null,
  storage_path text not null unique,
  captured_at timestamptz not null,
  source text not null check (source in ('camera','library')),
  primary key (kind, report_id, storage_path),
  foreign key (kind, report_id) references private.report_contributions(kind, report_id) on delete cascade
);
alter table private.report_photos enable row level security;
revoke all on private.report_photos from public, anon, authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('report-photos', 'report-photos', false, 6291456, array['image/jpeg']);

create function private.report_photo_attached(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.report_photos where storage_path=p_path);
$$;
create function private.report_photo_upload_allowed(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select auth.uid() is not null
    and p_path ~ '^[0-9a-f-]{36}/(fire|gathering|breakdown|armed_presence|kidnapping|barricade|gunfire)/[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'
    and split_part(p_path,'/',1)=auth.uid()::text
    and exists(select 1 from private.report_contributions c
      where c.kind=split_part(p_path,'/',2) and c.report_id::text=split_part(p_path,'/',3)
        and c.reporter_id=auth.uid() and c.published);
$$;
create function private.report_photo_read_allowed(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.report_photos p
    join private.report_contributions c on c.kind=p.kind and c.report_id=p.report_id
    where p.storage_path=p_path and c.published and private.publication_visible(c.kind,c.report_id)
      -- Kidnapping evidence follows the existing owner-only clues policy.
      and (c.kind<>'kidnapping' or c.reporter_id=auth.uid()));
$$;

revoke all on function private.report_photo_attached(text), private.report_photo_upload_allowed(text),
  private.report_photo_read_allowed(text) from public, anon, authenticated;
grant execute on function private.report_photo_attached(text), private.report_photo_upload_allowed(text),
  private.report_photo_read_allowed(text) to anon, authenticated;

create policy report_photos_read on storage.objects for select to anon, authenticated using (
  bucket_id='report-photos' and
  (private.report_photo_upload_allowed(name) or private.report_photo_read_allowed(name))
);
create policy report_photos_upload on storage.objects for insert to authenticated with check (
  bucket_id='report-photos' and private.report_photo_upload_allowed(name) and not private.report_photo_attached(name)
);
create policy report_photos_retry on storage.objects for update to authenticated using (
  bucket_id='report-photos' and private.report_photo_upload_allowed(name) and not private.report_photo_attached(name)
) with check (
  bucket_id='report-photos' and private.report_photo_upload_allowed(name) and not private.report_photo_attached(name)
);
create policy report_photos_cleanup on storage.objects for delete to authenticated using (
  bucket_id='report-photos' and split_part(name,'/',1)=(select auth.uid())::text
    and not private.report_photo_attached(name)
);

create function private.save_report_photos(p_kind text,p_id uuid,p_photos jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare contribution private.report_contributions%rowtype; item jsonb; path text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_kind is null or p_kind not in ('fire','gathering','breakdown','armed_presence','kidnapping','barricade','gunfire')
    or p_id is null or p_photos is null or jsonb_typeof(p_photos)<>'array' then
    raise exception 'Invalid photos' using errcode='22023';
  end if;
  if jsonb_array_length(p_photos)>4 then raise exception 'At most four photos allowed' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
  select * into contribution from private.report_contributions where kind=p_kind and report_id=p_id for update;
  if not found or contribution.reporter_id<>auth.uid() or not contribution.published then
    raise exception 'Report unavailable or unauthorized' using errcode='42501';
  end if;
  for item in select value from jsonb_array_elements(p_photos) loop
    path := item->>'storage_path';
    if path is null or not private.report_photo_upload_allowed(path)
      or split_part(path,'/',2)<>p_kind or split_part(path,'/',3)<>p_id::text
      or not exists(select 1 from storage.objects where bucket_id='report-photos' and name=path)
      or item->>'captured_at' is null
      or coalesce(item->>'source','camera') not in ('camera','library')
      or (coalesce(item->>'source','camera')='library' and contribution.location_source<>'manual') then
      raise exception 'Photo unavailable or unauthorized' using errcode='42501';
    end if;
  end loop;
  delete from private.report_photos where kind=p_kind and report_id=p_id;
  insert into private.report_photos(kind,report_id,storage_path,captured_at,source)
    select p_kind,p_id,value->>'storage_path',(value->>'captured_at')::timestamptz,
      coalesce(value->>'source','camera') from jsonb_array_elements(p_photos);
  execute format('update public.%I set updated_at=now() where id=$1',p_kind||'_reports') using p_id;
  return p_id;
end;
$$;
create function public.save_report_photos(p_kind text,p_id uuid,p_photos jsonb default '[]') returns uuid
language sql security invoker set search_path='' as $$ select private.save_report_photos(p_kind,p_id,p_photos); $$;

create function private.read_report_photos(p_kind text,p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('storage_path',p.storage_path,'captured_at',p.captured_at,'source',p.source)
    order by p.captured_at,p.storage_path),'[]'::jsonb)
  from private.report_photos p where p.kind=p_kind and p.report_id=p_id
    and private.report_photo_read_allowed(p.storage_path);
$$;
create function public.read_report_photos(p_kind text,p_id uuid) returns jsonb
language sql stable security invoker set search_path='' as $$ select private.read_report_photos(p_kind,p_id); $$;

revoke all on function private.save_report_photos(text,uuid,jsonb), public.save_report_photos(text,uuid,jsonb),
  private.read_report_photos(text,uuid), public.read_report_photos(text,uuid) from public, anon, authenticated;
grant execute on function private.save_report_photos(text,uuid,jsonb), public.save_report_photos(text,uuid,jsonb) to authenticated;
grant execute on function private.read_report_photos(text,uuid), public.read_report_photos(text,uuid) to anon, authenticated;
