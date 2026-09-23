-- The profile upsert supplies updated_at for both new and existing rows.
-- The original grants allowed UPDATE but omitted INSERT on this column.
grant insert (updated_at) on public.user_saved_places to authenticated;
