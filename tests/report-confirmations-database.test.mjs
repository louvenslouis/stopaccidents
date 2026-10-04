import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safetyDatabase } from './helpers/safety-db.mjs';

const owner = '11111111-1111-4111-8111-111111111111';
const witness = '22222222-2222-4222-8222-222222222222';
const other = '33333333-3333-4333-8333-333333333333';
const source = '44444444-4444-4444-8444-444444444444';
const second = '55555555-5555-4555-8555-555555555555';
const draft = '66666666-6666-4666-8666-666666666666';
const login = user => `set role authenticated; select set_config('request.jwt.claims','{"sub":"${user}"}',false);`;
const read = (db, id = source) => db.query(`select public.read_report_confirmation('fire','${id}') as state`).then(r => r.rows[0].state);
const set = (db, value, id = source) => db.query(`select public.set_report_confirmation('fire','${id}',${value}) as state`).then(r => r.rows[0].state);

test('confirmations persist, are unique per account, reversible, private and do not boost event freshness', async () => {
  const db = await safetyDatabase();
  try {
    await db.exec(`insert into auth.users(id) values ('${owner}'),('${witness}'),('${other}'); ${login(owner)}
      select public.prepare_manual_report_event('fire','${source}',null,18.55,-72.3,null,now(),30);
      select public.save_fire_report_step('${source}',1,'Delmas',18.55,-72.3,null);
      select public.save_fire_report_step('${source}',2,p_fire_target=>'house');
      select public.prepare_manual_report_event('fire','${draft}',null,19,-72,null,now(),0);`);
    const initial = (await db.query(`select public.read_report_event('fire','${source}') as event`)).rows[0].event.summary;
    assert.equal((await read(db)).can_confirm, false, 'authors cannot endorse their own event');
    await assert.rejects(set(db,true));
    await db.exec(login(witness));
    assert.deepEqual(await set(db,true), { event_id: initial.event_id, count: 1, confirmed: true, can_confirm: true });
    assert.equal((await set(db,true)).count,1, 'idempotent retries');
    assert.equal((await read(db)).confirmed,true, 'persists on reread');
    await db.exec(login(other));
    assert.equal((await read(db)).confirmed,false, 'personal state is per account');
    assert.equal((await set(db,true)).count,2);
    await db.exec(login(witness));
    assert.equal((await set(db,false)).count,1, 'removal preserves other users');
    assert.equal((await set(db,false)).count,1);
    const after = (await db.query(`select public.read_report_event('fire','${source}') as event`)).rows[0].event.summary;
    assert.deepEqual(after,initial, 'endorsements do not create testimony, change urgency or freshness');
    await db.exec(`${login(owner)}
      select public.prepare_report_testimony('fire','${second}','${source}');
      select public.save_fire_report_step('${second}',1,'Delmas',18.55,-72.3,null);
      select public.save_fire_report_step('${second}',2,p_fire_target=>'house');
      ${login(other)}`);
    assert.equal((await read(db,second)).count,1, 'new testimony keeps the event counter');
    assert.equal((await read(db,second)).confirmed,true);
    assert.equal((await set(db,true,second)).count,1, 'cannot endorse twice via another testimony');
    await db.exec(login(witness));
    await assert.rejects(db.exec('select * from private.report_confirmations'));
    await assert.rejects(db.exec(`insert into private.report_confirmations(event_id,user_id) values('${initial.event_id}','${owner}')`));
    await assert.rejects(set(db,'null'));
    await assert.rejects(set(db,true,draft));
    await assert.rejects(db.exec(`select public.set_report_confirmation('gathering','${source}',true)`));
    await db.exec(`select set_config('request.jwt.claims','',false); set role anon;`);
    assert.equal((await read(db)).count,1);
    assert.equal((await read(db)).confirmed,false);
    await assert.rejects(set(db,true));
    await db.exec(`set role authenticated;`);
    await assert.rejects(set(db,true), 'missing uid rejected even with authenticated role');
    await db.exec(`reset role; update private.report_contributions set status='closed' where report_id='${source}'; ${login(other)}`);
    assert.equal((await read(db)).can_confirm,false);
    await assert.rejects(set(db,true));
    assert.equal((await set(db,false)).count,0, 'can withdraw after closure');
    await db.exec(`reset role; insert into private.publication_moderation(kind,report_id,suspended,reason,actor_id) values('fire','${source}',true,'Test suspension','${owner}'); ${login(witness)}`);
    assert.equal(await read(db),null);
    await assert.rejects(set(db,true));
    await db.exec('reset role');
    assert.equal((await db.query(`select relrowsecurity from pg_class where oid='private.report_confirmations'::regclass`)).rows[0].relrowsecurity,true);
    const functions = (await db.query(`select n.nspname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('read_report_confirmation','set_report_confirmation')`)).rows;
    assert.equal(functions.length,4);
    for (const fn of functions) {
      assert.equal(fn.prosecdef,fn.nspname==='private');
      assert.ok(fn.proconfig.some(setting => /^search_path=/.test(setting)));
    }
  } finally { await db.close(); }
});

test('merged events count each account once and withdrawal clears all branches', async () => {
  const db = await safetyDatabase();
  try {
    await db.exec(`insert into auth.users(id) values ('${owner}'),('${witness}'),('${other}'); ${login(owner)}`);
    for (const id of [source,second]) await db.exec(`
      select public.prepare_manual_report_event('fire','${id}',null,18.55,-72.3,null,now(),30);
      select public.save_fire_report_step('${id}',1,'Delmas',18.55,-72.3,null);
      select public.save_fire_report_step('${id}',2,p_fire_target=>'house');`);
    await db.exec(login(witness));
    const firstEvent = (await set(db,true)).event_id;
    const secondEvent = (await set(db,true,second)).event_id;
    assert.notEqual(firstEvent,secondEvent);
    await db.exec(login(other));
    await set(db,true,second);
    await db.exec(`reset role; update private.report_events set merged_into='${firstEvent}' where id='${secondEvent}'; ${login(witness)}`);
    assert.equal((await read(db)).count,2, 'duplicate account across merges counted once');
    assert.equal((await read(db,second)).count,2, 'either report resolves same aggregate');
    assert.equal((await set(db,true,second)).count,2);
    assert.equal((await set(db,false)).count,1);
    assert.equal((await read(db,second)).confirmed,false);
    await db.exec(`reset role; update private.report_events set merged_into=null where id='${secondEvent}'; ${login(witness)}`);
    assert.equal((await read(db)).count,0);
    assert.equal((await read(db,second)).count,1, 'other voter remains on original branch after unmerge');
  } finally { await db.close(); }
});
