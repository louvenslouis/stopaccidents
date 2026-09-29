import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safetyDatabase } from './helpers/safety-db.mjs';

test('fire reports persist stages, protect ownership, support manual context and respect moderation', async () => {
  const db = await safetyDatabase();
  const owner = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const id = '33333333-3333-4333-8333-333333333333';
  const manual = '44444444-4444-4444-8444-444444444444';
  try {
    await db.exec(`insert into auth.users(id) values ('${owner}'), ('${other}');
      set role authenticated;
      select set_config('request.jwt.claims','{"sub":"${owner}"}',false);
      select public.prepare_report_event('fire','${id}',null,18.55,-72.3,9);
      select public.save_fire_report_step('${id}',1,'Delmas',18.55,-72.3,9);`);
    await assert.rejects(db.exec(`select public.save_fire_report_step('${id}',3,p_fire_state=>'active')`));
    await assert.rejects(db.exec(`select public.save_fire_report_step('${id}',2,p_fire_target=>'invalid')`));
    await db.exec(`select public.save_fire_report_step('${id}',2,p_fire_target=>'house');
      select public.save_fire_report_step('${id}',3,p_fire_state=>'active');
      select public.save_fire_report_step('${id}',4,p_people_danger=>'unknown',p_details=>'Fumée');
      select public.save_fire_report_step('${id}',4,p_people_danger=>'unknown',p_details=>'Fumée');`);
    const result = (await db.query(`select public.read_fire_report('${id}') as report`)).rows[0].report;
    assert.equal(result.fire_target, 'house');
    assert.equal(result.fire_state, 'active');
    assert.equal(result.people_danger, 'unknown');
    assert.equal(result.completed_step, 4);
    assert.equal(result.reporter_id, undefined);
    assert.equal((await db.query(`select count(*)::int as n from public.fire_reports`)).rows[0].n, 1);
    const feed = (await db.query('select public.read_map_reports() as feed')).rows[0].feed;
    assert.ok(feed.reports.some(r => r.report_kind === 'fire' && r.id === id));
    await db.exec(`select set_config('request.jwt.claims','{"sub":"${other}"}',false)`);
    await assert.rejects(db.exec(`select public.save_fire_report_step('${id}',2,p_fire_target=>'commerce')`));
    assert.equal((await db.query(`select count(*)::int as n from public.fire_reports`)).rows[0].n, 0);
    await db.exec(`select public.prepare_manual_report_event('fire','${manual}',null,18.6,-72.4,null,now(),30);
      select public.save_fire_report_step('${manual}',1,'Pétion-Ville',18.6,-72.4,null);`);
    const context = (await db.query(`select public.read_fire_report('${manual}') as report`)).rows[0].report;
    assert.equal(context.location_source, 'manual');
    assert.ok(context.occurred_at);
    await db.exec(`reset role;
      insert into private.publication_moderation(kind,report_id,suspended,reason,actor_id)
      values('fire','${id}',true,'Test suspension','${owner}');
      set role anon;`);
    assert.equal((await db.query(`select public.read_fire_report('${id}') as report`)).rows[0].report, null);
    await assert.rejects(db.exec(`select * from public.fire_reports`));
    await assert.rejects(db.exec(`select public.save_fire_report_step('${manual}',2,p_fire_target=>'car')`));
  } finally { await db.close(); }
});
