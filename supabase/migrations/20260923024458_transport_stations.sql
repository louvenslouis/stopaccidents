-- Public transport catalogue: only trusted database operators may write it.
create table public.transport_vehicle_types (
  code text primary key check (code ~ '^[a-z][a-z0-9_]*$'),
  label text not null check (length(btrim(label)) between 1 and 60)
);

create table public.transport_stations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null check (length(btrim(name)) between 1 and 160),
  commune text not null check (length(btrim(commune)) between 1 and 120),
  address text not null default '' check (length(address) <= 500),
  latitude double precision not null check (latitude between 18.0 and 20.1),
  longitude double precision not null check (longitude between -74.55 and -71.6),
  is_active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.transport_routes (
  id uuid primary key default gen_random_uuid(),
  departure_station_id uuid not null references public.transport_stations(id) on delete restrict,
  arrival_station_id uuid not null references public.transport_stations(id) on delete restrict,
  vehicle_type text not null references public.transport_vehicle_types(code) on delete restrict,
  official_fare_htg numeric(10,2) check (official_fare_htg >= 0 and official_fare_htg <> 'NaN'::numeric),
  fare_reference text check (length(btrim(fare_reference)) between 1 and 500),
  fare_effective_from date,
  is_active boolean not null default true,
  is_demo boolean not null default false,
  created_at timestamptz not null default now(),
  constraint transport_distinct_endpoints check (departure_station_id <> arrival_station_id),
  constraint transport_route_direction_vehicle unique (departure_station_id, arrival_station_id, vehicle_type),
  constraint transport_official_fare_evidence check (
    is_demo or official_fare_htg is null or (fare_reference is not null and fare_effective_from is not null)
  )
);

-- The unique key already indexes the departure FK; index the other two FKs.
create index transport_routes_arrival_idx on public.transport_routes(arrival_station_id);
create index transport_routes_vehicle_idx on public.transport_routes(vehicle_type);
create index transport_stations_active_name_idx on public.transport_stations(name, id) where is_active;

alter table public.transport_vehicle_types enable row level security;
alter table public.transport_stations enable row level security;
alter table public.transport_routes enable row level security;

revoke all on public.transport_vehicle_types, public.transport_stations, public.transport_routes from public, anon, authenticated;
grant select on public.transport_vehicle_types, public.transport_stations, public.transport_routes to anon, authenticated;

create policy transport_vehicle_types_read on public.transport_vehicle_types for select to anon, authenticated using (true);
create policy transport_stations_read on public.transport_stations for select to anon, authenticated using (is_active);
create policy transport_routes_read on public.transport_routes for select to anon, authenticated using (
  is_active
  and exists (select 1 from public.transport_stations s where s.id = departure_station_id and s.is_active)
  and exists (select 1 from public.transport_stations s where s.id = arrival_station_id and s.is_active)
);

comment on table public.transport_stations is 'Public boarding stations. is_demo marks approximate example locations, not verified operating stations.';
comment on table public.transport_routes is 'Directional services from one station to another. Reverse trips require their own row. is_demo fares are fictional and not government tariffs.';
comment on column public.transport_routes.official_fare_htg is 'State fare in Haitian gourdes; NULL means not yet supplied. For is_demo rows only, a fictional test amount.';
comment on column public.transport_routes.fare_reference is 'Official publication or decision identifying the state tariff; required with a non-demo amount.';

insert into public.transport_vehicle_types(code, label) values ('taptap', 'Taptap'), ('bus', 'Bus');

-- Requested demonstration fixtures. Coordinates and amounts are illustrative.
insert into public.transport_stations(slug, name, commune, address, latitude, longitude, is_demo) values
  ('demo-champs-de-mars', 'Station Champs de Mars', 'Port-au-Prince', 'Exemple près du Champ de Mars · emplacement approximatif', 18.5411, -72.3364, true),
  ('demo-petion-ville', 'Station Pétion-Ville', 'Pétion-Ville', 'Exemple près de la place Saint-Pierre · emplacement approximatif', 18.5125, -72.2853, true),
  ('demo-delmas-32', 'Station Delmas 32', 'Delmas', 'Exemple dans la zone de Delmas 32 · emplacement approximatif', 18.5578, -72.3028, true),
  ('demo-carrefour', 'Station Carrefour', 'Carrefour', 'Exemple dans la zone de Carrefour · emplacement approximatif', 18.5347, -72.4094, true),
  ('demo-cap-haitien', 'Station Cap-Haïtien', 'Cap-Haïtien', 'Exemple en centre-ville · emplacement approximatif', 19.7578, -72.2042, true);

-- Resolve station IDs by stable slugs, never by assumed generated UUIDs.
insert into public.transport_routes(departure_station_id, arrival_station_id, vehicle_type, official_fare_htg, is_demo)
select departure.id, arrival.id, fixture.vehicle_type, fixture.fare, true
from (values
  ('demo-champs-de-mars', 'demo-petion-ville', 'taptap', 75.00),
  ('demo-champs-de-mars', 'demo-petion-ville', 'bus', 50.00),
  ('demo-champs-de-mars', 'demo-delmas-32', 'taptap', 50.00),
  ('demo-champs-de-mars', 'demo-carrefour', 'bus', 100.00),
  ('demo-petion-ville', 'demo-champs-de-mars', 'taptap', 75.00),
  ('demo-delmas-32', 'demo-petion-ville', 'taptap', 60.00),
  ('demo-carrefour', 'demo-champs-de-mars', 'bus', 100.00),
  ('demo-cap-haitien', 'demo-champs-de-mars', 'bus', 1500.00)
) as fixture(departure_slug, arrival_slug, vehicle_type, fare)
join public.transport_stations departure on departure.slug = fixture.departure_slug
join public.transport_stations arrival on arrival.slug = fixture.arrival_slug;
