import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL: atomic submission, validation, ownership and storage isolation', async () => {
  const db = await PGlite.create();
  try {
    // Minimal Supabase system schemas; the real migration and RLS policies are unmodified.
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create schema storage;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
      $$;
      create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      create table storage.objects(id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, unique(bucket_id,name));
      create function storage.foldername(name text) returns text[] language sql immutable as $$
        select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1]
      $$;
      alter table storage.objects enable row level security;
      grant usage on schema public,auth,storage to anon,authenticated;
      grant select,insert,update,delete on storage.objects to authenticated;
    `);
    const migrations = new URL('../supabase/migrations/', import.meta.url);
    for (const file of (await readdir(migrations))
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      await db.exec(await readFile(new URL(file, migrations), 'utf8'));
    }
    const results = await db.exec(
      await readFile(
        new URL('../supabase/tests/accident_reports.sql', import.meta.url),
        'utf8',
      ),
    );
    assert.match(results.at(-1).rows[0].result, /^PASS:/);
    const staged = await db.exec(
      await readFile(
        new URL(
          '../supabase/tests/progressive_accident_reports.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    assert.match(staged.at(-1).rows[0].result, /^PASS:/);
    const shared = await db.exec(
      await readFile(
        new URL('../supabase/tests/shared_accident_feed.sql', import.meta.url),
        'utf8',
      ),
    );
    assert.match(shared.at(-1).rows[0].result, /^PASS:/);
    const map = await db.exec(
      await readFile(
        new URL('../supabase/tests/map_accidents.sql', import.meta.url),
        'utf8',
      ),
    );
    assert.match(map.at(-1).rows[0].result, /^PASS:/);
    const kidnapping = await db.exec(
      await readFile(
        new URL('../supabase/tests/kidnapping_reports.sql', import.meta.url),
        'utf8',
      ),
    );
    assert.match(kidnapping.at(-1).rows[0].result, /^PASS:/);
    const safetyFeed = await db.exec(
      await readFile(
        new URL('../supabase/tests/public_safety_feed.sql', import.meta.url),
        'utf8',
      ),
    );
    assert.match(safetyFeed.at(-1).rows[0].result, /^PASS:/);
    const barricade = await db.exec(await readFile(new URL('../supabase/tests/barricade_reports.sql', import.meta.url), 'utf8'));
    assert.match(barricade.at(-1).rows[0].result, /^PASS:/);
    const armedPresence = await db.exec(await readFile(new URL('../supabase/tests/armed_presence_reports.sql', import.meta.url), 'utf8'));
    assert.match(armedPresence.at(-1).rows[0].result, /^PASS:/);
    const suspiciousVehicle = await db.exec(await readFile(new URL('../supabase/tests/suspicious_vehicle_reports.sql', import.meta.url), 'utf8'));
    assert.match(suspiciousVehicle.at(-1).rows[0].result, /^PASS:/);
    const vehiclePhotos = await db.exec(await readFile(new URL('../supabase/tests/suspicious_vehicle_photos.sql', import.meta.url), 'utf8'));
    assert.match(vehiclePhotos.at(-1).rows[0].result, /^PASS:/);
    const savedPlaces = await db.exec(
      await readFile(
        new URL('../supabase/tests/user_saved_places.sql', import.meta.url),
        'utf8',
      ),
    );
    assert.match(savedPlaces.at(-1).rows[0].result, /^PASS:/);
    const gunfire = await db.exec(await readFile(new URL('../supabase/tests/gunfire_reports.sql', import.meta.url), 'utf8'));
    assert.match(gunfire.at(-1).rows[0].result, /^PASS:/);
    const remaining = await db.query(
      'select count(*)::int as count from public.accident_reports',
    );
    assert.equal(
      remaining.rows[0].count,
      0,
      'All synthetic data must be rolled back',
    );
  } finally {
    await db.close();
  }
});
