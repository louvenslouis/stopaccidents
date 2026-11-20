import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";
const sources = Object.fromEntries(
  await Promise.all(
    ["api.ts", "use-report-draft.ts", "use-event-choice.tsx"].map(
      async (name) => [
        name,
        await readFile(`src/features/report-events/${name}`, "utf8"),
      ],
    ),
  ),
);
function compile(source, dependencies) {
  const exports = {};
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  new Function("require", "exports", outputText)(
    (name) => dependencies[name] ?? {},
    exports,
  );
  return exports;
}
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function harness() {
  let cursor = 0;
  const values = [],
    effects = [],
    pending = [];
  return {
    react: {
      useContext() { return null; },
      useState(initial) {
        const i = cursor++;
        if (!(i in values))
          values[i] = typeof initial === "function" ? initial() : initial;
        return [
          values[i],
          (v) => {
            values[i] = typeof v === "function" ? v(values[i]) : v;
          },
        ];
      },
      useRef(initial) {
        const i = cursor++;
        return (values[i] ??= { current: initial });
      },
      useEffect(fn, deps) {
        const i = cursor++;
        if (!effects[i] || deps.some((v, j) => v !== effects[i].deps[j]))
          pending.push(() => {
            effects[i]?.cleanup?.();
            effects[i] = { deps, cleanup: fn() };
          });
      },
    },
    render(fn) {
      cursor = 0;
      const result = fn();
      for (const run of pending.splice(0)) run();
      return result;
    },
    dispose() {
      for (const effect of effects) effect?.cleanup?.();
    },
  };
}
function storageFixture(initialUser = "owner") {
  const values = new Map(),
    callbacks = new Set();
  let user = initialUser,
    fail = false;
  return {
    values,
    setFail(v) {
      fail = v;
    },
    switchUser(id) {
      user = id;
      for (const callback of callbacks) callback("SIGNED_IN", { user: { id } });
    },
    auth: {
      getSession: async () => ({ data: { session: { user: { id: user } } } }),
      onAuthStateChange(fn) {
        callbacks.add(fn);
        return {
          data: {
            subscription: {
              unsubscribe() {
                callbacks.delete(fn);
              },
            },
          },
        };
      },
    },
    ensureReporter: async () => user,
    storage: {
      getItem: async (key) => values.get(key) ?? null,
      setItem: async (key, value) => {
        if (fail) throw new Error("disk full");
        values.set(key, value);
      },
      removeItem: async key => {
        if (fail) throw new Error("storage unavailable");
        values.delete(key);
      },
    },
  };
}
function draftHook(fixture, factory, testimony = null) {
  const h = harness();
  let active = true;
  const { useReportDraft } = compile(sources["use-report-draft.ts"], {
    react: { ...h.react, useContext: () => testimony },
    "@/lib/supabase": { supabase: { auth: fixture.auth } },
    "./api": { ensureReporter: fixture.ensureReporter },
    "./draft-storage": { draftStorage: fixture.storage },
  });
  return {
    render: () => h.render(() => useReportDraft("accident", factory, active)),
    dispose: h.dispose,
    setActive(v) {
      active = v;
    },
  };
}
test("after restart a new report is blank and explicitly resuming restores the same ID, step and photos", async () => {
  const f = storageFixture();
  let generated = 0;
  const factory = () => ({
    id: `draft-${++generated}`,
    coordinates: null,
    notes: "",
    photos: [],
  });
  const a = draftHook(f, factory);
  a.render();
  await flush();
  let state = a.render();
  assert.equal(state.ready, true);
  const draft = {
    ...state.draft,
    eventId: "event-1",
    eventChoiceMade: true,
    notes: "Témoignage",
    photos: [{ id: "photo-1", base64: "YWJj", uri: "blob:temporary" }],
  };
  state.setDraft(draft);
  state.setStep(2);
  state.setSavedSteps(2);
  state = a.render();
  await state.checkpoint(draft);
  a.dispose();
  const b = draftHook(f, factory);
  b.render();
  await flush();
  const fresh = b.render();
  assert.notEqual(fresh.draft.id, draft.id);
  assert.equal(fresh.step, 0);
  assert.equal(fresh.savedSteps, 0);
  assert.equal(fresh.draft.eventId, undefined);
  assert.equal(fresh.draft.notes, "");
  assert.deepEqual(fresh.draft.photos, []);
  fresh.resumeDraft();
  const restored = b.render();
  assert.equal(restored.draft.id, draft.id);
  assert.equal(restored.step, 2);
  assert.equal(restored.savedSteps, 2);
  assert.equal(restored.draft.eventId, "event-1");
  assert.equal(restored.draft.notes, "Témoignage");
  assert.equal(restored.draft.photos[0].uri, "data:image/jpeg;base64,YWJj");
  b.dispose();
});
test("opening and dismissing a new report preserves its predecessor until a new checkpoint succeeds", async () => {
  const f = storageFixture();
  const key = "stopaccidents.draft.owner.accident";
  const old = JSON.stringify({
    version: 1, step: 1, savedSteps: 1, receipt: null,
    draft: { id: "previous", coordinates: { latitude: 18.5, longitude: -72.3 }, eventId: "previous-event" },
  });
  f.values.set(key, old);
  let n = 0;
  const factory = () => ({ id: `fresh-${++n}`, coordinates: null });
  const first = draftHook(f, factory);
  first.render(); await flush();
  first.render(); await flush();
  first.dispose();
  assert.equal(f.values.get(key), old);

  const next = draftHook(f, factory);
  next.render(); await flush();
  let state = next.render();
  const fresh = { ...state.draft, coordinates: { latitude: 19, longitude: -73 } };
  state.setDraft(fresh);
  state = next.render();
  f.setFail(true);
  await assert.rejects(state.checkpoint(), /disk full/);
  assert.equal(f.values.get(key), old);
  assert.equal(typeof next.render().resumeDraft, "function");
  f.setFail(false);
  await state.checkpoint();
  state = next.render(); await flush();
  assert.equal(state.resumeDraft, undefined);
  assert.notEqual(fresh.id, "previous");
  assert.deepEqual(JSON.parse(f.values.get(key)).draft, fresh);
  next.dispose();
});
test("a completed receipt or an untouched draft opens directly as a fresh report", async () => {
  for (const receipt of ["previous", null]) {
    const f = storageFixture();
    f.values.set("stopaccidents.draft.owner.accident", JSON.stringify({
      version: 1, step: receipt ? 4 : 0, savedSteps: receipt ? 4 : 0, receipt,
      draft: { id: "previous", notes: "", photos: [], visitedStep: 0, coordinates: null },
    }));
    const a = draftHook(f, () => ({ id: "new", coordinates: null }));
    a.render(); await flush();
    const state = a.render();
    assert.equal(state.ready, true);
    assert.equal(state.receipt, null);
    assert.equal(state.resumeDraft, undefined);
    assert.equal(state.step, 0);
    assert.equal(state.draft.id, "new");
    a.dispose();
  }
});
test("cancel removes the offered draft only for this account and type, including after restart", async () => {
  const f = storageFixture();
  const key = "stopaccidents.draft.owner.accident";
  const saved = JSON.stringify({ version: 1, draft: { id: "old", coordinates: null, notes: "partial" }, step: 0, savedSteps: 0, receipt: null });
  f.values.set(key, saved);
  f.values.set("stopaccidents.draft.owner.fire", saved);
  f.values.set("stopaccidents.draft.other.accident", saved);
  const factory = () => ({ id: "new", coordinates: null });
  const a = draftHook(f, factory);
  a.render(); await flush();
  let state = a.render();
  assert.ok(state.resumeDraft);
  let closed = false;
  const close = () => { closed = true; a.setActive(false); };
  f.setFail(true);
  await assert.rejects(state.discardDraft(close), /storage unavailable/);
  assert.equal(closed, false);
  f.setFail(false);
  state = a.render();
  await state.discardDraft(close);
  assert.equal(closed, true);
  a.render(); await flush(); a.dispose();
  const b = draftHook(f, factory);
  b.render(); await flush();
  assert.equal(b.render().resumeDraft, undefined);
  await flush();
  assert.deepEqual([...f.values.keys()].sort(), ["stopaccidents.draft.other.accident", "stopaccidents.draft.owner.fire"]);
  b.dispose();
});
test("cancel waits for pending autosaves and prevents a late checkpoint from recreating a draft", async () => {
  const f = storageFixture();
  const a = draftHook(f, () => ({ id: "new", coordinates: null }));
  a.render(); await flush();
  let state = a.render();
  const writing = deferred();
  const save = f.storage.setItem;
  f.storage.setItem = async (...args) => { await writing.promise; await save(...args); };
  state.setDraft({ ...state.draft, notes: "partial" });
  state = a.render(); await flush();
  const checkpoint = state.checkpoint();
  const cancelled = state.discardDraft(() => a.setActive(false));
  await assert.rejects(checkpoint, /session|restauration/i);
  writing.resolve();
  await cancelled;
  a.render(); await flush();
  assert.equal(f.values.size, 0);
  a.dispose();
});
test("storage failure blocks the pre-submit checkpoint and does not replace the last durable draft", async () => {
  const f = storageFixture();
  const a = draftHook(f, () => ({ id: "persisted", coordinates: null }));
  a.render();
  await flush();
  let state = a.render();
  await state.checkpoint();
  f.setFail(true);
  state.setDraft({ ...state.draft, id: "not-durable" });
  state = a.render();
  await assert.rejects(state.checkpoint(), /disk full/);
  assert.equal(JSON.parse([...f.values.values()][0]).draft.id, "persisted");
  a.dispose();
});
test("switching accounts cannot restore or submit the other account’s draft", async () => {
  const f = storageFixture();
  let n = 0;
  const factory = () => ({ id: `fresh-${++n}`, coordinates: null });
  const a = draftHook(f, factory);
  a.render();
  await flush();
  let state = a.render();
  state.setDraft({ ...state.draft, notes: "private-A" });
  state = a.render();
  await state.checkpoint();
  const oldCheckpoint = state.checkpoint;
  f.switchUser("different-owner");
  await assert.rejects(oldCheckpoint(), /restauration|session/i);
  a.render();
  await flush();
  state = a.render();
  assert.equal(state.ready, true);
  assert.equal(state.draft.notes, undefined);
  await state.checkpoint();
  assert.equal(f.values.size, 2);
  a.dispose();
});
test("an unreadable saved draft blocks restoration instead of silently creating a duplicate", async () => {
  const f = storageFixture();
  f.values.set("stopaccidents.draft.owner.accident", "broken json");
  const a = draftHook(f, () => ({ id: "new", coordinates: null }));
  a.render();
  await flush();
  const state = a.render();
  assert.equal(state.ready, false);
  assert.match(state.storageError, /restaurer/);
  a.dispose();
});
test("an identity failure is not mislabeled as an unreadable draft", async () => {
  const f = storageFixture();
  f.ensureReporter = async () => {
    throw new Error(
      "Le signalement sans compte n’est pas encore activé. Réessayez après son activation.",
    );
  };
  const a = draftHook(f, () => ({ id: "new", coordinates: null }));
  a.render();
  await flush();
  const state = a.render();
  assert.equal(state.ready, false);
  assert.match(state.storageError, /sans compte.*pas encore activé/);
  assert.doesNotMatch(state.storageError, /restaurer le brouillon/);
  a.dispose();
});
function find(node, predicate) {
  if (!node || typeof node !== "object") return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) {
    const result = find(child, predicate);
    if (result) return result;
  }
  return null;
}
test("when a draft can be resumed the publication screen waits for the user's choice", async () => {
  const h = harness();
  let published = 0, resumed = 0;
  const jsx = (type, props) => ({ type, props });
  const { ReportContextStep } = compile(await readFile("src/components/report-context-step.tsx", "utf8"), {
    react: h.react,
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-native": {
      AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) },
      StyleSheet: { create: styles => styles },
    },
    "@/features/appearance/theme-provider": { createThemedStyles: () => () => ({}) },
    "@/features/language/native": { Pressable: "button", Text: "text" },
    "@/features/report-events/context": { publicationCountdown: () => assert.fail("unexpected countdown") },
  });
  const panel = h.render(() => ReportContextStep({
    active: true, busy: false, error: null,
    onPublish: () => published++, onResumeDraft: () => resumed++,
  }));
  const resume = find(panel, node => node.type === "button" && node.props.children?.props?.children === "Reprendre le brouillon");
  resume.props.onPress();
  assert.equal(resumed, 1);
  assert.equal(published, 0);
  find(panel, node => node.props.accessibilityLabel === "Publier").props.onPress();
  assert.equal(published, 1);
  h.dispose();
});
test("nearby choice requires an explicit response, supports a distinct event, and cancels on close", async () => {
  const h = harness();
  const events = [
    {
      id: "report",
      event_id: "existing",
      distance_m: 80,
      location_description: "Delmas",
      witness_count: 2,
      last_observed_at: "now",
    },
  ];
  const { useEventChoice } = compile(sources["use-event-choice.tsx"], {
    '@/features/appearance/theme-provider': {
      createThemedStyles: (factory) => () => factory((light) => light),
    },
    react: h.react,
    "react/jsx-runtime": {
      jsx: (type, props) => ({ type, props }),
      jsxs: (type, props) => ({ type, props }),
    },
    "@/features/language/native": { Pressable: "button" },
    "react-native": { StyleSheet: { create: (x) => x }, Pressable: "button" },
    "./api": { nearbyEvents: async () => events },
    "@/features/accident-report/presentation": {
      formatAccidentDate: () => "date",
      accidentTypeLabel: () => "Accident",
    },
  });
  let hook = h.render(() => useEventChoice("accident"));
  const draft = {
    id: "draft",
    coordinates: { latitude: 18.5, longitude: -72.3, accuracy: 9 },
  };
  let resolved = false;
  const promise = hook
    .choose(draft, new AbortController().signal)
    .then((value) => {
      resolved = true;
      return value;
    });
  await flush();
  assert.equal(resolved, false);
  hook = h.render(() => useEventChoice("accident"));
  find(hook.panel, (node) => node.type === "button").props.onPress();
  assert.equal((await promise).eventId, "existing");
  const next = hook.choose(draft, new AbortController().signal);
  await flush();
  hook = h.render(() => useEventChoice("accident"));
  find(
    hook.panel,
    (node) =>
      node.type === "button" &&
      find(
        node,
        (n) => n.props?.children === "Non, signaler un autre événement",
      ),
  ).props.onPress();
  assert.equal((await next).eventId, null);
  const controller = new AbortController();
  const cancelled = hook.choose(draft, controller.signal);
  await flush();
  controller.abort();
  await assert.rejects(cancelled, /annulée/);
  h.dispose();
});
test("event API passes the stable ID and chosen event, and surfaces association failures", async () => {
  const calls = [];
  let fail = false;
  const { prepareReportEvent } = compile(sources["api.ts"], {
    "@/lib/supabase": {
      supabase: {
        rpc: async (name, payload) => {
          calls.push({ name, payload });
          return { error: fail ? { code: "22023" } : null };
        },
      },
    },
  });
  const draft = {
    id: "same-id",
    eventId: "chosen-event",
    coordinates: { latitude: 18.5, longitude: -72.3, accuracy: 9 },
  };
  await prepareReportEvent("accident", draft);
  await prepareReportEvent("accident", draft);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[0].payload.p_event_id, "chosen-event");
  fail = true;
  await assert.rejects(prepareReportEvent("accident", draft), /plus proposé/);
});
test("reporter identity explains when anonymous sign-ins are disabled", async () => {
  const { ensureReporter } = compile(sources["api.ts"], {
    "@/lib/supabase": {
      supabase: {
        auth: {
          getSession: async () => ({ data: { session: null }, error: null }),
          signInAnonymously: async () => ({
            data: { user: null },
            error: { code: "anonymous_provider_disabled" },
          }),
        },
      },
    },
  });
  await assert.rejects(ensureReporter(), /sans compte.*pas encore activé/);
});


test("follow-up drafts skip location, isolate ordinary drafts and resume without copying old observations", async () => {
  const f = storageFixture();
  let counter = 0;
  const factory = () => ({ id: `new-${++counter}`, coordinates: null, notes: '', photos: [] });
  const normal = draftHook(f, factory);
  normal.render(); await flush(); let state = normal.render();
  state.setDraft({ ...state.draft, notes: 'Ordinary draft' });
  state = normal.render(); await state.checkpoint(); normal.dispose();
  const source = { id: 'source', report_kind: 'accident', event_id: 'event', latitude: 18.5, longitude: -72.3, location_description: 'Delmas' };
  const follow = draftHook(f, factory, source);
  follow.render(); await flush(); state = follow.render();
  assert.equal(state.step, 1); assert.equal(state.savedSteps, 0);
  assert.equal(state.draft.notes, ''); assert.equal(state.draft.sourceReportId, 'source');
  assert.deepEqual(state.draft.coordinates, { latitude: 18.5, longitude: -72.3, accuracy: null });
  assert.equal(state.draft.locationSource, 'manual');
  const id = state.draft.id;
  state.setDraft({ ...state.draft, notes: 'New testimony' });
  state = follow.render(); await state.checkpoint(); follow.dispose();
  const resumed = draftHook(f, factory, source);
  resumed.render(); await flush(); state = resumed.render();
  assert.equal(state.draft.id, id); assert.equal(state.draft.notes, 'New testimony'); resumed.dispose();
  const ordinary = draftHook(f, factory);
  ordinary.render(); await flush(); state = ordinary.render();
  assert.equal(state.draft.notes, '');
  state.resumeDraft(); state = ordinary.render();
  assert.equal(state.draft.notes, 'Ordinary draft'); ordinary.dispose();
});
