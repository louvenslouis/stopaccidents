import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { safetyDatabase } from './helpers/safety-db.mjs';

test('event details combine public observations through the normal reporting RPCs', async t => {
  const db = await safetyDatabase();
  t.after(() => db.close());
  const people = Array.from({ length: 4 }, () => randomUUID());
  await db.query('insert into auth.users(id) select unnest($1::uuid[])', [people]);
  await db.query("insert into private.report_event_moderators(user_id,role) values ($1,'moderator')", [people[3]]);

  async function actAs(person) {
    await db.exec(person ? 'set role authenticated' : 'set role anon');
    await db.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub: person })]);
  }
  async function value(sql, params = []) {
    return (await db.query(sql, params)).rows[0].value;
  }
  async function start(kind, person, source, minutesAgo = 0) {
    await actAs(person);
    const id = randomUUID();
    if (source) {
      await db.query('select public.prepare_report_testimony($1,$2,$3)', [kind, id, source]);
    } else {
      await db.query('select public.prepare_manual_report_event($1,$2,null,18.55,-72.3,null,now(),$3)',
        [kind, id, minutesAgo]);
    }
    await db.query(`select public.save_${kind}_report_step($1,1,'Delmas',18.55,-72.3,null)`, [id]);
    return id;
  }
  const detail = (kind, id) => value('select public.read_event_report($1,$2) as value', [kind, id]);
  const event = (kind, id) => value('select public.read_report_event($1,$2) as value', [kind, id]);

  await t.test('partial corrections, independent votes, original testimony, feeds and moderation', async () => {
    const source = await start('accident', people[0], null, 30);
    await db.query("select public.save_accident_report_step($1,2,p_accident_type=>'two_cars')", [source]);
    await db.query("select public.save_accident_report_step($1,3,p_severity=>'material')", [source]);
    await db.query("select public.save_accident_report_step($1,4,p_notes=>'Une voie occupée',p_registrations=>array['PRIVATE-123'])", [source]);

    for (let i = 0; i < 3; i++) {
      const update = await start('accident', people[1], source);
      await db.query("select public.save_accident_report_step($1,3,p_severity=>'injuries')", [update]);
    }
    assert.equal((await detail('accident', source)).severity, 'material', 'a stable tie retains the earlier account');
    const corroboration = await start('accident', people[2], source);
    await db.query("select public.save_accident_report_step($1,3,p_severity=>'injuries')", [corroboration]);
    await db.query("select public.save_accident_report_step($1,4,p_notes=>'Secours arrivés')", [corroboration]);
    const empty = await start('accident', people[2], source);
    await db.query("select public.save_accident_report_step($1,3,p_severity=>'unknown')", [empty]);
    await actAs(null);
    const merged = await detail('accident', source);
    assert.equal(merged.accident_type, 'two_cars');
    assert.equal(merged.severity, 'injuries');
    assert.deepEqual(merged.notes.split('\n\n'), ['Secours arrivés', 'Une voie occupée']);
    assert.deepEqual(merged.identifiers, []);
    const activity = await event('accident', source);
    assert.equal(activity.summary.testimony_count, 6);
    assert.equal(activity.summary.witness_count, 3);
    assert.equal(activity.contributions.find(c => c.id === source).severity, 'material');
    assert.equal(await value("select public.read_accident($1)->>'notes' as value", [source]), 'Une voie occupée');
    const map = await value("select public.read_map_reports()->'reports' as value");
    const analytics = await value("select public.read_report_analytics(null,current_date,'accidents','two_cars') as value");
    for (const summary of [map[0], activity.summary, analytics.reports[0], await value('select public.read_latest_report() as value')]) {
      assert.equal(summary.severity, 'injuries');
      assert.equal(summary.id, source);
      assert.ok(!('identifiers' in summary || 'notes' in summary || 'reporter_id' in summary));
    }
    assert.equal(analytics.individual_total, 1);
    assert.deepEqual(analytics.severity.find(s => s.severity === 'injuries'), { severity: 'injuries', count: 1 });
    await actAs(people[3]);
    await db.query("select public.moderate_publication('accident',$1,true,'Essai de modération')", [corroboration]);
    assert.equal(await detail('accident', corroboration), null);
    assert.equal((await detail('accident', source)).notes, 'Une voie occupée');
    assert.equal((await detail('accident', source)).severity, 'material');
    await db.query("select public.moderate_publication('accident',$1,false,'Rétablissement du témoignage')", [corroboration]);
    assert.equal((await detail('accident', source)).severity, 'injuries');
    const revision = await start('accident', people[2], source);
    await db.query("select public.save_accident_report_step($1,3,p_severity=>'material')", [revision]);
    assert.equal((await detail('accident', source)).severity, 'material', 'correction replaces the same witness’s old vote');
    assert.equal((await detail('accident', source)).notes, merged.notes, 'revising severity preserves notes');
    await db.exec('reset role');
    await db.query("update private.publication_moderation set suspended=true where kind='accident' and report_id=$1", [corroboration]);
    await actAs(null);
    assert.equal((await detail('accident', source)).notes, 'Une voie occupée', 'respect moderation even if the projection is stale');
    await assert.rejects(db.query('select * from private.report_observations'), /permission denied/);
  });

  await t.test('a changing situation uses recent observations of that field, across a reversible merge', async () => {
    const source = await start('fire', people[0], null, 60);
    await db.query("select public.save_fire_report_step($1,2,p_fire_target=>'house')", [source]);
    await db.query("select public.save_fire_report_step($1,3,p_fire_state=>'active')", [source]);
    await db.query("select public.save_fire_report_step($1,4,p_people_danger=>'yes',p_details=>'Route fermée')", [source]);
    const second = await start('fire', people[1], null, 45);
    await db.query("select public.save_fire_report_step($1,3,p_fire_state=>'active')", [second]);
    const firstEvent = (await event('fire', source)).event_id;
    const secondEvent = (await event('fire', second)).event_id;
    await actAs(people[3]);
    const merge = await value("select public.merge_report_events($1,$2,'Même incendie') as value", [secondEvent, firstEvent]);
    const recent = await start('fire', people[2], source);
    await db.query("select public.save_fire_report_step($1,3,p_fire_state=>'extinguished')", [recent]);
    await db.query("select public.save_fire_report_step($1,4,p_people_danger=>'unknown',p_details=>'ROUTE FERMÉE')", [recent]);
    const result = await detail('fire', second);
    assert.equal(result.fire_target, 'house');
    assert.equal(result.fire_state, 'extinguished', 'two old observations no longer outweigh the current state');
    assert.equal(result.people_danger, 'yes', 'an unanswered field retains its last known value');
    assert.equal(result.details, 'ROUTE FERMÉE', 'duplicate notes appear once');
    assert.equal(await value("select public.read_fire_report($1)->>'fire_state' as value", [source]), 'active');
    await actAs(people[3]);
    await db.query('select public.undo_report_event_merge($1)', [merge]);
    assert.equal((await detail('fire', second)).fire_state, 'active');
    assert.equal((await detail('fire', second)).fire_target, '');
  });

  for (const [kind, firstField, firstValue, nextStep, nextField, nextValue] of [
    ['breakdown', 'vehicle_type', 'truck', 4, 'traffic_impact', 'slowdown'],
    ['barricade', 'obstacles', 'Pierres', 2, 'passage', 'Une voie ouverte'],
    ['gathering', 'gathering_type', 'march', 4, 'traffic_impact', 'slowed'],
  ]) {
    await t.test(`${kind} combines complementary fields`, async () => {
      const source = await start(kind, people[0]);
      const firstStep = kind === 'breakdown' ? 3 : 2;
      await db.query(`select public.save_${kind}_report_step($1,$2,p_${firstField}=>$3)`, [source, firstStep, firstValue]);
      const addition = await start(kind, people[1], source);
      await db.query(`select public.save_${kind}_report_step($1,$2,p_${nextField}=>$3)`, [addition, nextStep, nextValue]);
      const result = await detail(kind, source);
      assert.equal(result[firstField], firstValue);
      assert.equal(result[nextField], nextValue);
      assert.equal((await detail(kind, addition))[firstField], firstValue);
    });
  }
});
