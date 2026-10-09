import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
import { safetyDatabase } from './helpers/safety-db.mjs';

const { outputText } = ts.transpileModule(await readFile('src/features/profile/avatar.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const model = {};
new Function('exports', outputText)(model);

test('shared avatars retain all new layers without exposing unrelated or malformed metadata', async () => {
  const db = await safetyDatabase();
  try {
    const owner = randomUUID(), guest = randomUUID();
    await db.query('insert into auth.users (id, is_anonymous) values ($1, false), ($2, true)', [owner, guest]);
    const avatar = { ...model.avatarPresets[3].avatar, glasses: 'catEye', glassesColor: 'berry', earrings: 'drop', headwear: 'wideStraw', headwearColor: 'indigo' };
    const metadata = { avatar: { ...avatar, secret: 'hidden', email: 'private@example.com' }, email: 'private@example.com' };
    await db.query('update auth.users set raw_user_meta_data=$1 where id in ($2,$3)', [metadata, owner, guest]);
    const read = async (id) => (await db.query('select private.profile_avatar($1) as avatar', [id])).rows[0].avatar;
    assert.deepEqual(await read(owner), avatar);
    assert.equal(await read(guest), null);
    for (const malformed of [[], null, 'oops', { clothing: {}, earrings: [], headwear: {}, headwearColor: [], backgroundPattern: 'x'.repeat(80), eyeColor: 'green' }]) {
      await db.query('update auth.users set raw_user_meta_data=$1 where id=$2', [{ avatar: malformed }, owner]);
      assert.deepEqual(await read(owner), malformed?.eyeColor ? { eyeColor: 'green' } : null);
    }
    for (const role of ['anon', 'authenticated']) {
      const result = await db.query("select has_function_privilege($1, 'private.profile_avatar(uuid)', 'execute') as allowed", [role]);
      assert.equal(result.rows[0].allowed, false);
    }
  } finally { await db.close(); }
});
