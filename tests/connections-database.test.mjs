import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createCryptoDatabase } from './helpers/crypto-db.mjs';

test('connections require recipient consent and keep invitations private', async () => {
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
    for (const name of (await readdir(migrations)).filter((name) => name.endsWith('.sql')).sort()) {
      await db.exec(await readFile(new URL(name, migrations), 'utf8'));
    }

    const alice = randomUUID(), bob = randomUUID(), eve = randomUUID(), guest = randomUUID();
    await db.query('insert into auth.users(id,is_anonymous) values ($1,false),($2,false),($3,false),($4,true)', [alice,bob,eve,guest]);
    await db.query('update auth.users set email = $1 where id = $2', ['alice@example.com', alice]);
    await db.query('update auth.users set email = $1 where id = $2', ['bob@example.com', bob]);
    const aliases = (await db.query('select user_id,alias from private.user_aliases')).rows;
    const alias = id => aliases.find(row => row.user_id === id).alias;
    async function login(id, role = 'authenticated') {
      await db.exec('reset role; set role ' + role);
      // Deliberately omit is_anonymous: the stored account remains authoritative.
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({sub:id,role})]);
    }
    const read = async () => (await db.query('select public.read_my_connections() as value')).rows[0].value;
    const invite = async value => (await db.query('select public.invite_connection($1) as id', [value])).rows[0].id;
    const respond = (id, action) => db.query('select public.respond_connection($1,$2)', [id,action]);
    const rejects = (operation, message) => assert.rejects(operation, error => error.message.includes(message));

    await login(alice);
    assert.deepEqual(await read(), {alias:alias(alice),connections:[]});
    await rejects(invite(alias(alice)), 'connection_self_invitation');
    await rejects(invite('NoSuchAlias123'), 'connection_alias_not_found');
    await rejects(invite(alias(guest)), 'connection_alias_not_found');
    await rejects(invite(null), 'connection_invalid_alias');
    await rejects(invite('bad alias'), 'connection_invalid_alias');
    const id = await invite('  ' + alias(bob).toLowerCase() + '  ');
    const outgoing = (await read()).connections;
    assert.equal(outgoing.length, 1);
    assert.equal(outgoing[0].status, 'pending');
    assert.equal(outgoing[0].direction, 'outgoing');
    assert.equal(outgoing[0].alias, alias(bob));
    assert.equal(outgoing[0].email, null);
    assert.ok(!JSON.stringify(outgoing).includes(bob));
    await rejects(invite(alias(bob)), 'connection_already_exists');
    await rejects(respond(id,'accept'), 'connection_invitation_unavailable');
    await rejects(respond(id,'decline'), 'connection_invitation_unavailable');
    await rejects(respond(id,'other'), 'connection_invalid_action');
    await assert.rejects(db.query('select * from private.user_connections'), e => e.code === '42501');
    await assert.rejects(db.query("update private.user_connections set status='accepted',accepted_at=now()"), e => e.code === '42501');
    assert.deepEqual((await db.query('select alias from public.user_aliases')).rows, [{alias:alias(alice)}]);

    await login(eve);
    assert.equal((await read()).connections.length, 0);
    for (const action of ['accept','decline','cancel']) await rejects(respond(id,action), 'connection_invitation_unavailable');
    await login(bob);
    assert.equal((await read()).connections[0].direction, 'incoming');
    assert.equal((await read()).connections[0].email, null);
    await rejects(invite(alias(alice)), 'connection_already_exists');
    await rejects(respond(id,'cancel'), 'connection_invitation_unavailable');
    await respond(id,'accept');
    assert.equal((await read()).connections[0].email, 'alice@example.com');
    assert.equal((await read()).connections[0].status, 'accepted');
    await rejects(respond(id,'accept'), 'connection_invitation_unavailable');
    await login(alice);
    assert.equal((await read()).connections[0].status, 'accepted');
    assert.equal((await read()).connections[0].email, 'bob@example.com');
    await rejects(respond(id,'cancel'), 'connection_invitation_unavailable');
    await rejects(invite(alias(bob)), 'connection_already_exists');

    const declined = await invite(alias(eve));
    await login(eve);
    await respond(declined,'decline');
    assert.equal((await read()).connections.length,0);
    await login(alice);
    const cancelled = await invite(alias(eve));
    await respond(cancelled,'cancel');
    await login(eve);
    await rejects(respond(cancelled,'accept'),'connection_invitation_unavailable');
    assert.equal((await read()).connections.length,0);

    await login(guest);
    await rejects(read(),'connection_account_required');
    await rejects(invite(alias(alice)),'connection_account_required');
    await rejects(respond(id,'accept'),'connection_account_required');
    await login(null,'anon');
    await assert.rejects(read(), e => e.code === '42501');
    await assert.rejects(invite(alias(alice)), e => e.code === '42501');
    await login(null);
    await rejects(read(),'connection_account_required');
    await login(randomUUID());
    await rejects(read(),'connection_account_required');

    await db.exec('reset role');
    await db.query('delete from auth.users where id=$1',[bob]);
    await login(alice);
    assert.equal((await read()).connections.length,0);
  } finally { await db.close(); }
});
