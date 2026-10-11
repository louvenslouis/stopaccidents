import { readFile, readdir } from "node:fs/promises";
import { createCryptoDatabase } from "./crypto-db.mjs";
export async function safetyDatabase({ beforeEncryption, beforeAliasEncryption } = {}) {
  const db = await createCryptoDatabase();
  try {
    await db.exec(`
      create role service_role nologin bypassrls;
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create schema storage;
      create table auth.users (id uuid primary key, is_anonymous boolean not null default false,
        email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
      create table auth.sessions(id uuid primary key, user_id uuid references auth.users(id));
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
    const migrations = new URL("../../supabase/migrations/", import.meta.url);
    for (const name of (await readdir(migrations))
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      const sql = await readFile(new URL(name, migrations), "utf8");
      if (name.endsWith('_encrypt_user_aliases.sql')) await beforeAliasEncryption?.(db);
      if (name.endsWith('_encrypt_sensitive_user_data.sql')) await beforeEncryption?.(db);
      try {
        await db.exec(sql);
      } catch (e) {
        console.error(
          name,
          e.message,
          e.internalQuery,
          e.where,
          sql.slice(
            Math.max(0, Number(e.position) - 180),
            Number(e.position) + 120,
          ),
        );
        throw e;
      }
    }

    return db;
  } catch (e) {
    await db.close();
    throw e;
  }
}
