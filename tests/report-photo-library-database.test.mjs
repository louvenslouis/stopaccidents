import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safetyDatabase } from './helpers/safety-db.mjs';

test('camera and imported photos round-trip in batches, with context and ownership enforced', async () => {
  const db = await safetyDatabase();
  const owner = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`insert into auth.users(id) values ('${owner}'),('${other}'); set role authenticated;
      select set_config('request.jwt.claims','{"sub":"${owner}"}',false)`);
    for (const [index, kind] of ['accident', 'suspicious_vehicle'].entries()) {
      for (const manual of [false, true]) {
        const id = `33333333-3333-4333-8333-0000000000${index}${manual ? 1 : 0}`;
        if (manual) await db.exec(`select public.prepare_manual_report_event('${kind}','${id}',null,18.55,-72.3,null,now()-interval '15 minutes')`);
        else await db.exec(`select public.prepare_report_event('${kind}','${id}',null,18.55,-72.3,9)`);
        await db.exec(`select public.save_${kind}_report_step('${id}',1,'Delmas',18.55,-72.3,${manual ? 'null' : 9})`);
        const bucket = kind === 'accident' ? 'accident-photos' : 'suspicious-vehicle-photos';
        const table = kind === 'accident' ? 'accident_report_photos' : 'suspicious_vehicle_report_photos';
        const photos = Array.from({ length: 5 }, (_, i) => ({ storage_path: `${owner}/${id}/44444444-4444-4444-8444-${String(i).padStart(12, '0')}.jpg`, captured_at: new Date().toISOString(), source: i === 0 ? 'camera' : 'library' }));
        for (const photo of photos) await db.query('insert into storage.objects(bucket_id,name) values ($1,$2)', [bucket, photo.storage_path]);
        const sql = kind === 'accident' ? `select public.save_accident_report_step('${id}',4,p_photos=>$1::jsonb)` : `select public.complete_suspicious_vehicle_report('${id}',p_photos=>$1::jsonb)`;
        if (!manual) {
          await assert.rejects(db.query(sql, [JSON.stringify(photos.slice(0, 2))]), /row-level security/);
          await db.query(sql, [JSON.stringify([photos[0]])]);
        } else {
          await db.query(sql, [JSON.stringify(photos.slice(0, 4))]);
          assert.equal((await db.query(`select count(*)::int n from public.${table} where report_id='${id}'`)).rows[0].n, 4);
          await assert.rejects(db.query(sql, [JSON.stringify(photos)]));
          await db.query(sql, [JSON.stringify([photos[1], photos[3]])]);
          const rows = (await db.query(`select source from public.${table} where report_id='${id}'`)).rows;
          assert.deepEqual(rows.map(row => row.source), ['library', 'library']);
        }
        await db.exec(`select set_config('request.jwt.claims','{"sub":"${other}"}',false)`);
        await assert.rejects(db.query(sql, ['[]']));
        await db.exec(`select set_config('request.jwt.claims','{"sub":"${owner}"}',false)`);
      }
    }
  } finally { await db.close(); }
});
