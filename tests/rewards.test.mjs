import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

test('rewards: completion, retries, rollback, all categories and account isolation', async () => {
  const db = await PGlite.create();
  const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  try {
    await db.exec(`
      create role anon; create role authenticated;
      create schema auth; create schema private;
      create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth to authenticated;
      insert into auth.users values ('${owner}'), ('${other}');
    `);
    const kinds = [
      'accident',
      'kidnapping',
      'barricade',
      'armed_presence',
      'suspicious_vehicle',
    ];
    for (const kind of kinds)
      await db.exec(
        `create table public.${kind}_reports(id uuid primary key, reporter_id uuid, completed_step integer);`,
      );
    await db.exec(
      await readFile(
        new URL(
          '../supabase/migrations/20260922072734_report_rewards.sql',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub', '${owner}', false)`,
    );
    for (const kind of kinds) {
      const finalStep = kind === 'accident' ? 4 : 3;
      await db.exec(
        `insert into ${kind}_reports values ('${id}', '${owner}', 1)`,
      );
      assert.equal(
        (
          await db.query(
            `select count(*)::int n from report_rewards where report_kind = '${kind}'`,
          )
        ).rows[0].n,
        0,
      );
      await db.exec(
        `begin; update ${kind}_reports set completed_step = ${finalStep}; rollback;`,
      );
      assert.equal(
        (
          await db.query(
            `select count(*)::int n from report_rewards where report_kind = '${kind}'`,
          )
        ).rows[0].n,
        0,
      );
      await db.exec(
        `update ${kind}_reports set completed_step = ${finalStep}; update ${kind}_reports set completed_step = ${finalStep};`,
      );
      assert.equal(
        (
          await db.query(
            `select count(*)::int n from report_rewards where report_kind = '${kind}'`,
          )
        ).rows[0].n,
        1,
      );
    }
    await db.exec('set role authenticated');
    const summary = await db.query(
      `select read_my_rewards('${id}', 'accident') as reward`,
    );
    assert.deepEqual(summary.rows[0].reward, {
      total: 125,
      count: 5,
      earned: 25,
    });
    await assert.rejects(
      db.exec(
        `insert into report_rewards values ('accident', gen_random_uuid(), '${owner}', 25)`,
      ),
      /permission denied/,
    );
    await assert.rejects(
      db.exec('update report_rewards set points = 25'),
      /permission denied/,
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub', '${other}', false)`,
    );
    assert.deepEqual(
      (await db.query('select read_my_rewards() as reward')).rows[0].reward,
      { total: 0, count: 0, earned: 0 },
    );
    assert.equal(
      (await db.query('select count(*)::int n from report_rewards')).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});
