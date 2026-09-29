import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('live sharing restricts readers, expires, and rejects stale writers', async () => {
  const db = await PGlite.create();
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

    `);
    const migrations = new URL('../supabase/migrations/', import.meta.url);
    for (const name of (await readdir(migrations)).filter((name) => name.endsWith('.sql')).sort()) {
      await db.exec(await readFile(new URL(name, migrations), 'utf8'));
    }

    const alice = randomUUID(), bob = randomUUID(), eve = randomUUID(), guest = randomUUID();
    await db.query('insert into auth.users(id,is_anonymous) values ($1,false),($2,false),($3,false),($4,true)', [alice,bob,eve,guest]);
    async function login(id, role = 'authenticated') {
      await db.exec('reset role; set role ' + role);
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({sub:id,role})]);
    }
    const pairs = (await db.query(`insert into private.user_connections(sender_id,recipient_id,status,accepted_at)
      values ($1,$2,'accepted',now()),($1,$3,'pending',null),($2,$3,'accepted',now()) returning id,sender_id,recipient_id`, [alice,bob,eve])).rows;
    const ab = pairs.find(row => row.sender_id === alice && row.recipient_id === bob).id;
    const ae = pairs.find(row => row.sender_id === alice && row.recipient_id === eve).id;
    const be = pairs.find(row => row.sender_id === bob && row.recipient_id === eve).id;
    const start = async (ids, minutes=60) => (await db.query('select public.start_location_share($1,$2) value', [ids,minutes])).rows[0].value;
    const read = async () => (await db.query('select public.read_location_shares() value')).rows[0].value;
    const publish = async (token,lat=18.54,lon=-72.34,time=new Date().toISOString()) => (await db.query('select public.publish_live_location($1,$2,$3,10,$4) value',[token,lat,lon,time])).rows[0].value;
    const stop = token => db.query('select public.stop_location_share($1)',[token ?? null]);
    await login(alice);
    for (const ids of [[],[null],[ae],[be],[randomUUID()]]) await assert.rejects(start(ids), /location_invalid_selection/);
    await assert.rejects(start([ab],-1),/location_invalid_selection/);
    await assert.rejects(start([ab],null),/location_invalid_selection/);
    const first = await start([ab,ab]);
    assert.equal((await read()).outgoing.connections.length,1);
    assert.equal(await publish(first.token),true);
    await assert.rejects(publish(first.token,91),/location_invalid_position/);
    await assert.rejects(publish(first.token,NaN),/location_invalid_position/);
    await assert.rejects(publish(first.token,18,181),/location_invalid_position/);
    await assert.rejects(publish(first.token,18,-72,'2000-01-01'),/location_invalid_position/);
    await assert.rejects(db.query('select * from private.location_shares'), e => e.code==='42501');
    await assert.rejects(db.query('select * from private.location_share_recipients'), e => e.code==='42501');
    await login(bob);
    assert.equal((await read()).incoming.length,1);
    assert.equal((await read()).incoming[0].latitude,18.54);
    assert.ok(!JSON.stringify(await read()).includes(first.token));
    assert.ok(!JSON.stringify(await read()).includes(alice));
    assert.equal(await publish(first.token),false);
    await stop(); // A recipient cannot revoke the owner's share.
    assert.equal((await read()).incoming.length,1);
    await login(eve);
    assert.equal((await read()).incoming.length,0);
    await login(alice);
    // Replacing the grant rotates the token; late updates cannot revive it.
    const second = await start([ab]);
    assert.notEqual(second.token,first.token);
    assert.equal(await publish(first.token),false);
    await stop(first.token);
    assert.ok((await read()).outgoing);
    const latest = new Date().toISOString();
    assert.equal(await publish(second.token,19,-73,latest),true);
    assert.equal(await publish(second.token,18,-72,new Date(Date.parse(latest)-1000).toISOString()),true);
    await login(bob);
    assert.equal((await read()).incoming[0].latitude,19);
    await login(alice);
    await stop();
    assert.equal(await publish(second.token),false);
    await login(bob);
    assert.equal((await read()).incoming.length,0);
    // All recipients are a snapshot of accepted connections, including reverse invitations.
    await db.exec('reset role');
    await db.query("update private.user_connections set status='accepted',accepted_at=now() where id=$1",[ae]);
    await login(alice);
    const all = await start([ab,ae],15);
    await publish(all.token);
    await login(eve);
    assert.equal((await read()).incoming.length,1);
    await db.exec('reset role');
    await db.query("update private.location_shares set captured_at=now()-interval '91 seconds' where owner_id=$1",[alice]);
    await login(bob);
    assert.equal((await read()).incoming.length,0);
    await db.exec('reset role');
    await db.query("update private.location_shares set expires_at=now()-interval '1 second' where owner_id=$1",[alice]);
    await login(alice);
    assert.equal((await read()).outgoing,null);
    assert.equal(await publish(all.token),false);
    const reverse = await start([ab]);
    await publish(reverse.token);
    await db.exec('reset role');
    await db.query('delete from private.user_connections where id=$1',[ab]);
    await login(bob);
    assert.equal((await read()).incoming.length,0);
    for (const id of [guest,null,randomUUID()]) {
      await login(id);
      await assert.rejects(read(),/connection_account_required/);
      await assert.rejects(start([ae]),/connection_account_required/);
      await assert.rejects(publish(reverse.token),/connection_account_required/);
      await assert.rejects(stop(),/connection_account_required/);
    }
    await login(null,'anon');
    await assert.rejects(read(),e=>e.code==='42501');
    await assert.rejects(start([ae]),e=>e.code==='42501');
    await assert.rejects(publish(reverse.token),e=>e.code==='42501');
    await assert.rejects(stop(),e=>e.code==='42501');
  } finally { await db.close(); }
});
