-- Keep legacy motorcycle reports readable while recording precise new situations.
alter table public.accident_reports
  drop constraint accident_reports_accident_type_check,
  add constraint accident_reports_accident_type_check check (
    accident_type in (
      'two_cars', 'single_car', 'motorcycle', 'other',
      'car_motorcycle', 'car_pedestrian', 'car_tuktuk', 'single_motorcycle'
    )
  );
