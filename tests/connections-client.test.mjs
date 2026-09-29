import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile('src/features/connections/api.ts', 'utf8');
function client(response = { data: null, error: null }) {
  const calls = [];
  const exports = {};
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  new Function('exports', 'require', outputText)(exports, () => ({ supabase: {
    rpc(name, args) {
      const call = { name, args };
      calls.push(call);
      return { ...Promise.resolve(response),
        then: (...args) => Promise.resolve(response).then(...args),
        abortSignal(signal) { call.signal = signal; return Promise.resolve(response); },
      };
    },
  } }));
  return { ...exports, calls };
}

test('invites normalize a pasted @alias and reject invalid input before sending', async () => {
  const api = client();
  await api.inviteConnection('  @ZwazoLib27  ');
  assert.deepEqual(api.calls, [{ name: 'invite_connection', args: { p_alias: 'ZwazoLib27' } }]);
  for (const invalid of ['', 'bad alias', '@@ZwazoLib27', 'a'.repeat(41)]) {
    await assert.rejects(api.inviteConnection(invalid), /Saisissez un alias valide/);
  }
  assert.equal(api.calls.length, 1);
});

test('server errors stay actionable without leaking raw database errors', async () => {
  await assert.rejects(client({error:{message:'connection_self_invitation'}}).inviteConnection('ZwazoLib'), /vous-même/);
  await assert.rejects(client({error:{message:'connection_already_exists'}}).inviteConnection('ZwazoLib'), /existe déjà/);
  await assert.rejects(client({error:{message:'internal private table detail'}}).respondConnection('id','accept'), /Impossible de modifier/);
});

test('reads carry cancellation and response actions target the exact invitation', async () => {
  const snapshot = {alias:'PhareClair',connections:[]};
  const api = client({data:snapshot,error:null});
  const controller = new AbortController();
  assert.deepEqual(await api.readConnections(controller.signal), snapshot);
  assert.equal(api.calls[0].signal, controller.signal);
  await api.respondConnection('invitation-id','decline');
  assert.deepEqual(api.calls[1], {name:'respond_connection',args:{p_id:'invitation-id',p_action:'decline'}});
  await assert.rejects(client({data:null,error:null}).readConnections(), /Impossible de charger/);
});
