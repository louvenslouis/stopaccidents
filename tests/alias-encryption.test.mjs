import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { safetyDatabase } from './helpers/safety-db.mjs';

test('encrypted aliases preserve existing identities, private API, comments, replies and rotation', async () => {
  const owner = randomUUID(), other = randomUUID(), report = randomUUID();
  let original;
  const db = await safetyDatabase({ beforeAliasEncryption: async db => {
    await db.query('insert into auth.users(id) values ($1),($2)', [owner, other]);
    original = (await db.query('select alias from public.user_aliases where user_id=$1', [owner])).rows[0].alias;
  } });
  const login = async id => db.exec(`reset role; set role authenticated; select set_config('request.jwt.claims','{"sub":"${id}"}',false);`);
  try {
    const stored = (await db.query('select * from private.user_alias_data where user_id=$1', [owner])).rows[0];
    assert.match(stored.encrypted_alias, /^enc:1:1:/);
    assert.match(stored.alias_lookup, /^[a-f0-9]{64}$/);
    assert.equal('alias' in stored, false);
    assert.ok(!JSON.stringify(stored).includes(original));
    await login(owner);
    assert.equal((await db.query('select alias from public.user_aliases')).rows[0].alias, original);
    for (const sql of ['select * from private.user_alias_data', 'select * from private.user_aliases',
      "select private.alias_lookup('testalias')", 'select private.reencrypt_user_data_batch(1)']) {
      await assert.rejects(db.query(sql), error => error.code === '42501');
    }
    await db.query("select public.prepare_manual_report_event('fire',$1,null,18.55,-72.3,null,now(),30)", [report]);
    await db.query("select public.save_fire_report_step($1,1,'Delmas',18.55,-72.3,null)", [report]);
    await db.query("select public.save_fire_report_step($1,2,p_fire_target=>'house')", [report]);
    const comment = randomUUID(), reply = randomUUID();
    await db.query("select public.write_report_comment('fire',$1,'create',$2,'Commentaire',null)", [report, comment]);
    await login(other);
    await db.query("select public.write_report_comment('fire',$1,'create',$2,'Réponse',$3)", [report, reply, comment]);
    assert.equal((await db.query('select * from public.user_aliases where user_id=$1', [owner])).rows.length, 0);
    await db.exec("reset role; set role anon; select set_config('request.jwt.claims','',false)");
    const read = async root => (await db.query("select public.read_report_comments('fire',$1,$2) as value", [report, root])).rows[0].value;
    assert.equal((await read(null)).items[0].alias, original);
    assert.equal((await read(comment)).items[0].reply_to, original);
    await assert.rejects(db.query('select * from public.user_aliases'), error => error.code === '42501');
    await login(owner);
    await db.query("update public.user_aliases set alias='aliasprotege',onboarding_step='avatar' where user_id=$1 returning user_id", [owner]);
    await db.exec('reset role');
    const after = (await db.query('select * from private.user_alias_data where user_id=$1', [owner])).rows[0];
    assert.notEqual(after.encrypted_alias, stored.encrypted_alias);
    assert.notEqual(after.alias_lookup, stored.alias_lookup);
    await db.query('select private.rotate_user_data_key()');
    while ((await db.query('select private.reencrypt_user_data_batch(1) as count')).rows[0].count > 0) { /* bounded batches */ }
    const rotated = (await db.query('select * from private.user_alias_data where user_id=$1', [owner])).rows[0];
    assert.match(rotated.encrypted_alias, /^enc:1:2:/);
    assert.equal(rotated.alias_lookup, after.alias_lookup);
    await login(other);
    assert.equal((await db.query("select public.is_user_alias_available('aliasprotege') as available")).rows[0].available, false);
    await assert.rejects(db.query("update public.user_aliases set alias='aliasprotege'"), error => error.code === '23505');
    await db.query("select public.invite_connection('ALIASPROTEGE')");
    await db.exec("reset role; set role anon; select set_config('request.jwt.claims','',false)");
    assert.equal((await read(null)).items[0].alias, 'aliasprotege');
    assert.equal((await read(comment)).items[0].reply_to, 'aliasprotege');
    assert.ok(!JSON.stringify(await read(null)).includes(owner));
  } finally { await db.close(); }
});
