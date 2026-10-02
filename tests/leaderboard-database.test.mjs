import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';

test('leaderboard: periods, commune, merges, ordering, top 100, personal rank and privacy', async () => {
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

    const owner = randomUUID(), other = randomUUID(), empty = randomUUID();
    for (const id of [owner, other, empty]) await db.query('insert into auth.users(id) values ($1)', [id]);
    const codes = (await db.query('select code from private.report_communes order by code limit 2')).rows.map(r => r.code);
    const bounds = (await db.query(`select
      date_trunc('week', now() at time zone 'America/Port-au-Prince') at time zone 'America/Port-au-Prince' as week,
      date_trunc('month', now() at time zone 'America/Port-au-Prince') at time zone 'America/Port-au-Prince' as month,
      now() as today`)).rows[0];
    async function reward(user, when, commune, event = randomUUID()) {
      const id = randomUUID();
      await db.query("insert into private.report_events(id, kind) values ($1, 'barricade') on conflict do nothing", [event]);
      await db.query(`insert into private.report_contributions(kind, report_id, event_id, reporter_id, published)
        values ('barricade', $1, $2, $3, true)`, [id, event, user]);
      await db.query('update private.report_contributions set commune_code=$1 where report_id=$2', [commune, id]);
      await db.query(`insert into public.report_rewards(report_kind, report_id, user_id, created_at)
        values ('barricade',$1,$2,$3)`, [id, user, when]);
      return event;
    }
    const dates = [new Date(Math.min(+new Date(bounds.week), +new Date(bounds.month)) - 1),
      new Date(bounds.month), new Date(bounds.week), new Date(bounds.today)];
    for (const date of dates) await reward(owner, date, codes[0]);
    await reward(other, dates[0], codes[1]);
    const root = await reward(other, dates[3], codes[1]);
    await reward(other, dates[3], codes[0], root); // same event, counted only once
    const read = async (period = 'all', commune = null, offset = 0) =>
      (await db.query('select public.read_leaderboard($1,$2,$3) as board', [period, commune, offset])).rows[0].board;
    await db.exec('set role anon');
    const all = await read();
    assert.equal(all.total, 2);
    assert.deepEqual(all.entries.map(e => e.points), [100,50]);
    assert.deepEqual(all.entries.map(e => e.rank), [1,2]);
    assert.equal(all.me, null);
    for (const entry of all.entries) assert.deepEqual(Object.keys(entry).sort(), ['alias','is_me','points','rank']);
    assert.ok(!JSON.stringify(all).includes(owner));
    await assert.rejects(db.query('select * from public.report_rewards'), e => e.code === '42501');
    await assert.rejects(db.query('select * from public.user_aliases'), e => e.code === '42501');
    for (const period of ['week', 'month']) {
      const expected = dates.filter(date => +date >= +new Date(bounds[period])).length * 25;
      assert.equal((await read(period)).entries[0].points, expected);
    }
    assert.equal((await read('all', codes[0])).entries[0].points, 100);
    assert.equal((await read('all', codes[1])).entries.length, 1);
    for (const args of [['invalid',null,0], ['all','invalid',0], ['all',null,-1]])
      await assert.rejects(read(...args), e => e.code === '22023');
    await db.exec(`reset role; set role authenticated;
      select set_config('request.jwt.claims','{"sub":"${owner}"}',false)`);
    assert.equal((await read()).me.rank, 1);
    const balance = (await db.query('select public.read_my_rewards() as summary')).rows[0].summary;
    assert.equal((await read()).me.points, balance.total);
    await db.exec('reset role');
    // Merge/undo must match the rewards balance, even across different periods.
    const additional = await reward(owner, dates[3], codes[0]);
    const original = (await db.query('select event_id from private.report_contributions where reporter_id=$1 and event_id<>$2 order by report_id limit 1', [owner, additional])).rows[0].event_id;
    if (additional !== original) {
      await db.query('update private.report_events set merged_into=$1 where id=$2', [original, additional]);
      assert.equal((await read()).me.points, 100);
      await db.query('update private.report_events set merged_into=null where id=$1', [additional]);
      assert.equal((await read()).me.points, 125);
    }
    // More than 100 contributors: one response contains the complete top 100.
    // Give them the same timestamp to exercise the stable alias tie-break too.
    for (let i=0; i<118; i++) {
      const id=randomUUID(); await db.query('insert into auth.users(id) values ($1)',[id]);
      await reward(id, dates[3], codes[0]);
    }
    const board=await read();
    assert.equal(board.total,120);
    assert.equal(board.entries.length,100);
    assert.deepEqual(board.entries.map(e=>e.rank),Array.from({length:100},(_,i)=>i+1));
    assert.equal(new Set(board.entries.map(e=>e.alias)).size,100);
    const tieAliases=board.entries.filter(e=>e.points===25).map(e=>e.alias);
    assert.deepEqual(tieAliases,[...tieAliases].sort());
    assert.equal((await read('all',null,100)).entries.length,0);
    assert.equal((await read('all',null,999)).entries.length,0);
    const lastUser=(await db.query(`select a.user_id, a.alias from public.user_aliases a
      where a.user_id not in ($1,$2,$3) order by a.alias collate "C" desc limit 1`,[owner,other,empty])).rows[0];
    await db.query("update public.user_aliases set alias='zzzlastcontributor' where user_id=$1",[lastUser.user_id]);
    lastUser.alias='zzzlastcontributor';
    await db.exec(`set role authenticated; select set_config('request.jwt.claims','{"sub":"${lastUser.user_id}"}',false)`);
    for (const period of ['all','week','month']) {
      const personal=await read(period);
      assert.equal(personal.me.rank,120, 'Personal rank survives the top 100 limit');
      assert.equal(personal.me.alias,lastUser.alias);
      assert.equal(personal.me.points,25);
      assert.equal(personal.me.is_me,true);
      assert.equal(personal.entries.length,100);
      assert.ok(!personal.entries.some(e=>e.alias===lastUser.alias));
      const communal=await read(period,codes[0]);
      assert.ok(communal.me.rank>100, 'Personal rank also survives the commune top 100 limit');
      assert.equal(communal.me.points,25);
    }
    await db.exec(`select set_config('request.jwt.claims','{"sub":"${empty}"}',false)`);
    const unranked=(await read()).me;
    assert.equal(unranked.rank,null);
    assert.equal(unranked.points,0);
    assert.equal(unranked.is_me,true);
    assert.ok(unranked.alias);
    await db.exec(`select set_config('request.jwt.claims','{"sub":"${lastUser.user_id}"}',false)`);
    const noLocalPoints=(await read('all',codes[1])).me;
    assert.equal(noLocalPoints.alias,lastUser.alias);
    assert.equal(noLocalPoints.rank,null);
    assert.equal(noLocalPoints.points,0);
  } finally { await db.close(); }
});
