-- Preserve the human-readable labels while adding the exact point chosen on the
-- map. Null coordinates remain valid for legacy text-only rows until the owner
-- replaces them in the app.
alter table public.user_saved_places
  add column home_latitude double precision,
  add column home_longitude double precision,
  add column work_latitude double precision,
  add column work_longitude double precision,
  add constraint user_saved_places_home_coordinate_pair check (
    (home_latitude is null and home_longitude is null) or
    (home_latitude is not null and home_longitude is not null and
      home_latitude between 18.0 and 20.1 and home_longitude between -74.55 and -71.6)
  ),
  add constraint user_saved_places_work_coordinate_pair check (
    (work_latitude is null and work_longitude is null) or
    (work_latitude is not null and work_longitude is not null and
      work_latitude between 18.0 and 20.1 and work_longitude between -74.55 and -71.6)
  ),
  add constraint user_saved_places_home_coordinate_label check (
    home_latitude is null or home_address <> ''
  ),
  add constraint user_saved_places_work_coordinate_label check (
    work_latitude is null or work_address <> ''
  );

grant insert (
  home_latitude,
  home_longitude,
  work_latitude,
  work_longitude
) on public.user_saved_places to authenticated;

grant update (
  home_latitude,
  home_longitude,
  work_latitude,
  work_longitude
) on public.user_saved_places to authenticated;

comment on column public.user_saved_places.home_latitude is
  'Latitude of the home point explicitly selected by the account owner.';
comment on column public.user_saved_places.home_longitude is
  'Longitude of the home point explicitly selected by the account owner.';
comment on column public.user_saved_places.work_latitude is
  'Latitude of the work point explicitly selected by the account owner.';
comment on column public.user_saved_places.work_longitude is
  'Longitude of the work point explicitly selected by the account owner.';
