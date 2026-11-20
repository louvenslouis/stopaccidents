import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const source = await readFile('src/components/report-location-preview.tsx', 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
} });

function preview(platform, reverseGeocodeStreet = async () => null) {
  const jsx = (type, props, key) => ({ type, props, key });
  const jobs = new Map();
  let state = [], slot = 0, cleanup;
  const modules = {
    react: {
      useState(initial) {
        const index = slot++;
        state[index] ??= initial;
        return [state[index], value => { state[index] = value; }];
      },
      useRef(initial) { return state[slot++] ??= { current: initial }; },
      useEffect(effect) { cleanup = effect(); },
    },
    'react/jsx-runtime': { jsx, jsxs: jsx },
    'react-native': { Platform: { OS: platform }, StyleSheet: { create: value => value } },
    'expo-image': { Image: 'image' },
    '@/features/language/native': { View: 'view', Text: 'text' },
    '@/features/accident-report/reverse-geocode': { reverseGeocodeStreet },
  };
  const exports = {};
  const schedule = fn => { const id = jobs.size + 1; jobs.set(id, fn); return id; };
  new Function('require', 'exports', 'setTimeout', 'clearTimeout', outputText)(
    name => modules[name] ?? {}, exports, schedule, id => jobs.delete(id),
  );
  const render = (fn, props, slots) => { state = slots; slot = 0; return fn(props); };
  const layout = [{ width: 320, height: 180 }];
  const children = props => render(exports.ReportLocationPreview, props, layout).props.children;
  return {
    children,
    tiles: props => children(props)[0].props.children,
    renderChild: (child, slots) => render(child.type, child.props, slots),
    jobs, unmount: () => cleanup(),
  };
}

const location = { latitude: 18.54, longitude: -72.31 };
test('the active preview requests visible OSM tiles and identifies the native app', () => {
  for (const platform of ['android', 'ios', 'web']) {
    const p = preview(platform);
    assert.equal(p.tiles({ ...location, active: false }).length, 0);
    assert.equal(p.tiles({ ...location, latitude: null }).length, 0);
    const tiles = p.tiles(location);
    assert.ok(tiles.length > 1);
    for (const tile of tiles) {
      const image = p.renderChild(tile, []);
      assert.match(image.props.source.uri, /^https:\/\/tile\.openstreetmap\.org\/14\/\d+\/\d+\.png$/);
      if (platform === 'web') {
        assert.equal(image.props.source.headers, undefined);
        assert.equal(image.props.source.cacheKey, undefined);
      } else {
        assert.match(image.props.source.headers['User-Agent'], /StopAccidents/);
        assert.ok(image.props.source.cacheKey.endsWith(image.props.source.uri));
        assert.notEqual(image.props.source.cacheKey, image.props.source.uri);
      }
    }
  }
});

test('the miniature shows a wider map centered on the same coordinates', () => {
  const p = preview('android');
  const center = { latitude: 0, longitude: 0 };
  for (const compact of [true, false]) {
    const zoom = compact ? 13 : 14;
    const midpoint = 2 ** (zoom - 1);
    const tiles = p.tiles({ ...center, compact });
    const tile = tiles.find(({ props }) => props.uri.endsWith(`/${zoom}/${midpoint}/${midpoint}.png`));
    assert.ok(tile);
    assert.deepEqual([tile.props.left, tile.props.top], [160, 90]);
  }
});

test('only visible mapped reports display their own street names', async () => {
  const requests = [];
  const p = preview('android', (...point) => new Promise(resolve => requests.push({ point, resolve })));
  const street = props => p.children(props).find(node => node?.type?.name === 'StreetName');
  assert.equal(street({ ...location, active: false }), undefined);
  assert.equal(street({ ...location, latitude: null }), undefined);
  const first = street(location);
  const oldState = [];
  assert.equal(p.renderChild(first, oldState), null);
  assert.deepEqual(requests[0].point, [location.latitude, location.longitude]);
  p.unmount();
  const second = street({ ...location, latitude: 18.55 });
  assert.notEqual(first.key, second.key);
  const state = [];
  assert.equal(p.renderChild(second, state), null);
  requests[0].resolve('Ancienne rue');
  requests[1].resolve('Rue Légitime');
  await Promise.resolve();
  assert.equal(oldState[0], null);
  const label = p.renderChild(second, state).props.children;
  assert.equal(label.props.children, 'Rue Légitime');
  assert.equal(label.props.translate, false);
});

test('only the failed tile retries once and leaving the preview cancels a pending retry', () => {
  const p = preview('android');
  const [first, second] = p.tiles(location);
  const slots = [];
  const image = p.renderChild(first, slots);
  image.props.onError();
  image.props.onError();
  assert.equal(p.jobs.size, 1);
  const [id, retry] = [...p.jobs][0];
  p.jobs.delete(id); retry();
  const retried = p.renderChild(first, slots);
  assert.notEqual(retried.key, image.key);
  assert.equal(retried.props.source.uri, image.props.source.uri);
  retried.props.onError();
  assert.equal(p.jobs.size, 0);
  const sibling = p.renderChild(second, []);
  assert.equal(sibling.key, image.key);
  sibling.props.onError();
  p.unmount();
  assert.equal(p.jobs.size, 0);
});
