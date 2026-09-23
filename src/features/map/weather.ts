export type WeatherPoint = { latitude: number; longitude: number };
export type Weather = {
  temperature: number;
  windSpeed: number;
  code: number;
  isDay: boolean;
  time: number;
  precipitation: { time: number; probability: number | null }[];
};

export const WEATHER_REFRESH_MS = 15 * 60 * 1000;
const endpoint =
  process.env.EXPO_PUBLIC_WEATHER_URL ||
  "https://api.open-meteo.com/v1/forecast";
const cache = new Map<string, { weather: Weather; expires: number }>();

// A roughly 1 km grid avoids requests for every small movement of the map/GPS.
export function weatherPoint(point: WeatherPoint): WeatherPoint {
  return {
    latitude: Number(point.latitude.toFixed(2)),
    longitude: Number(point.longitude.toFixed(2)),
  };
}

export function parseWeather(payload: unknown, now = Date.now()): Weather {
  const current = (payload as { current?: Record<string, unknown> } | null)
    ?.current;
  const number = (key: string) => {
    const value = current?.[key];
    if (typeof value !== "number" || !Number.isFinite(value))
      throw new Error("Météo indisponible");
    return value;
  };
  const time = number("time") * 1000;
  const temperature = number("temperature_2m");
  const windSpeed = number("wind_speed_10m");
  const code = number("weather_code");
  const day = number("is_day");
  if (
    now - time > 60 * 60 * 1000 ||
    time > now + WEATHER_REFRESH_MS ||
    windSpeed < 0 ||
    !Number.isInteger(code) ||
    (day !== 0 && day !== 1)
  ) {
    throw new Error("Météo indisponible");
  }
  const hourly = (payload as { hourly?: Record<string, unknown> } | null)?.hourly;
  const times = hourly?.time;
  const probabilities = hourly?.precipitation_probability;
  const precipitation =
    Array.isArray(times) && Array.isArray(probabilities)
      ? times
          .map((hour, index) => ({
            time: typeof hour === "number" ? hour * 1000 : NaN,
            probability: probabilities[index],
          }))
          .filter((hour) => Number.isFinite(hour.time) && hour.time > now)
          .slice(0, 3)
          .map((hour) => ({
            time: hour.time,
            probability:
              typeof hour.probability === "number" &&
              Number.isFinite(hour.probability) &&
              hour.probability >= 0 &&
              hour.probability <= 100
                ? hour.probability
                : null,
          }))
      : [];
  return { temperature, windSpeed, code, isDay: day === 1, time, precipitation };
}

export function weatherCondition(code: number, isDay: boolean) {
  if (code === 0 || code === 1)
    return {
      label: isDay ? "Ensoleillé" : "Ciel dégagé",
      icon: isDay ? "sun" : "moon",
    } as const;
  if (code === 2)
    return {
      label: "Éclaircies",
      icon: isDay ? "cloud-sun" : "cloud-moon",
    } as const;
  if (code === 3) return { label: "Couvert", icon: "cloud" } as const;
  if ([45, 48].includes(code))
    return { label: "Brouillard", icon: "fog" } as const;
  if ([51, 53, 55, 56, 57].includes(code))
    return { label: "Bruine", icon: "rain" } as const;
  if ([61, 63, 65, 66, 67].includes(code))
    return { label: "Pluie", icon: "rain" } as const;
  if ([80, 81, 82].includes(code))
    return { label: "Averses", icon: "rain" } as const;
  if ([71, 73, 75, 77, 85, 86].includes(code))
    return { label: "Neige", icon: "snow" } as const;
  if ([95, 96, 99].includes(code))
    return { label: "Orage", icon: "storm" } as const;
  return { label: "Météo", icon: "cloud" } as const;
}

export async function readWeather(
  point: WeatherPoint,
  signal: AbortSignal,
): Promise<Weather> {
  const rounded = weatherPoint(point);
  const key = `${rounded.latitude},${rounded.longitude}`;
  const saved = cache.get(key);
  if (saved && saved.expires > Date.now()) return saved.weather;
  const url = new URL(endpoint);
  url.searchParams.set("latitude", String(rounded.latitude));
  url.searchParams.set("longitude", String(rounded.longitude));
  url.searchParams.set(
    "current",
    "temperature_2m,weather_code,is_day,wind_speed_10m",
  );
  url.searchParams.set("hourly", "precipitation_probability");
  url.searchParams.set("forecast_hours", "5");
  url.searchParams.set("temperature_unit", "celsius");
  url.searchParams.set("wind_speed_unit", "kmh");
  url.searchParams.set("timeformat", "unixtime");
  const response = await fetch(url.toString(), {
    signal,
    credentials: "omit",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new Error("Météo indisponible");
  const weather = parseWeather(await response.json());
  if (!signal.aborted) {
    cache.delete(key);
    if (cache.size >= 32) cache.delete(cache.keys().next().value!);
    cache.set(key, {
      weather,
      expires: Math.min(
        Date.now() + WEATHER_REFRESH_MS,
        weather.time + 60 * 60 * 1000,
      ),
    });
  }
  return weather;
}
