import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const source = await readFile("src/features/safety-profile/push.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function client(options = {}) {
  const storage = new Map();
  const calls = [];
  const listeners = {};
  const removed = [];
  let cleared = 0;
  let permission = { granted: true, canAskAgain: true };
  let user = { id: "owner", is_anonymous: false };
  let failure = null;
  const observe = (type) => (callback) => {
    listeners[type] = callback;
    return { remove: () => removed.push(type) };
  };
  const api = {
    AndroidImportance: { NONE: 0, HIGH: 4 },
    AndroidNotificationVisibility: { PRIVATE: 0 },
    IosAuthorizationStatus: { PROVISIONAL: 3 },
    setNotificationHandler: () => {},
    setNotificationChannelAsync: async (id) => calls.push({ channel: id }),
    getNotificationChannelAsync: async () => ({ importance: options.channelImportance ?? 4 }),
    getPermissionsAsync: async () => permission,
    requestPermissionsAsync: async () => {
      calls.push({ permissionRequested: true });
      return permission;
    },
    getExpoPushTokenAsync: async () => ({ data: "ExpoPushToken[test-device]" }),
    addNotificationResponseReceivedListener: observe("response"),
    addNotificationReceivedListener: observe("incoming"),
    addPushTokenListener: observe("token"),
    getLastNotificationResponseAsync: async () => {
      if (options.lastError) throw Error("read failed");
      return options.last ?? null;
    },
    clearLastNotificationResponseAsync: async () => { cleared += 1; },
  };
  const mocks = {
    "expo-constants": {
      executionEnvironment: options.environment ?? "standalone",
      expoConfig: { extra: { eas: { projectId: options.unconfigured ? undefined : "project" } } },
    },
    "expo-crypto": { randomUUID: () => "installation" },
    "expo-secure-store": {
      getItemAsync: async (key) => storage.get(key),
      setItemAsync: async (key, value) => { storage.set(key, value); },
      deleteItemAsync: async (key) => { storage.delete(key); },
    },
    "react-native": { Platform: { OS: "android" } },
    "@/lib/supabase": {
      supabase: { auth: { getSession: async () => ({ data: { session: { user } } }) } },
    },
    "./api": {
      safetyRpc: async (name, args) => {
        calls.push({ name, args });
        if (failure) throw failure;
      },
    },
    "expo-notifications": api,
  };
  const exports = {};
  new Function("exports", "require", "process", compiled)(exports, (name) => {
    assert.ok(name in mocks, `Unexpected dependency: ${name}`);
    return mocks[name];
  }, { env: {} });
  return {
    ...exports, storage, calls, listeners, removed,
    get cleared() { return cleared; },
    setPermission(value) { permission = value; },
    setUser(value) { user = value; },
    fail(value) { failure = value; },
  };
}

const notification = (type, identifier = "notification") => ({
  actionIdentifier: "default",
  notification: { request: { identifier, content: { data: { type, url: "/profil" } } } },
});

test("route and safety registration preserve independent consent on the same installation", async () => {
  const push = client();
  assert.equal(await push.enableDevicePush("owner", "route"), true);
  assert.equal(await push.enableSafetyPush("owner"), true);
  await push.disableSafetyPush();
  assert.equal(await push.getDevicePushStatus("owner", "route"), "enabled");
  assert.equal(await push.getDevicePushStatus("owner", "safety"), "disabled");
  assert.deepEqual(push.calls.filter((call) => call.name).map(({ name, args }) => [name, args.p_id]), [
    ["register_route_push_device", "installation"],
    ["register_safety_push_device", "installation"],
    ["unregister_safety_push_device", "installation"],
  ]);
  assert.deepEqual(push.calls.filter((call) => call.channel).map((call) => call.channel), ["route-alerts", "safety-alerts"]);
});

test("silent refresh requires consent for the current account and never requests permission", async () => {
  const push = client();
  assert.equal(await push.enableDevicePush("owner", "route", false), false);
  assert.equal(push.calls.length, 0);
  await push.enableDevicePush("owner", "route");
  assert.equal(await push.enableDevicePush("other", "route", false), false);
  assert.equal(await push.enableDevicePush("owner", "route", false), true);
  assert.equal(push.calls.filter((call) => call.name === "register_route_push_device").length, 2);
  assert.ok(!push.calls.some((call) => call.permissionRequested));
});

test("registration rejects anonymous or changed accounts, denied permissions and missing build configuration", async () => {
  for (const user of [{ id: "other" }, { id: "owner", is_anonymous: true }]) {
    const push = client();
    push.setUser(user);
    assert.equal(await push.enableDevicePush("owner", "route"), false);
    assert.ok(!push.calls.some((call) => call.name));
  }
  const denied = client();
  denied.setPermission({ granted: false, canAskAgain: false });
  await assert.rejects(denied.enableDevicePush("owner", "route"), /Autorisez les notifications/);
  assert.equal(await denied.getDevicePushStatus("owner", "route"), "denied");
  assert.ok(!denied.calls.some((call) => call.name));
  const unconfigured = client({ unconfigured: true });
  await assert.rejects(unconfigured.enableDevicePush("owner", "route"), /pas encore configurées/);
  assert.equal(await unconfigured.getDevicePushStatus("owner", "route"), "unconfigured");
  assert.equal(await client({ environment: "storeClient" }).getDevicePushStatus("owner", "route"), "unavailable");
  const blockedChannel = client({ channelImportance: 0 });
  assert.equal(await blockedChannel.getDevicePushStatus("owner", "route"), "denied");
  await assert.rejects(blockedChannel.enableDevicePush("owner", "route"), /Autorisez les notifications/);
  assert.ok(!blockedChannel.calls.some((call) => call.name));
});

test("failed opt-in and opt-out do not falsely persist a successful state", async () => {
  const push = client();
  push.fail(Error("network"));
  await assert.rejects(push.enableDevicePush("owner", "route"), /network/);
  assert.equal(await push.getDevicePushStatus("owner", "route"), "disabled");
  push.fail(null);
  await push.enableDevicePush("owner", "route");
  push.fail(Error("network"));
  await assert.rejects(push.disableDevicePush("route"), /network/);
  assert.equal(await push.getDevicePushStatus("owner", "route"), "enabled");
});

test("cold-start and live taps open only known alert destinations once, regardless of payload URLs", async () => {
  const push = client({ last: notification("route_alert") });
  const opened = [];
  const dispose = await push.listenForSafetyPush(() => opened.push("safety"), () => {}, {
    open: () => opened.push("route"), refresh: () => {},
  });
  assert.equal(push.cleared, 1);
  push.listeners.response(notification("route_alert"));
  push.listeners.response(notification("external_url", "unknown"));
  push.listeners.response(notification("safety_alert", "safety"));
  assert.deepEqual(opened, ["route", "safety"]);
  assert.equal(push.cleared, 3);
  dispose();
  push.listeners.response(notification("route_alert", "later"));
  assert.deepEqual(opened, ["route", "safety"]);
  assert.deepEqual(push.removed.sort(), ["incoming", "response", "token"]);
});

test("foreground route delivery refreshes its inbox; token rotation refreshes device registration", async () => {
  const push = client();
  let safety = 0, route = 0;
  const dispose = await push.listenForSafetyPush(() => {}, () => { safety += 1; }, {
    open: () => { throw Error("Receiving a push must not navigate automatically"); },
    refresh: () => { route += 1; },
  });
  push.listeners.incoming(notification("route_alert").notification);
  push.listeners.token();
  assert.equal(route, 1);
  assert.equal(safety, 1);
  dispose();
  push.listeners.incoming(notification("route_alert").notification);
  push.listeners.token();
  assert.equal(route, 1);
  assert.equal(safety, 1);
});

test("unknown cold-start notifications remain unconsumed and startup errors remove listeners", async () => {
  const unknown = client({ last: notification("unrelated") });
  const dispose = await unknown.listenForSafetyPush(() => { throw Error("unknown tap"); }, () => {});
  assert.equal(unknown.cleared, 0);
  dispose();
  const failed = client({ lastError: true });
  await assert.rejects(failed.listenForSafetyPush(() => {}, () => {}), /read failed/);
  assert.deepEqual(failed.removed.sort(), ["incoming", "response", "token"]);
});
