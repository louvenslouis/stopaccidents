import assert from 'node:assert/strict';
import { test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { safetyDatabase } from './helpers/safety-db.mjs';
const owner = randomUUID(), other = randomUUID(), guest = randomUUID(), moderator = randomUUID();
const report = randomUUID(), second = randomUUID(), draft = randomUUID();
const login = id => `set role authenticated; select set_config('request.jwt.claims','{"sub":"${id}"}',false);`;
async function setup() {
 const db = await safetyDatabase();
 await db.exec(`insert into auth.users(id) values('${owner}'),('${other}'),('${moderator}');
 insert into auth.users(id,is_anonymous) values('${guest}',true);
 insert into private.report_event_moderators(user_id,role) values('${moderator}','moderator'); ${login(owner)}`);
 for (const id of [report,second]) await db.exec(`select public.prepare_manual_report_event('fire','${id}',null,18.55,-72.3,null,now(),30);
 select public.save_fire_report_step('${id}',1,'Delmas',18.55,-72.3,null);
 select public.save_fire_report_step('${id}',2,p_fire_target=>'house');`);
 await db.exec(`select public.prepare_manual_report_event('fire','${draft}',null,18.55,-72.3,null,now(),30);`);
 return db;
}
const read = async (db, root = null, after = null, flagged = false, publication = report) => (await db.query('select public.read_report_comments($1,$2,$3,$4,$5) value',['fire',publication,root,after,flagged])).rows[0].value;
const write = async (db, action, id = randomUUID(), body = 'Un commentaire', parent = null, publication = report) => (await db.query('select public.write_report_comment($1,$2,$3,$4,$5,$6) value',['fire',publication,action,id,body,parent])).rows[0].value;

test('comments enforce registered ownership, preserve threads, hide identities and support idempotent likes/reports/moderation', async () => {
 const db = await setup();
 try {
  const id = randomUUID(), reply = randomUUID(), nested = randomUUID();
  await write(db,'create',id); await write(db,'create',id); await write(db,'create');
  assert.equal((await read(db)).total,2);
  await assert.rejects(write(db,'create',randomUUID(),'  '));
  await assert.rejects(write(db,'create',randomUUID(),'x'.repeat(2001)));
  await assert.rejects(write(db,'create',randomUUID(),'Hello',null,draft));
  await assert.rejects(write(db,'like',id));
  await db.exec(login(other));
  await assert.rejects(write(db,'edit',id)); await assert.rejects(write(db,'delete',id));
  await assert.rejects(write(db,'create',id));
  await assert.rejects(write(db,'create',randomUUID(),'Wrong event',id,second));
  await write(db,'create',reply,'Réponse',id);
  await write(db,'create',nested,'Réponse à la réponse',reply);
  const replies = (await read(db,id)).items;
  assert.equal(replies.length,2); assert.ok(replies.every(c=>c.root_id===id));
  assert.equal(replies.find(c=>c.id===nested).parent_id,reply);
  await write(db,'like',id); await write(db,'like',id);
  await write(db,'flag',id,'Contenu offensant'); await write(db,'flag',id,'Doublon');
  let row = (await read(db)).items.find(c=>c.id===id);
  assert.equal(row.likes,1); assert.equal(row.liked,true); assert.equal(row.flagged,true); assert.deepEqual(row.flags,[]);
  assert.equal('author_id' in row,false);
  await assert.rejects(read(db,null,null,true));
  await assert.rejects(write(db,'hide',id));
  await assert.rejects(db.exec('select * from private.report_comments'));
  await assert.rejects(db.exec('select * from private.report_comment_likes'));
  await assert.rejects(db.exec('select * from private.report_comment_flags'));
  await write(db,'unlike',id); await write(db,'unlike',id);
  assert.equal((await read(db)).items.find(c=>c.id===id).likes,0);
  await db.exec(login(owner));
  await write(db,'edit',id,'Texte corrigé');
  row = (await read(db)).items.find(c=>c.id===id);
  assert.equal(row.body,'Texte corrigé'); assert.ok(row.edited_at);
  await db.exec(login(moderator));
  const flags = await read(db,null,null,true);
  assert.equal(flags.items.length,1); assert.deepEqual(flags.items[0].flags,['Contenu offensant']);
  await write(db,'hide',id);
  assert.equal((await read(db,null,null,true)).items.length,0);
  await db.exec(login(other));
  assert.equal((await read(db)).items.find(c=>c.id===id).body,null);
  await assert.rejects(write(db,'like',id)); await assert.rejects(write(db,'create',randomUUID(),'Reply',id));
  await db.exec(login(moderator)); await write(db,'restore',id);
  await db.exec(login(owner)); await write(db,'delete',id); await write(db,'delete',id);
  row = (await read(db)).items.find(c=>c.id===id);
  assert.equal(row.body,null); assert.equal(row.alias,null); assert.equal(row.deleted,true); assert.equal(row.replies,2);
  assert.equal((await read(db,id)).items.length,2);
  await assert.rejects(write(db,'edit',id));
  await db.exec(login(guest)); assert.equal((await read(db)).can_comment,false);
  for (const action of ['create','edit','delete','like','flag','hide']) await assert.rejects(write(db,action,reply));
  await db.exec(`select set_config('request.jwt.claims','',false); set role anon;`);
  assert.equal((await read(db)).can_comment,false); assert.equal((await read(db)).items.every(c=>!c.mine && !c.liked),true);
  await assert.rejects(write(db,'create'));
  await db.exec(`reset role; insert into private.publication_moderation(kind,report_id,suspended,reason,actor_id) values('fire','${report}',true,'Test suspension','${moderator}'); ${login(owner)}`);
  await assert.rejects(read(db)); await assert.rejects(write(db,'create'));
 } finally { await db.close(); }
});

test('comment pagination, rate limiting, merged-event threads and database grants', async () => {
 const db = await setup();
 try {
  for(let i=0;i<10;i++) await write(db,'create');
  await assert.rejects(write(db,'create'),/Too many comments/);
  await db.exec(`reset role; update private.report_comments set created_at=now()-interval '2 minutes';
  insert into private.report_comments(event_id,author_id,body,created_at)
   select event_id,'${owner}','Comment '||n,now()-interval '1 minute' from private.report_contributions cross join generate_series(1,55) n where report_id='${report}'; ${login(owner)}`);
  let page = await read(db); assert.equal(page.items.length,30); assert.equal(page.has_more,true);
  const ids = page.items.map(c=>c.id);
  while(page.has_more) { page=await read(db,null,page.items.at(-1).id); ids.push(...page.items.map(c=>c.id)); }
  assert.equal(ids.length,65); assert.equal(new Set(ids).size,65);
  const original = await write(db,'create',randomUUID(),'Other branch',null,second);
  await db.exec(`reset role; update private.report_events set merged_into=(select event_id from private.report_contributions where report_id='${report}') where id=(select event_id from private.report_contributions where report_id='${second}'); ${login(other)}`);
  const reply = await write(db,'create',randomUUID(),'Merged reply',original);
  assert.equal((await read(db)).total,67); assert.equal((await read(db,original)).items[0].id,reply);
  await db.exec(`reset role; update private.report_events set merged_into=null where id=(select event_id from private.report_contributions where report_id='${second}'); ${login(other)}`);
  assert.equal((await read(db)).total,65); assert.equal((await read(db,null,null,false,second)).total,2);
  assert.equal((await read(db,original,null,false,second)).items[0].id,reply);
  await assert.rejects(write(db,'edit',original));
  await db.exec('reset role');
  const tables = (await db.query("select relrowsecurity from pg_class where relname in ('report_comments','report_comment_likes','report_comment_flags')")).rows;
  assert.equal(tables.length,3); assert.ok(tables.every(t=>t.relrowsecurity));
  const funcs = (await db.query("select n.nspname,p.prosecdef,p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname in ('read_report_comments','write_report_comment')")).rows;
  assert.equal(funcs.length,4);
  for(const fn of funcs) { assert.equal(fn.prosecdef,fn.nspname==='private'); assert.ok(fn.proconfig.some(c=>c.startsWith('search_path='))); }
 } finally { await db.close(); }
});
