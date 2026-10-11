import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createCryptoDatabase } from './helpers/crypto-db.mjs';

test('only registered contributors earn points, including all seven completion RPCs and legacy guest rewards', async () => {
  const db = await createCryptoDatabase();
  try {
    await db.exec(`
      create role service_role nologin bypassrls;
      create role anon nologin; create role authenticated nologin;
      create schema auth; create schema storage;
      create table auth.users(id uuid primary key, is_anonymous boolean not null default false, email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
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
    const files = (await readdir(migrations)).filter(name => name.endsWith('.sql')).sort();
    const migration = files.find(name => name.endsWith('_registered_contributor_rewards.sql'));
    const guest = randomUUID(), member = randomUUID(), legacy = randomUUID();
    for (const name of files) {
      if (name === migration) {
        await db.query('insert into auth.users(id,is_anonymous) values ($1,true),($2,false)', [guest, member]);
        await db.query("insert into public.report_rewards(report_kind,report_id,user_id) values ('barricade',$1,$2)", [legacy, guest]);
      }
      await db.exec(await readFile(new URL(name, migrations), 'utf8'));
    }
    assert.equal((await db.query('select eligible from public.report_rewards where report_id=$1', [legacy])).rows[0].eligible, false);

    const steps = {
      accident: ["p_accident_type => 'two_cars'", "p_severity => 'material'", "p_notes => 'Observation'"],
      kidnapping: ["p_vehicle_clues => 'SUV noir', p_direction_taken => 'Vers le nord'", "p_abducted_person_clues => 'Chemise bleue'"],
      barricade: ["p_obstacles => 'Pierres', p_passage => 'Bloqué'", "p_details => 'Observation'"],
      armed_presence: ["p_presence => 'Trois hommes armés', p_activity => 'Au carrefour'", "p_details => 'Observation'"],
      suspicious_vehicle: ["p_vehicle_description => 'Berline bleue', p_observed_behavior => 'Passages répétés'", "p_details => 'Observation'"],
      gunfire: ["p_shot_count => 'two_to_five', p_proximity => 'near', p_cadence => 'bursts'", "p_details => 'Observation'"],
      breakdown: ["p_breakdown_position => 'roadway'", "p_vehicle_type => 'truck'", "p_traffic_impact => 'major_slowdown', p_details => 'Voie bloquée'"],
    };
    async function login(user, anonymousClaim = false) {
      await db.exec('reset role; set role authenticated');
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: user, is_anonymous: anonymousClaim })]);
    }
    async function complete(kind, latitude = 18.55) {
      const id = randomUUID();
      await db.query(`select public.save_${kind}_report_step($1,1,'Delmas',$2,-72.3,9)`, [id, latitude]);
      for (const [i, args] of steps[kind].entries()) {
        await db.query(`select public.save_${kind}_report_step($1,$2,${args})`, [id, i + 2]);
      }
      return id;
    }
    const summary = async (id = null, kind = null) =>
      (await db.query('select public.read_my_rewards($1,$2) as value', [id, kind])).rows[0].value;
    const board = async () => (await db.query('select public.read_leaderboard() as value')).rows[0].value;
    const zero = { total: 0, count: 0, earned: 0 };
    const guestReports = [];
    // A forged/stale non-anonymous JWT cannot override the real Auth record.
    await login(guest, false);
    for (const kind of Object.keys(steps)) {
      const id = await complete(kind);
      guestReports.push({ kind, id });
      assert.deepEqual(await summary(id, kind), zero, kind);
      assert.equal((await db.query(`select completed_step from public.${kind}_reports where id=$1`, [id])).rows[0].completed_step, steps[kind].length + 1);
    }
    assert.equal((await db.query('select count(*)::int as n from public.report_rewards')).rows[0].n, 0, 'Guest ledger is hidden by RLS');
    assert.equal((await board()).total, 0);
    assert.equal((await board()).me, null);
    await assert.rejects(db.query('update public.report_rewards set eligible=true'), e => e.code === '42501');
    await assert.rejects(db.query("insert into public.report_rewards(report_kind,report_id,user_id) values ('barricade',$1,$2)", [randomUUID(), guest]), e => e.code === '42501');

    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int as n from private.report_contributions where reporter_id=$1 and published', [guest])).rows[0].n, 7, 'Guest reports remain public');
    assert.equal((await db.query('select count(*)::int as n from public.report_rewards where user_id=$1', [guest])).rows[0].n, 1, 'Only the ineligible legacy row remains');
    await login(member);
    for (const kind of Object.keys(steps)) {
      const id = await complete(kind);
      assert.equal((await summary(id, kind)).earned, 25, kind);
      await db.query(`select public.save_${kind}_report_step($1,$2,${steps[kind].at(-1)})`, [id, steps[kind].length + 1]);
      assert.equal((await summary(id, kind)).earned, 25, 'Retries do not change awards');
    }
    assert.deepEqual(await summary(), { total: 175, count: 7, earned: 0 });
    assert.equal((await board()).total, 1);
    assert.equal((await board()).me.points, 175);
    await db.exec('reset role');
    await db.query('update auth.users set is_anonymous=false where id=$1', [guest]);
    await login(guest, true); // The server can recognize conversion despite a stale JWT.
    assert.deepEqual(await summary(), zero, 'Conversion does not restore legacy guest points');
    for (const { kind, id } of guestReports) {
      await db.query(`select public.save_${kind}_report_step($1,$2,${steps[kind].at(-1)})`, [id, steps[kind].length + 1]);
    }
    assert.deepEqual(await summary(), zero, 'Retrying already completed guest reports is not a new award');
    const id = await complete('barricade', 19.2);
    assert.deepEqual(await summary(id, 'barricade'), { total: 25, count: 1, earned: 25 });
    assert.equal((await board()).me.points, 25);
    await db.exec('reset role; set role anon');
    await db.query("select set_config('request.jwt.claims','{}',false)");
    assert.equal((await board()).total, 2, 'Visitors can still read the ranking');
    assert.equal((await board()).me, null);
  } finally { await db.close(); }
});
