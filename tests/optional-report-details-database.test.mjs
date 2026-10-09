import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safetyDatabase } from './helpers/safety-db.mjs';

test('all report kinds accept skipped stages and independently omitted answers without weakening ownership', async () => {
  const db = await safetyDatabase();
  const owner = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`insert into auth.users(id) values ('${owner}'), ('${other}');
      set role authenticated;
      select set_config('request.jwt.claims','{"sub":"${owner}"}',false);`);
    const kinds = ['accident', 'fire', 'breakdown', 'gathering', 'gunfire', 'barricade', 'kidnapping', 'armed_presence', 'suspicious_vehicle'];
    for (const [index, kind] of kinds.entries()) {
      const id = `33333333-3333-4333-8333-${String(index).padStart(12, '0')}`;
      const last = index < 4 ? 4 : 3;
      await db.exec(`select public.prepare_report_event('${kind}','${id}',null,18.55,-72.3,9);
        select public.save_${kind}_report_step('${id}',1,'Delmas',18.55,-72.3,9);
        select public.save_${kind}_report_step('${id}',${last});`);
      const row = (await db.query(`select * from public.${kind}_reports where id='${id}'`)).rows[0];
      assert.equal(row.completed_step, last, kind);
      await db.exec(`select public.save_${kind}_report_step('${id}',1,'Delmas corrigé',18.56,-72.31,8)`);
      assert.equal((await db.query(`select location_description from public.${kind}_reports where id='${id}'`)).rows[0].location_description, 'Delmas corrigé');
      // Previously skipped stages can still be visited with no invented values.
      for (let step = 2; step <= last; step++) await db.exec(`select public.save_${kind}_report_step('${id}',${step});`);
      await db.exec(`select set_config('request.jwt.claims','{"sub":"${other}"}',false)`);
      await assert.rejects(db.exec(`select public.save_${kind}_report_step('${id}',${last})`), kind);
      await db.exec(`select set_config('request.jwt.claims','{"sub":"${owner}"}',false)`);
    }
    const fire = '33333333-3333-4333-8333-000000000001';
    await db.exec(`select public.save_fire_report_step('${fire}',3,p_fire_state=>'active')`);
    assert.equal((await db.query(`select fire_target,fire_state,people_danger from public.fire_reports where id='${fire}'`)).rows[0].fire_target, '');
    await assert.rejects(db.exec(`select public.save_fire_report_step('${fire}',3,p_fire_state=>'invented')`));
    await assert.rejects(db.exec(`select public.save_fire_report_step('${fire}',4,p_details=>repeat('x',2001))`));
  } finally { await db.close(); }
});
