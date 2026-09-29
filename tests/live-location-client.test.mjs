import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
const source = await readFile('src/features/live-location/api.ts','utf8');
function client(response = {data:true,error:null}) {
  const calls = [], exports = {};
  new Function('exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exports,()=>({supabase:{
    rpc(name,args){ calls.push({name,args}); return {then:(...a)=>Promise.resolve(response).then(...a),abortSignal:signal=>{calls.at(-1).signal=signal;return Promise.resolve(response);}};}
  }}));
  return {...exports,calls};
}
const session={token:'token',owner:'owner',expires_at:new Date(Date.now()+60000).toISOString()};
const fix=timestamp=>({timestamp,coords:{latitude:18.54,longitude:-72.34,accuracy:8}});
test('sharing sends only selected connections and a bounded duration',async()=>{
  const api=client({data:session,error:null});
  assert.deepEqual(await api.startLocationShare(['a','a','b'],60,'owner'),session);
  assert.deepEqual(api.calls[0],{name:'start_location_share',args:{p_connections:['a','b'],p_minutes:60}});
  await assert.rejects(api.startLocationShare([],60,'owner'));
  await assert.rejects(api.startLocationShare(['a'],0,'owner'));
  assert.equal(api.calls.length,1);
});
test('old fixes are never relabelled as live and each write carries the session token',async()=>{
  const api=client();
  await api.publishLocation(session,fix(Date.now()-91000));
  await api.publishLocation(session,fix(Date.now()+30000));
  assert.equal(api.calls.length,0);
  const sample=fix(Date.now());
  assert.equal(await api.publishLocation(session,sample),true);
  assert.deepEqual(api.calls[0],{name:'publish_live_location',args:{p_token:'token',p_latitude:18.54,p_longitude:-72.34,p_accuracy:8,p_captured_at:new Date(sample.timestamp).toISOString()}});
  assert.equal(await client({data:false,error:null}).publishLocation(session,sample),false);
});
test('stop errors are surfaced rather than confirming a failed revocation',async()=>{
  const api=client();
  await api.stopLocationShare();
  await api.stopLocationShare('old-token');
  assert.deepEqual(api.calls.map(c=>c.args),[{p_token:null},{p_token:'old-token'}]);
  await assert.rejects(client({data:null,error:{message:'internal'}}).stopLocationShare(),/Arrêt non confirmé/);
  await assert.rejects(client({data:null,error:null}).readLocationShares(),/Impossible de charger/);
});
test('position reads carry cancellation',async()=>{
  const api=client({data:{outgoing:null,incoming:[]},error:null});
  const controller=new AbortController();
  await api.readLocationShares(controller.signal);
  assert.equal(api.calls[0].signal,controller.signal);
});
