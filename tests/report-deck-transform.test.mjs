import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';
const { outputText } = ts.transpileModule(await readFile('src/features/home/report-deck-transform.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } });
const exports = {};
new Function('exports', outputText)(exports);
const frame = exports.reportDeckTransform;
test('three cards fan on opposite sides and the current card remains full size', () => {
  assert.deepEqual(frame(0, 340), { x: 0, y: 0, rotation: 0, scale: 1, opacity: 1 });
  assert.ok(frame(1, 340).x > 0);
  assert.ok(frame(2, 340).x < 0);
  assert.ok(frame(1, 340).scale < 1);
});
test('outgoing card clears the deck, next card lands without a selection jump', () => {
  for (const width of [240, 340, 640]) {
    assert.equal(frame(-1, width).opacity, 0);
    assert.ok(frame(-1, width).x < -width);
    assert.equal(frame(1 - 1, width).x, 0);
    for (let distance = -1; distance <= 3; distance += .025) {
      const f = frame(distance, width);
      assert.ok(f.opacity >= 0 && f.opacity <= 1);
      assert.ok(f.scale > 0);
    }
  }
});
