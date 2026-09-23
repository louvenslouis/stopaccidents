import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import ts from "typescript";

const compile = async (path) =>
  ts.transpileModule(await readFile(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
const source = await compile("src/features/map/weather.ts");
const hookSource = await compile("src/features/map/use-map-weather.ts");
const payload = (patch = {}) => ({
  current: {
    time: Math.floor(Date.now() / 1000),
    temperature_2m: 28.4,
    wind_speed_10m: 12.3,
    weather_code: 3,
    is_day: 1,
    ...patch,
  },
});
function service(fetch) {
  const exports = {};
  new Function("exports", "fetch", "process", source)(exports, fetch, {
    env: {},
  });
  return exports;
}

test("weather rejects missing, null, malformed or stale measurements instead of inventing values", () => {
  const { parseWeather, weatherCondition } = service();
  assert.equal(parseWeather(payload()).temperature, 28.4);
  assert.equal(
    parseWeather(payload({ temperature_2m: 0, wind_speed_10m: 0, is_day: 0 }))
      .isDay,
    false,
  );
  for (const value of [
    null,
    {},
    { current: null },
    payload({ temperature_2m: null }),
    payload({ weather_code: "3" }),
    payload({ wind_speed_10m: -1 }),
    payload({ is_day: 2 }),
    payload({ time: Math.floor(Date.now() / 1000) - 7200 }),
  ]) {
    assert.throws(() => parseWeather(value), /indisponible/);
  }
  assert.deepEqual(weatherCondition(0, false), {
    label: "Ciel dégagé",
    icon: "moon",
  });
  assert.equal(weatherCondition(95, true).label, "Orage");
  assert.equal(weatherCondition(65, true).label, "Pluie");
  assert.equal(weatherCondition(999, true).label, "Météo");
});

test("weather selects precipitation chances for the next three hourly slots", () => {
  const { parseWeather } = service();
  const now = Date.now();
  const currentHour = Math.floor(now / 3_600_000) * 3600;
  const forecast = {
    ...payload({ time: Math.floor(now / 1000) }),
    hourly: {
      time: [0, 1, 2, 3, 4].map((offset) => currentHour + offset * 3600),
      precipitation_probability: [99, 0, 25, 80, 100],
    },
  };
  assert.deepEqual(parseWeather(forecast, now).precipitation, [
    { time: (currentHour + 3600) * 1000, probability: 0 },
    { time: (currentHour + 7200) * 1000, probability: 25 },
    { time: (currentHour + 10800) * 1000, probability: 80 },
  ]);
  assert.deepEqual(parseWeather({
    ...forecast,
    hourly: { ...forecast.hourly, precipitation_probability: [99, null, 120, 80, 100] },
  }, now).precipitation, [
    { time: (currentHour + 3600) * 1000, probability: null },
    { time: (currentHour + 7200) * 1000, probability: null },
    { time: (currentHour + 10800) * 1000, probability: 80 },
  ]);
});

test("requests send rounded coordinates and metric units, cache nearby views, and preserve cancellation", async () => {
  const calls = [];
  const { readWeather } = service(async (url, options) => {
    calls.push({ url: new URL(url), options });
    return { ok: true, json: async () => payload() };
  });
  const controller = new AbortController();
  const point = { latitude: 18.54123, longitude: -72.34123 };
  const weather = await readWeather(point, controller.signal);
  assert.equal(weather.temperature, 28.4);
  assert.equal(calls[0].url.searchParams.get("latitude"), "18.54");
  assert.equal(calls[0].url.searchParams.get("longitude"), "-72.34");
  assert.equal(calls[0].url.searchParams.get("temperature_unit"), "celsius");
  assert.equal(calls[0].url.searchParams.get("wind_speed_unit"), "kmh");
  assert.equal(calls[0].url.searchParams.get("hourly"), "precipitation_probability");
  assert.equal(calls[0].url.searchParams.get("forecast_hours"), "5");
  assert.equal(calls[0].options.signal, controller.signal);
  assert.equal(calls[0].options.credentials, "omit");
  await readWeather({ ...point, latitude: 18.542 }, controller.signal);
  assert.equal(calls.length, 1);
  await readWeather({ ...point, latitude: 19 }, controller.signal);
  assert.equal(calls.length, 2);
});

test("HTTP errors and invalid responses are not cached, allowing the next refresh to recover", async () => {
  let calls = 0;
  const { readWeather } = service(async () => {
    calls++;
    return {
      ok: calls !== 1,
      json: async () =>
        calls === 2 ? payload({ temperature_2m: null }) : payload(),
    };
  });
  const point = { latitude: 18.54, longitude: -72.34 };
  const signal = new AbortController().signal;
  await assert.rejects(readWeather(point, signal));
  await assert.rejects(readWeather(point, signal));
  assert.equal((await readWeather(point, signal)).temperature, 28.4);
  assert.equal(calls, 3);
});

function hookFixture() {
  const hooks = [],
    timers = new Map(),
    requests = [];
  let cursor = 0,
    effect,
    cleanup,
    background,
    timerId = 0;
  const exports = {};
  new Function(
    "exports",
    "require",
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    hookSource,
  )(
    exports,
    (name) =>
      ({
        react: {
          useCallback: (fn) => fn,
          useState(initial) {
            const index = cursor++;
            if (!(index in hooks)) hooks[index] = initial;
            return [
              hooks[index],
              (next) => {
                hooks[index] = next;
              },
            ];
          },
        },
        "expo-router": {
          useFocusEffect: (fn) => {
            effect = fn;
          },
        },
        "react-native": {
          AppState: {
            currentState: "active",
            addEventListener: (_, fn) => {
              background = fn;
              return { remove() {} };
            },
          },
        },
        "./weather": {
          ...service(),
          readWeather: (point, signal) =>
            new Promise((resolve, reject) =>
              requests.push({ point, signal, resolve, reject }),
            ),
        },
      })[name],
    (fn, delay) => {
      const id = ++timerId;
      timers.set(id, { fn, delay });
      return id;
    },
    (id) => timers.delete(id),
    () => 1,
    () => {},
  );
  const render = (latitude = 18.54) => {
    cursor = 0;
    return exports.useMapWeather({ latitude, longitude: -72.34 });
  };
  return {
    render,
    requests,
    focus: () => {
      cleanup = effect();
    },
    blur: () => cleanup(),
    background: () => background("background"),
    timer(delay) {
      for (const [id, item] of timers)
        if (item.delay === delay) {
          timers.delete(id);
          item.fn();
          return;
        }
      assert.fail(`Missing ${delay} ms timer`);
    },
  };
}
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
};

test("changing area cancels old weather and ignores late responses", async () => {
  const f = hookFixture();
  f.render();
  f.focus();
  f.timer(650);
  f.blur();
  assert.equal(f.requests[0].signal.aborted, true);
  assert.equal(f.render(19), null);
  f.focus();
  f.timer(650);
  f.requests[1].resolve({ temperature: 25 });
  await flush();
  f.requests[0].resolve({ temperature: 31 });
  await flush();
  assert.equal(f.render(19).weather.temperature, 25);
  assert.equal(f.render(20), null);
  f.blur();
});

test("timeouts show unavailability and leaving/backgrounding cancels requests", async () => {
  const f = hookFixture();
  f.render();
  f.focus();
  f.timer(650);
  f.timer(8000);
  assert.equal(f.requests[0].signal.aborted, true);
  assert.equal(f.render().error, true);
  f.requests[0].resolve({ temperature: 30 });
  await flush();
  assert.equal(f.render().weather, null);
  f.blur();
  f.render();
  f.focus();
  f.timer(650);
  f.background();
  assert.equal(f.requests[1].signal.aborted, true);
  f.blur();
});
