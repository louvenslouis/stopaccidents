import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const { outputText } = ts.transpileModule(await readFile('src/features/navigation/tab-contrast.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const model = {};
new Function('exports', outputText)(model);
const { parseHex, contrastRatio, glassBackground, tabForeground } = model;

test('inactive labels maintain contrast across light, dark and colored sections', () => {
  for (const dark of [false, true]) {
    let previous;
    for (const background of ['#F7F7F7', '#FFFFFF', '#203F35', '#2C4A3F', '#F6ECE3', '#ECEFE3', '#10151D', '#000000', '#777777', '#FFFFFF']) {
      const foreground = tabForeground(background, dark, previous);
      assert.ok(contrastRatio(parseHex(foreground), glassBackground(background, dark)) >= 4.5,
        `${foreground} on ${background} (dark=${dark})`);
      previous = foreground;
    }
  }
});
test('the dark journey card changes the light-theme foreground and restores it afterward', () => {
  const base = tabForeground('#F7F7F7', false);
  const journey = tabForeground('#203F35', false, base);
  assert.notEqual(journey, base);
  assert.equal(tabForeground('#F7F7F7', false, journey), base);
});
test('tiny background variations do not oscillate the foreground', () => {
  const initial = tabForeground('#203F35', false);
  for (const background of ['#213F35', '#203E35', '#203F36']) {
    assert.equal(tabForeground(background, false, initial), initial);
  }
});
