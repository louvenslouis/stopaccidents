import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL: authenticated users can create and update their own saved places', async () => {
  const db = await PGlite.create();
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$
        select (nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub')::uuid
      $$;
      grant usage on schema public, auth to anon, authenticated;
    `);

    for (const name of [
      '20260922051533_user_saved_places.sql',
      '20260922055406_precise_saved_places.sql',
      '20260923014500_saved_places_insert_timestamp.sql',
    ]) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8'));
    }

    const results = await db.exec(
      await readFile(new URL('../supabase/tests/user_saved_places.sql', import.meta.url), 'utf8'),
    );
    assert.match(results.at(-1).rows[0].result, /^PASS:/);
  } finally {
    await db.close();
  }
});
