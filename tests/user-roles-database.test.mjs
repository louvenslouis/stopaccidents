import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL: role authorization and publication moderation', async () => {
  const db = await PGlite.create();
  try {
    // Minimal Supabase system schemas; the real migration and RLS policies are unmodified.
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create schema storage;
      create table auth.users (id uuid primary key, is_anonymous boolean not null default false);
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
    const results = await db.exec(await readFile(new URL('../supabase/tests/user_roles_moderation.sql', import.meta.url), 'utf8'));
    assert.match(results.at(-1).rows[0].result, /^PASS:/);
  } finally {
    await db.close();
  }
});
