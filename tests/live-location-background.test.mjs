import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
const source=await readFile('src/features/live-location/background.ts','utf8');
function fixture({expired=false,owner='alice',publish=true,available=true,replacement=false}={}) {
  let task, stored={token:'session',owner:'alice',expires_at:new Date(Date.now()+(expired?-1000:60000)).toISOString()};
  const calls={stopped:0,sent:[],started:0}, exports={};
  const modules={
    'expo-location':{Accuracy:{High:4},hasStartedLocationUpdatesAsync:async()=>true,stopLocationUpdatesAsync:async()=>{calls.stopped++},requestBackgroundPermissionsAsync:async()=>({granted:true}),startLocationUpdatesAsync:async()=>{calls.started++}},
    'expo-task-manager':{defineTask:(_name,handler)=>{task=handler},isAvailableAsync:async()=>available},
    'expo-secure-store':{getItemAsync:async()=>stored?JSON.stringify(stored):null,setItemAsync:async(_key,value)=>{stored=JSON.parse(value)},deleteItemAsync:async()=>{stored=null}},
    '@/lib/supabase':{supabase:{auth:{getSession:async()=>({data:{session:owner?{user:{id:owner}}:null}})}}},
    './api':{publishLocation:async(session,fix)=>{calls.sent.push({session,fix});if(replacement)stored={...stored,token:'new-session'};return publish}},
  };
  new Function('exports','require',ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText)(exports,name=>modules[name]);
  return {...exports,calls,run:task,stored:()=>stored};
}
test('background delivery stops for an expired session or a changed account',async()=>{
  for(const options of [{expired:true},{owner:'bob'},{owner:null}]){
    const f=fixture(options);
    await f.run({data:{locations:[{timestamp:Date.now()}]}});
    assert.equal(f.calls.stopped,1);
    assert.equal(f.calls.sent.length,0);
    assert.equal(f.stored(),null);
  }
});
test('background delivery chooses the newest sample and clears a remotely revoked session',async()=>{
  const f=fixture({publish:false});
  await f.run({data:{locations:[{timestamp:20},{timestamp:30},{timestamp:10}]}});
  assert.equal(f.calls.sent[0].fix.timestamp,30);
  assert.equal(f.calls.stopped,1);
  assert.equal(f.stored(),null);
});
test('unavailable background tracking falls back without registering a task',async()=>{
  const f=fixture({available:false});
  assert.equal(await f.startBackground('actif'),false);
  assert.equal(f.calls.started,0);
});

test('a late callback cannot clear a replacement sharing session',async()=>{
  const f=fixture({publish:false,replacement:true});
  await f.run({data:{locations:[{timestamp:Date.now()}]}});
  assert.equal(f.calls.stopped,0);
  assert.equal(f.stored().token,'new-session');
});
