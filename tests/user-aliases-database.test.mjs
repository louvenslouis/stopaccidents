import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('PostgreSQL: aliases are generated once, unique, private and exposed safely on testimony', async () => {
  const db = await PGlite.create();
  const existingId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const guestId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const reportId = '11111111-1111-4111-8111-111111111111';
  try {
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create schema storage;
      create table auth.users (id uuid primary key, is_anonymous boolean not null default false,
        email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
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
      insert into auth.users(id,email) values ('${existingId}','prive@example.com');
    `);
    const migrations = new URL('../supabase/migrations/', import.meta.url);
    for (const name of (await readdir(migrations)).filter((name) => name.endsWith('.sql')).sort()) {
      await db.exec(await readFile(new URL(name, migrations), 'utf8'));
    }
    const aliasFor = async (id) => (await db.query(
      'select alias from public.user_aliases where user_id=$1', [id],
    )).rows[0]?.alias;
    const originalAlias = await aliasFor(existingId);
    assert.match(originalAlias, /^[A-Z][A-Za-z0-9]{3,39}$/);
    await db.query(`insert into auth.users(id,is_anonymous,raw_user_meta_data)
      values ($1,true,'{"alias":"AliasInjected"}')`, [guestId]);
    const guestAlias = await aliasFor(guestId);
    assert.match(guestAlias, /^[A-Z][A-Za-z0-9]{3,39}$/);
    assert.notEqual(guestAlias, 'AliasInjected');
    await db.exec(`set role authenticated;
      select set_config('request.jwt.claims','{"sub":"${guestId}","role":"authenticated","is_anonymous":true}',false);`);
    assert.deepEqual((await db.query('select alias from public.user_aliases')).rows, [{ alias: guestAlias }]);
    await db.exec('reset role');
    await db.query(`update auth.users set is_anonymous=false, email='invite@example.com',
      raw_user_meta_data='{"alias":"AnotherAlias"}' where id=$1`, [guestId]);
    assert.equal(await aliasFor(guestId), guestAlias, 'Account updates must preserve the alias');
    assert.equal((await db.query('select private.assign_user_alias($1) as alias', [existingId])).rows[0].alias, originalAlias);

    // Force a real collision, then exercise the numeric suffix path.
    const generator = (await db.query(`select pg_get_functiondef('private.generate_user_alias(boolean)'::regprocedure) as sql`)).rows[0].sql;
    await db.exec(`create or replace function private.generate_user_alias(p_with_digits boolean default false)
      returns text language sql volatile security invoker set search_path='' as $$
        select case when p_with_digits then 'TestCollision1234' else 'TestCollision' end
      $$;`);
    await db.exec(`insert into auth.users(id) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');`);
    assert.equal(await aliasFor('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'TestCollision');
    assert.equal(await aliasFor('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 'TestCollision1234');
    await db.exec(generator);
    await db.exec(`insert into auth.users(id) select gen_random_uuid() from generate_series(1,2000);`);
    const stats = (await db.query(`select count(*)::int as total, count(distinct alias)::int as distinct_aliases,
      bool_and(alias ~ '^[A-Z][A-Za-z0-9]{3,39}$') as valid,
      count(*) filter(where alias ~ '[0-9]$')::int as numbered from public.user_aliases`)).rows[0];
    assert.equal(stats.total, stats.distinct_aliases);
    assert.ok(stats.valid);
    assert.ok(stats.numbered > 0);

    await db.exec(`set role authenticated;
      select set_config('request.jwt.claims','{"sub":"${existingId}","role":"authenticated"}',false);`);
    assert.deepEqual((await db.query('select alias from public.user_aliases')).rows, [{ alias: originalAlias }]);
    for (const sql of [
      `update public.user_aliases set alias='AliasInjected'`,
      `delete from public.user_aliases`,
      `insert into public.user_aliases(user_id,alias) values ('${guestId}','AliasInjected')`,
      `select private.assign_user_alias('${guestId}')`,
      `select private.generate_user_alias(false)`,
    ]) {
      await assert.rejects(db.query(sql), (error) => error.code === '42501');
    }
    await db.query(`select public.prepare_report_event('barricade',$1,null,18.55,-72.3,9)`, [reportId]);
    await db.query(`select public.save_barricade_report_step($1,1,'Delmas',18.55,-72.3,9)`, [reportId]);
    await db.query(`select public.save_barricade_report_step($1,2,p_obstacles=>'Pierres',p_passage=>'Bloqué')`, [reportId]);
    await db.query(`select public.save_barricade_report_step($1,3,p_details=>'Témoignage de test')`, [reportId]);
    await db.exec(`reset role; set role anon;
      select set_config('request.jwt.claims','{"role":"anon"}',false);`);
    await assert.rejects(db.query('select * from public.user_aliases'), (error) => error.code === '42501');
    const event = (await db.query(`select public.read_report_event('barricade',$1) as event`, [reportId])).rows[0].event;
    assert.equal(event.contributions[0].author_alias, originalAlias);
    for (const key of ['user_id', 'reporter_id', 'email', 'raw_user_meta_data']) {
      assert.ok(!(key in event.contributions[0]), `Testimony must omit ${key}`);
    }
    assert.ok(!JSON.stringify(event).includes(existingId));
    assert.ok(!JSON.stringify(event).includes('prive@example.com'));
    await db.exec(`reset role; delete from auth.users where id='${guestId}';`);
    assert.equal(await aliasFor(guestId), undefined, 'Deleted accounts must not leave an alias mapping');
  } finally {
    await db.close();
  }
});
