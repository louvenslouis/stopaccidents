import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

async function compile(path, dependencies) {
  const { outputText } = ts.transpileModule(await readFile(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  });
  const exports = {};
  new Function('exports', 'require', outputText)(exports, name => dependencies[name] ?? {});
  return exports;
}
const flush = () => new Promise(setImmediate);
function hooks() {
  let cursor = 0;
  const values = [], effects = [], pending = [];
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!(i in values)) values[i] = typeof initial === 'function' ? initial() : initial;
      return [values[i], value => { values[i] = typeof value === 'function' ? value(values[i]) : value; }];
    },
    useRef(initial) { return values[cursor++] ??= { current: initial }; },
    useCallback(fn, deps) {
      const i = cursor++;
      if (!values[i] || deps.some((value, j) => value !== values[i].deps[j])) values[i] = { fn, deps };
      return values[i].fn;
    },
    useEffect(run, deps) {
      const i = cursor++;
      if (!effects[i] || deps.some((value, j) => value !== effects[i].deps[j])) pending.push(() => {
        effects[i]?.cleanup?.(); effects[i] = { deps, cleanup: run() };
      });
    },
  };
  return { react, render(fn) { cursor = 0; const result = fn(); for (const run of pending.splice(0)) run(); return result; } };
}

test('guests never fetch reward balances and a late account response cannot restore points after logout', async () => {
  const h = hooks();
  let session = null, listener, resolvePoints;
  let requests = 0;
  const { useRewards } = await compile('src/features/rewards/use-rewards.ts', {
    react: h.react,
    'react-native': { AppState: { addEventListener: () => ({ remove() {} }) } },
    '@/lib/supabase': { supabase: {
      auth: {
        getSession: async () => ({ data: { session }, error: null }),
        onAuthStateChange(fn) { listener = fn; return { data: { subscription: { unsubscribe() {} } } }; },
      },
      rpc: async () => { requests++; return new Promise(resolve => { resolvePoints = resolve; }); },
    } },
  });
  const render = () => h.render(() => useRewards('report', 'barricade'));
  assert.equal(render().eligibility, 'loading');
  await flush();
  assert.equal(render().eligibility, 'guest');
  assert.equal(requests, 0);
  session = { user: { is_anonymous: true } }; listener();
  await flush();
  assert.deepEqual(render().summary, { total: 0, count: 0, earned: 0 });
  assert.equal(requests, 0);
  session = { user: { is_anonymous: false } }; listener();
  await flush();
  assert.equal(render().eligibility, 'registered');
  assert.equal(requests, 1);
  session = null; listener(); await flush();
  resolvePoints({ data: { total: 25, count: 1, earned: 25 }, error: null }); await flush();
  assert.equal(render().eligibility, 'guest');
  assert.deepEqual(render().summary, { total: 0, count: 0, earned: 0 });
});

test('guest completion prioritizes optional signup, closes the report and never renders a reward celebration', async () => {
  let eligibility = 'guest';
  const calls = [];
  const { ReportReward, RewardCelebration } = await compile('src/components/report-reward.tsx', {
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
    'react-native': { StyleSheet: { create: value => value } },
    '@/features/language/native': { ScrollView: 'ScrollView', Text: 'Text', View: 'View' },
    '@/features/appearance/theme-provider': {
      createThemedStyles: factory => () => factory(color => color), useThemeColor: () => color => color,
    },
    '@/components/ui/surface-depth': { surfaceDepth: () => ({}) },
    '@/components/ui/animated-pressable': { AnimatedPressable: 'Button' },
    '@/features/rewards/use-rewards': { useRewards: () => ({ eligibility, summary: { total: 25, count: 1, earned: 25 }, error: false }) },
    'expo-router': { useRouter: () => ({ push: route => calls.push(route) }) },
  });
  function nodes(node) {
    if (!node || typeof node !== 'object') return [];
    return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
  }
  const render = kind => ReportReward({ reportId: 'test-id', reportKind: kind, onDone: () => calls.push('done') });
  for (const kind of ['accident','kidnapping','barricade','armed_presence','suspicious_vehicle','gunfire','breakdown']) {
    const outer = render(kind);
    assert.notEqual(outer.type, RewardCelebration);
    const tree = outer.type(outer.props);
    const buttons = nodes(tree).filter(node => node.type === 'Button');
    assert.deepEqual(buttons.map(button => button.props.children.props.children), ['Créer un compte', 'Plus tard']);
    buttons[1].props.onPress();
    assert.equal(calls.pop(), 'done');
    assert.equal(calls.length, 0);
    buttons[0].props.onPress();
    assert.deepEqual(calls.splice(0), ['done', { pathname: '/profil', params: { auth: 'signUp' } }]);
    assert.ok(!nodes(tree).some(node => node.type === 'Text' && /solde|points/i.test(String(node.props.children))));
  }
  eligibility = 'loading';
  let outer = render('accident');
  assert.ok(!nodes(outer.type(outer.props)).some(node => node.type === 'Button' && node.props.children.props.children === 'Créer un compte'));
  eligibility = 'registered';
  outer = render('accident');
  assert.equal(outer.type, RewardCelebration);
  assert.equal(outer.props.summary.earned, 25);
});
