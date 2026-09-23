import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

async function compile(path, dependencies = {}) {
  const source = await readFile(path, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  new Function('exports', 'require', outputText)(exports, (name) => dependencies[name]);
  return exports;
}

const palette = await compile('src/features/appearance/palette.ts');
test('theme defaults to light and only follows the system when explicitly selected', () => {
  const { resolveColorScheme: resolve, parseThemePreference: parse } = palette;
  for (const stored of [null, undefined, '', 'unknown', {}, 1]) {
    assert.equal(parse(stored), 'light');
    assert.equal(resolve(parse(stored), 'dark'), 'light');
    assert.equal(resolve(parse(stored), 'light'), 'light');
  }
  for (const system of ['light', 'dark', null, 'unspecified']) {
    assert.equal(resolve(parse('dark'), system), 'dark');
    assert.equal(resolve(parse('light'), system), 'light');
  }
  assert.equal(resolve('system', null), 'light');
  assert.equal(resolve(parse('system'), 'dark'), 'dark');
  assert.equal(resolve(parse('system'), 'light'), 'light');
  assert.equal(palette.DEFAULT_THEME_PREFERENCE, 'light');
});

function luminance(hex) {
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}
test('dark text and semantic alert colors meet WCAG AA for normal text', () => {
  const p = palette.darkPalette;
  for (const surface of ['background', 'surface', 'elevated', 'input']) {
    for (const foreground of ['text', 'secondary', 'muted', 'accent', 'success', 'info', 'warning', 'violet']) {
      assert.ok(contrast(p[foreground], p[surface]) >= 4.5, `${foreground} on ${surface}`);
    }
  }
  for (const tone of ['accent', 'success', 'info', 'warning', 'violet']) {
    assert.ok(contrast(p[tone], p[`${tone}Soft`]) >= 4.5, tone);
  }
});

test('embedded maps accept a dark theme and safely restore light without resetting map state', async () => {
  const map = await compile('src/components/map-document.ts');
  const picker = await compile('src/components/place-picker-document.ts', { './map-document': map });
  for (const html of [map.MAP_DOCUMENT, picker.PLACE_PICKER_DOCUMENT]) {
    const window = {};
    const document = { documentElement: { dataset: {}, style: {} } };
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    new Function('window', 'document', script)(window, document);
    window.stopAccidentsTheme('dark');
    assert.equal(document.documentElement.dataset.theme, 'dark');
    assert.equal(document.documentElement.style.colorScheme, 'dark');
    window.stopAccidentsTheme('invalid');
    assert.equal(document.documentElement.dataset.theme, 'light');
  }
});
