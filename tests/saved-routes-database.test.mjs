import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { safetyDatabase } from './helpers/safety-db.mjs';

const coordinates = [[-72.31, 18.55], [-72.30, 18.55], [-72.30, 18.56]];
const waypoints = [
  { label: 'Maison', longitude: -72.31, latitude: 18.55 },
  { label: 'Travail', longitude: -72.30, latitude: 18.56 },
];
function access(db) {
  return {
    login: async (id, role = 'authenticated', session = null) => {
      await db.exec(`reset role; set role ${role}`);
      await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: id, role, session_id: session })]);
    },
    rpc: async (name, args = []) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) value`, args)).rows[0].value,
    route: async (owner, id = randomUUID()) => {
      await db.query(`insert into public.user_routes(id,user_id,name,waypoints,coordinates,distance_meters,duration_seconds,departure_time,weekdays,timezone)
        values($1,$2,'Maison → Travail',$3,$4,2200,900,(now() at time zone 'America/Port-au-Prince')::time,array[1,2,3,4,5,6,7],'America/Port-au-Prince')`,
      [id, owner, JSON.stringify(waypoints), JSON.stringify(coordinates)]);
      return id;
    },
  };
}

test('saved routes preserve exact geometry and protect CRUD, schedule and worker APIs', async () => {
  const db = await safetyDatabase();
  try {
    const { login, rpc, route } = access(db);
    const owner = randomUUID(), other = randomUUID(), guest = randomUUID();
    await db.query('insert into auth.users(id,is_anonymous) values($1,false),($2,false),($3,true)', [owner, other, guest]);
    await login(owner);
    const id = await route(owner);
    const saved = (await db.query('select * from public.user_routes where id=$1', [id])).rows[0];
    assert.deepEqual(saved.coordinates, coordinates);
    assert.deepEqual(saved.waypoints, waypoints);
    await assert.rejects(route(other), e => e.code === '42501');
    await assert.rejects(db.query('update public.user_routes set user_id=$1 where id=$2', [other, id]), e => e.code === '42501');
    for (const invalid of [[], [[-72.3, 18.5]], [[-72.3, 18.5], [null, 18.6]], [[-72.3, 18.5], [200, 18.6]], [[-72.3, 18.5], {}]]) {
      await assert.rejects(db.query('update public.user_routes set coordinates=$1 where id=$2', [JSON.stringify(invalid), id]), /route_invalid_geometry/);
    }
    for (const invalid of [[], [0], [8], [1, 1], [1, null]]) {
      await assert.rejects(db.query('update public.user_routes set weekdays=$1 where id=$2', [invalid, id]), /route_invalid_schedule/);
    }
    await assert.rejects(db.query("update public.user_routes set timezone='Mars/Olympus' where id=$1", [id]), /route_invalid_schedule/);
    await assert.rejects(db.query('update public.user_routes set duration_minutes=241 where id=$1', [id]), e => e.code === '23514');
    await assert.rejects(db.query('update public.user_routes set lead_minutes=120 where id=$1', [id]), e => e.code === '23514');
    await login(other);
    assert.equal((await db.query('select * from public.user_routes')).rows.length, 0);
    assert.equal((await db.query('delete from public.user_routes where id=$1 returning id', [id])).rows.length, 0);
    assert.equal((await db.query("update public.user_routes set name='Hack' where id=$1 returning id", [id])).rows.length, 0);
    for (const name of ['claim_route_push_jobs', 'read_route_alerts']) {
      if (name === 'read_route_alerts') assert.deepEqual(await rpc(name), []);
      else await assert.rejects(rpc(name), e => e.code === '42501');
    }
    for (const name of ['route_alerts', 'route_bounds', 'route_push_devices', 'route_push_queue']) {
      await assert.rejects(db.query(`select * from private.${name}`), e => e.code === '42501');
    }
    await login(guest);
    await assert.rejects(route(guest), e => e.code === '42501');
    await assert.rejects(rpc('read_route_alerts'), /connection_account_required/);
    await login(null, 'anon');
    await assert.rejects(db.query('select * from public.user_routes'), e => e.code === '42501');
    await login(owner);
    await db.query('delete from public.user_routes where id=$1', [id]);
    assert.equal((await db.query('select * from public.user_routes')).rows.length, 0);
  } finally { await db.close(); }
});

test('route matching uses the segment corridor and local weekday across midnight and DST', async () => {
  const db = await safetyDatabase();
  try {
    const { route } = access(db);
    const owner = randomUUID();
    await db.query('insert into auth.users(id) values($1)', [owner]);
    const id = await route(owner);
    const matches = async (lat, lon, points = coordinates) => (await db.query('select private.route_intersects($1,$2,$3) value', [JSON.stringify(points), lat, lon])).rows[0].value;
    assert.equal(await matches(18.5503, -72.305), true); // midway, over 500m from either waypoint
    assert.equal(await matches(18.5507, -72.305), false); // parallel street, beyond 60m
    assert.equal(await matches(18.555, -72.30), true);
    assert.equal(await matches(18.555, -72.305), false); // endpoint shortcuts must not match
    assert.equal(await matches(18.55, -72.31, [[-72.31,18.55],[-72.31,18.55]]), true);
    await db.query("update public.user_routes set departure_time='23:50',weekdays=array[1],duration_minutes=60,lead_minutes=30 where id=$1", [id]);
    const departures = async (instant) => (await db.query('select d.departure_at::text value from public.user_routes r cross join lateral private.route_departures(r,$2::timestamptz) d where r.id=$1', [id, instant])).rows;
    assert.equal((await departures('2026-10-06T04:10:00Z')).length, 1); // Tuesday 00:10 belongs to Monday departure
    assert.equal((await departures('2026-10-06T04:50:00Z')).length, 0);
    assert.equal((await departures('2026-10-05T04:10:00Z')).length, 0); // Monday 00:10 is Sunday's trip
    await db.query("update public.user_routes set departure_time='00:10',weekdays=array[2] where id=$1", [id]);
    assert.equal((await departures('2026-10-06T03:50:00Z')).length, 1); // Monday lead window for Tuesday
    assert.equal((await departures('2026-10-06T03:39:00Z')).length, 0);
    await db.query("update public.user_routes set departure_time='08:00',weekdays=array[1,2,3,4,5,6,7],timezone='America/New_York' where id=$1", [id]);
    assert.equal((await departures('2026-01-05T13:00:00Z')).length, 1);
    assert.equal((await departures('2026-07-06T12:00:00Z')).length, 1);
    assert.equal((await departures('2026-07-06T13:00:00Z')).length, 0);
  } finally { await db.close(); }
});

test('scheduled incident alerts work without GPS and deduplicate, revoke and retry safely', async () => {
  const db = await safetyDatabase();
  try {
    const { login, rpc, route } = access(db);
    const owner = randomUUID(), reporter = randomUUID(), outsider = randomUUID(), session = randomUUID(), device = randomUUID();
    await db.query('insert into auth.users(id) values($1),($2),($3)', [owner,reporter,outsider]);
    await db.query('insert into auth.sessions(id,user_id) values($1,$2)', [session,owner]);
    await login(owner, 'authenticated', session);
    const id = await route(owner);
    const departure = (await db.query('select departure_time from public.user_routes where id=$1', [id])).rows[0].departure_time;
    await db.query("update public.user_routes set departure_time=((now() at time zone timezone)+interval '12 hours')::time where id=$1",[id]);
    await rpc('register_route_push_device', [device,'ExpoPushToken[abcdefghijklmnop]']);
    // Safety and route preferences are independent, even for the same installation/token.
    await rpc('register_safety_push_device', [device,'ExpoPushToken[abcdefghijklmnop]']);
    await rpc('unregister_safety_push_device', [device]);
    await login(reporter);
    const report = randomUUID(), far = randomUUID();
    await rpc('save_accident_report_step', [report,1,'Rue empruntée',18.55,-72.305,10]);
    await rpc('save_accident_report_step', [far,1,'Rue parallèle',18.552,-72.305,10]);
    await login(owner);
    assert.deepEqual(await rpc('read_route_alerts'),[]); // no alert outside the configured time
    await db.query('update public.user_routes set departure_time=$1 where id=$2',[departure,id]);
    const inbox = await rpc('read_route_alerts');
    assert.equal(inbox.length, 1);
    assert.equal(inbox[0].report_id, report);
    assert.equal(inbox[0].route_id, id);
    assert.equal((await rpc('read_route_alerts')).length,1);
    await login(outsider);
    assert.deepEqual(await rpc('read_route_alerts'),[]);
    await assert.rejects(rpc('mark_route_alert_read',[inbox[0].id]), /route_alert_unavailable/);
    await login(owner);
    await rpc('mark_route_alert_read',[inbox[0].id]);
    assert.ok((await rpc('read_route_alerts'))[0].read_at);
    await login(null,'service_role');
    let jobs = await rpc('claim_route_push_jobs');
    assert.equal(jobs.length,1);
    assert.deepEqual(await rpc('claim_route_push_jobs'),[]); // lease excludes second worker
    assert.equal(await rpc('route_push_job_eligible',[jobs[0].id,jobs[0].lease]),true);
    await rpc('finish_route_push_job',[jobs[0].id,randomUUID(),'delivered',null,null]);
    await rpc('finish_route_push_job',[jobs[0].id,jobs[0].lease,'retry',null,'network_error']);
    await db.exec('reset role');
    assert.equal((await db.query('select state from private.route_push_queue')).rows[0].state,'pending');
    await db.exec("update private.route_push_queue set available_at=now()-interval '1 second'");
    await login(null,'service_role');
    jobs = await rpc('claim_route_push_jobs');
    await rpc('finish_route_push_job',[jobs[0].id,jobs[0].lease,'receipt','ticket-one',null]);
    await db.exec('reset role');
    await db.exec("update private.route_push_queue set available_at=now()-interval '1 second'");
    await login(null,'service_role');
    jobs = await rpc('claim_route_push_jobs');
    assert.equal(jobs[0].ticket_id,'ticket-one');
    await rpc('finish_route_push_job',[jobs[0].id,jobs[0].lease,'delivered',null,null]);
    // New testimony in the same event and merged incidents do not notify twice.
    await login(reporter);
    const sibling = randomUUID();
    await rpc('save_accident_report_step', [sibling,1,'Autre témoin',18.55,-72.305,10]);
    await db.exec('reset role');
    await db.query('update private.report_events set merged_into=(select event_id from private.report_contributions where report_id=$1) where id=(select event_id from private.report_contributions where report_id=$2)',[report,sibling]);
    await login(owner);
    assert.equal((await rpc('read_route_alerts')).length,1);
    await login(null,'service_role');
    assert.deepEqual(await rpc('claim_route_push_jobs'),[]);
    // Disabling a route after claim suppresses delivery, without requiring GPS.
    await login(reporter);
    const next = randomUUID();
    await rpc('save_accident_report_step',[next,1,'Nouveau problème',18.555,-72.30,10]);
    await login(null,'service_role');
    jobs = await rpc('claim_route_push_jobs');
    assert.equal(jobs.length,1);
    await login(owner);
    await db.query('update public.user_routes set alerts_enabled=false where id=$1',[id]);
    await login(null,'service_role');
    assert.equal(await rpc('route_push_job_eligible',[jobs[0].id,jobs[0].lease]),false);
    await login(owner);
    await db.query('update public.user_routes set alerts_enabled=true where id=$1',[id]);
    // Closed/withdrawn/deleted evidence disappears from the inbox.
    await db.exec('reset role');
    await db.query("update private.report_contributions set status='closed' where report_id in ($1,$2)",[report,sibling]);
    await login(owner);
    assert.equal((await rpc('read_route_alerts')).length,1);
    await db.exec('reset role');
    await db.query('update private.report_contributions set published=false where report_id=$1',[next]);
    await login(owner);
    assert.deepEqual(await rpc('read_route_alerts'),[]);
    await db.exec('reset role');
    await db.query('delete from private.report_contributions where report_id=$1',[next]);
    await login(owner);
    assert.deepEqual(await rpc('read_route_alerts'),[]);
    // Even an active incident cannot push after the session is revoked.
    await login(reporter);
    await rpc('save_accident_report_step',[randomUUID(),1,'Incident avec session révoquée',18.55,-72.305,10]);
    await db.exec('reset role');
    await db.query('delete from auth.sessions where id=$1',[session]);
    await login(null,'service_role');
    assert.deepEqual(await rpc('claim_route_push_jobs'),[]);
    await db.exec('reset role');
    assert.equal((await db.query('select count(*)::integer n from private.route_push_devices')).rows[0].n,0);
    await login(owner);
    const beforeNextDeparture = (await rpc('read_route_alerts')).length;
    await db.query("update public.user_routes set departure_time=(departure_time+interval '1 minute')::time where id=$1",[id]);
    assert.equal((await rpc('read_route_alerts')).length,beforeNextDeparture*2); // same unresolved event, distinct departure
    assert.equal((await rpc('read_route_alerts')).length,beforeNextDeparture*2); // repeated reads do not repeat it
  } finally { await db.close(); }
});
