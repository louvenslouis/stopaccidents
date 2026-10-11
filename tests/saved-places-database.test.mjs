import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { safetyDatabase } from './helpers/safety-db.mjs';

test('PostgreSQL: authenticated users can create and update their encrypted saved places', async () => {
  const db = await safetyDatabase();
  try {
    const results = await db.exec(await readFile(new URL('../supabase/tests/user_saved_places.sql', import.meta.url), 'utf8'));
    assert.match(results.at(-1).rows[0].result, /^PASS:/);
  } finally { await db.close(); }
});
