import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { safetyDatabase } from './helpers/safety-db.mjs';

const route = { name: 'Maison privée', waypoints: [{ label: 'Domicile privé', latitude:18.55,longitude:-72.31 },{label:'Travail privé',latitude:18.56,longitude:-72.30}], coordinates:[[-72.31,18.55],[-72.30,18.56]], distance_meters:2000,duration_seconds:600,departure_time:'08:00',weekdays:[1,2,3,4,5],timezone:'America/Port-au-Prince',duration_minutes:60,lead_minutes:30,alerts_enabled:true };
const places = {home_address:'Maison confidentielle',work_address:'Bureau confidentiel',home_latitude:18.55,home_longitude:-72.31,work_latitude:18.56,work_longitude:-72.30};
const claims = async (db,id) => db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:id})]);
const rpc = async (db,name,args=[]) => (await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) value`,args)).rows[0].value;

test('migration seals existing private data, preserves owner reads and keeps keys off client roles', async () => {
  const owner=randomUUID(),other=randomUUID(),record=randomUUID(),report=randomUUID();
  const db=await safetyDatabase({beforeEncryption:async db => {
    await db.query('insert into auth.users(id) values($1),($2)',[owner,other]);
    await claims(db,owner);
    await rpc(db,'save_safety_record',[record,'registration','AB-45678','car','Bleu privé',null]);
    await db.query('insert into public.user_saved_places(user_id,home_address,work_address,home_latitude,home_longitude,work_latitude,work_longitude) values($1,$2,$3,$4,$5,$6,$7)',[owner,...Object.values(places)]);
    await db.query(`insert into public.user_routes(user_id,name,waypoints,coordinates,distance_meters,duration_seconds,departure_time,weekdays,timezone,duration_minutes,lead_minutes,alerts_enabled)
      select $1,name,waypoints,coordinates,distance_meters,duration_seconds,departure_time,weekdays,timezone,duration_minutes,lead_minutes,alerts_enabled from jsonb_populate_record(null::public.user_routes,$2)`,[owner,JSON.stringify(route)]);
    await rpc(db,'save_accident_report_step',[report,1,'Lieu public',18.55,-72.31,10]);
    await db.query("insert into public.accident_report_identifiers(report_id,kind,value) values($1,'registration','AB45678')",[report]);
    await db.query("insert into private.location_shares(owner_id,expires_at,latitude,longitude,accuracy,captured_at) values($1,now()+interval '1 hour',18.55,-72.31,10,now())",[owner]);
  }});
  try {
    const stored=(await db.query('select * from private.safety_records')).rows[0];
    assert.match(stored.encrypted_payload,/^enc:1:1:/);
    assert.notEqual(stored.value,'AB45678');assert.equal(stored.color,null);
    const dump=JSON.stringify((await db.query(`select jsonb_build_object('profile',(select to_jsonb(s) from private.safety_records s limit 1),'place',(select to_jsonb(s) from public.user_saved_places s limit 1),'route',(select to_jsonb(s) from public.user_routes s limit 1),'bounds',(select to_jsonb(s) from private.route_bounds s limit 1),'location',(select to_jsonb(s) from private.location_shares s limit 1),'identifier',(select to_jsonb(s) from public.accident_report_identifiers s limit 1)) value`)).rows);
    for(const secret of ['AB45678','Bleu privé','Maison confidentielle','Bureau confidentiel','Maison privée','Domicile privé','-72.31','18.55']) assert.equal(dump.includes(secret),false,secret);
    await db.exec('set role authenticated');
    assert.equal((await rpc(db,'read_safety_profile')).records[0].value,'AB45678');
    assert.deepEqual(await rpc(db,'read_saved_places'),places);
    const routes=await rpc(db,'read_saved_routes');assert.equal(routes[0].name,route.name);assert.deepEqual(routes[0].coordinates,route.coordinates);
    await claims(db,other);assert.deepEqual((await rpc(db,'read_safety_profile')).records,[]);assert.equal(await rpc(db,'read_saved_places'),null);assert.deepEqual(await rpc(db,'read_saved_routes'),[]);
    await assert.rejects(rpc(db,'save_saved_route',[routes[0].id,JSON.stringify(route)]),/route_unavailable/);
    for(const role of ['anon','authenticated','service_role']) {
      await db.exec(`reset role; set role ${role}`);
      if (role !== 'service_role') await assert.rejects(db.query('select * from vault.decrypted_secrets'),e=>e.code==='42501');
      for(const sql of ['select * from private.data_encryption_keys',"select private.decrypt_user_data('x','y')",'select private.rotate_user_data_key()',"select private.safety_lookup('identity','1234')"])
        await assert.rejects(db.query(sql),e=>e.code==='42501');
    }
    await db.exec('reset role');await claims(db,owner);
    const before=await rpc(db,'read_saved_places');
    assert.equal((await db.query('select private.rotate_user_data_key() v')).rows[0].v,2);
    assert.deepEqual(await rpc(db,'read_saved_places'),before);
    let count=0;while((await db.query('select private.reencrypt_user_data_batch(2) n')).rows[0].n) {assert.ok(++count<10);}
    assert.equal((await rpc(db,'read_safety_profile')).records[0].value,'AB45678');
    assert.deepEqual(await rpc(db,'read_saved_places'),places);
    assert.deepEqual((await rpc(db,'read_saved_routes'))[0].coordinates,route.coordinates);
    assert.equal((await db.query('select value from private.safety_records')).rows[0].value,stored.value);
    assert.match((await db.query('select encrypted_payload from private.safety_records')).rows[0].encrypted_payload,/^enc:1:2:/);
  } finally {await db.close();}
});

test('ciphertext is randomized, bound to its record, authenticated and fails closed without its key',async()=>{
 const db=await safetyDatabase();try {
  const value={private:'Donnée privée 🔐'};
  const a=(await db.query('select private.encrypt_user_data($1,$2) value',[JSON.stringify(value),'account-a'])).rows[0].value;
  const b=(await db.query('select private.encrypt_user_data($1,$2) value',[JSON.stringify(value),'account-a'])).rows[0].value;
  assert.notEqual(a,b);
  assert.deepEqual((await db.query('select private.decrypt_user_data($1,$2) value',[a,'account-a'])).rows[0].value,value);
  await assert.rejects(db.query('select private.decrypt_user_data($1,$2)',[a,'account-b']),/encrypted_data_unavailable/);
  await assert.rejects(db.query('select private.decrypt_user_data($1,$2)',[a.slice(0,-15)+'AAAA','account-a']),/encrypted_data_unavailable/);
  await db.exec('delete from private.data_encryption_keys');
  await assert.rejects(db.query('select private.decrypt_user_data($1,$2)',[a,'account-a']),/encrypted_data_unavailable/);
  await assert.rejects(db.query("select private.encrypt_user_data('{}','a')"));
 }finally{await db.close();}
});

test('identity photos and saved places use checked RPCs and never persist plaintext',async()=>{
 const db=await safetyDatabase();try {
  const owner=randomUUID(),other=randomUUID(),id=randomUUID(),path=`${owner}/${randomUUID()}.jpg`,photo='/9j/AA==';
  await db.query('insert into auth.users(id) values($1),($2)',[owner,other]);await claims(db,owner);await db.exec('set role authenticated');
  await rpc(db,'save_identity_photo',[path,photo]);
  assert.equal((await rpc(db,'read_identity_photo',[path])).replace(/\s/g,''),photo);
  await rpc(db,'save_safety_record',[id,'identity','ID123456',null,null,path]);
  await rpc(db,'delete_identity_photo',[path]);assert.ok(await rpc(db,'read_identity_photo',[path]));
  await rpc(db,'save_saved_places',[JSON.stringify(places)]);assert.deepEqual(await rpc(db,'read_saved_places'),places);
  await rpc(db,'save_saved_places',[JSON.stringify({...places,home_address:'Nouvelle maison'})]);assert.equal((await rpc(db,'read_saved_places')).home_address,'Nouvelle maison');
  await assert.rejects(rpc(db,'save_saved_places',[JSON.stringify({...places,home_latitude:95})]),/Invalid saved place/);
  await assert.rejects(db.query("insert into storage.objects(bucket_id,name) values('identity-cards',$1)",[path]),e=>e.code==='42501');
  await claims(db,other);await assert.rejects(rpc(db,'read_identity_photo',[path]),/safety_photo_unavailable/);
  await assert.rejects(rpc(db,'save_identity_photo',[path,photo]),/safety_photo_unavailable/);
  await db.exec('reset role');const raw=(await db.query('select encrypted_payload from private.identity_photo_data')).rows[0].encrypted_payload;assert.match(raw,/^enc:1:1:/);assert.equal(raw.includes(photo),false);
  await claims(db,owner);await rpc(db,'delete_safety_record',[id]);await rpc(db,'delete_identity_photo',[path]);await assert.rejects(rpc(db,'read_identity_photo',[path]),/safety_photo_unavailable/);
 }finally{await db.close();}
});
