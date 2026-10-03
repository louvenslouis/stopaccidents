import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safetyDatabase } from './helpers/safety-db.mjs';

test('follow-up testimony inherits location, preserves source and enforces ownership; flags are private and idempotent', async () => {
  const db = await safetyDatabase();
  const owner = '11111111-1111-4111-8111-111111111111';
  const witness = '22222222-2222-4222-8222-222222222222';
  const source = '33333333-3333-4333-8333-333333333333';
  const followup = '44444444-4444-4444-8444-444444444444';
  try {
    await db.exec(`insert into auth.users(id) values ('${owner}'),('${witness}');
      set role authenticated; select set_config('request.jwt.claims','{"sub":"${owner}"}',false);
      select public.prepare_manual_report_event('fire','${source}',null,18.55,-72.3,null,now(),30);
      select public.save_fire_report_step('${source}',1,'Delmas',18.55,-72.3,null);
      select public.save_fire_report_step('${source}',2,p_fire_target=>'house');
      select set_config('request.jwt.claims','{"sub":"${witness}"}',false);
      select public.prepare_report_testimony('fire','${followup}','${source}');
      select public.prepare_report_testimony('fire','${followup}','${source}');`);
    await assert.rejects(db.exec(`select public.save_fire_report_step('${followup}',1,'Elsewhere',19,-72.3,null)`));
    await db.exec(`select public.save_fire_report_step('${followup}',1,'Delmas',18.55,-72.3,null);
      select public.save_fire_report_step('${followup}',2,p_fire_target=>'house');
      select public.save_fire_report_step('${followup}',3,p_fire_state=>'extinguished');
      select public.flag_publication('fire','${source}','Information incorrecte');
      select public.flag_publication('fire','${source}','Information à vérifier');`);
    const event = (await db.query(`select public.read_report_event('fire','${source}') as event`)).rows[0].event;
    assert.equal(event.summary.testimony_count, 2);
    const original = (await db.query(`select public.read_fire_report('${source}') as report`)).rows[0].report;
    assert.equal(original.completed_step, 2);
    const update = (await db.query(`select public.read_fire_report('${followup}') as report`)).rows[0].report;
    assert.equal(update.latitude,18.55); assert.equal(update.location_accuracy_m,null);
    assert.equal(update.location_source,'manual'); assert.equal(update.fire_state,'extinguished');
    await assert.rejects(db.exec('select * from private.publication_flags'));
    await db.exec(`select set_config('request.jwt.claims','{"sub":"${owner}"}',false)`);
    await assert.rejects(db.exec(`select public.prepare_report_testimony('fire','${followup}','${source}')`));
    await assert.rejects(db.exec(`select public.prepare_report_testimony('fire','${source}','${source}')`));
    await assert.rejects(db.exec(`select public.flag_publication('fire','${source}',' ')`));
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::int as n from private.publication_flags')).rows[0].n,1);
    await db.exec(`insert into private.publication_moderation(kind,report_id,suspended,reason,actor_id) values('fire','${source}',true,'Test suspension','${owner}');
      set role authenticated;`);
    await assert.rejects(db.exec(`select public.prepare_report_testimony('fire','55555555-5555-4555-8555-555555555555','${source}')`));
    await db.exec('set role anon');
    await assert.rejects(db.exec(`select public.flag_publication('fire','${source}','Test')`));
  } finally { await db.close(); }
});
