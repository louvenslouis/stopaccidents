import assert from 'node:assert/strict';
import { test } from 'node:test';
import { safetyDatabase } from './helpers/safety-db.mjs';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const kinds = ['fire', 'gathering', 'breakdown', 'armed_presence', 'kidnapping', 'barricade', 'gunfire'];
test('all seven new collections persist camera/library batches, retry, remove and enforce ownership', async () => {
  const db = await safetyDatabase();
  try {
    await db.exec(`insert into auth.users(id) values ('${owner}'),('${other}'); set role authenticated;
      select set_config('request.jwt.claims','{"sub":"${owner}"}',false)`);
    for (const [index, kind] of kinds.entries()) {
      for (const manual of [false, true]) {
        const id = `33333333-3333-4333-8333-0000000000${index}${manual ? 1 : 0}`;
        if (manual) await db.exec(`select public.prepare_manual_report_event('${kind}','${id}',null,18.55,-72.3,null,now()-interval '15 minutes')`);
        else await db.exec(`select public.prepare_report_event('${kind}','${id}',null,18.55,-72.3,9)`);
        await db.exec(`select public.save_${kind}_report_step('${id}',1,'Delmas',18.55,-72.3,${manual ? 'null' : 9})`);
        const photos = Array.from({ length: 5 }, (_, i) => ({
          storage_path: `${owner}/${kind}/${id}/44444444-4444-4444-8444-${String(i).padStart(12, '0')}.jpg`,
          captured_at: new Date().toISOString(), source: manual ? 'library' : 'camera',
        }));
        for (const photo of photos) await db.query("insert into storage.objects(bucket_id,name) values ('report-photos',$1)", [photo.storage_path]);
        const save = batch => db.query('select public.save_report_photos($1,$2,$3::jsonb)', [kind, id, JSON.stringify(batch)]);
        const read = async () => (await db.query('select public.read_report_photos($1,$2) photos', [kind, id])).rows[0].photos;
        await save(photos.slice(0, 4));
        await save(photos.slice(0, 4));
        assert.equal((await read()).length, 4, `${kind} retries without duplicates`);
        assert.ok((await read()).every(photo => photo.source === (manual ? 'library' : 'camera')));
        await assert.rejects(save(photos), /four photos/);
        await assert.rejects(save([{ ...photos[0], source: 'invalid' }]), /unauthorized/);
        if (!manual) await assert.rejects(save([{ ...photos[0], source: 'library' }]), /unauthorized/);
        assert.equal((await read()).length, 4, 'a failed replacement preserves the saved batch');
        assert.equal((await db.query("delete from storage.objects where name=$1 returning name", [photos[0].storage_path])).rows.length, 0, 'referenced evidence survives cleanup after a lost RPC response');
        await db.exec(`select set_config('request.jwt.claims','{"sub":"${other}"}',false)`);
        await assert.rejects(save([]), /unauthorized/);
        assert.equal((await read()).length, kind === 'kidnapping' ? 0 : 4);
        await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values ('report-photos',$1)", [`${other}/${kind}/${id}/55555555-5555-4555-8555-555555555555.jpg`]), /row-level security/);
        await db.exec(`select set_config('request.jwt.claims','{"sub":"${owner}"}',false)`);
        await save([photos[1], photos[3]]);
        assert.equal((await read()).length, 2);
        assert.equal((await db.query("delete from storage.objects where name=$1 returning name", [photos[0].storage_path])).rows.length, 1);
        await save([]);
        assert.deepEqual(await read(), []);
      }
    }
    await assert.rejects(db.query('select * from private.report_photos'), /permission denied/);
    const result = (await db.query(`select relrowsecurity from pg_class where oid='private.report_photos'::regclass`)).rows[0];
    assert.equal(result.relrowsecurity, true);
  } finally { await db.close(); }
});

test('public photo access obeys moderation and does not expose unfinished uploads', async () => {
  const db = await safetyDatabase();
  const id = '33333333-3333-4333-8333-333333333333';
  const path = `${owner}/fire/${id}/44444444-4444-4444-8444-444444444444.jpg`;
  try {
    await db.exec(`insert into auth.users(id) values ('${owner}'); set role authenticated;
      select set_config('request.jwt.claims','{"sub":"${owner}"}',false);
      select public.save_fire_report_step('${id}',1,'Delmas',18.55,-72.3,9)`);
    await db.query("insert into storage.objects(bucket_id,name) values ('report-photos',$1)", [path]);
    await db.exec(`set role anon; select set_config('request.jwt.claims','{}',false)`);
    assert.equal((await db.query('select name from storage.objects where name=$1', [path])).rows.length, 0);
    await db.exec(`set role authenticated; select set_config('request.jwt.claims','{"sub":"${owner}"}',false)`);
    await db.query('select public.save_report_photos($1,$2,$3::jsonb)', ['fire', id, JSON.stringify([{ storage_path: path, captured_at: new Date().toISOString(), source: 'camera' }])]);
    await db.exec(`set role anon; select set_config('request.jwt.claims','{}',false)`);
    assert.equal((await db.query('select name from storage.objects where name=$1', [path])).rows.length, 1);
    await db.exec(`reset role; insert into private.publication_moderation(kind,report_id,suspended,reason,actor_id)
      values('fire','${id}',true,'Test moderation','${owner}'); set role anon`);
    assert.equal((await db.query('select name from storage.objects where name=$1', [path])).rows.length, 0);
    assert.deepEqual((await db.query('select public.read_report_photos($1,$2) photos', ['fire', id])).rows[0].photos, []);
  } finally { await db.close(); }
});
