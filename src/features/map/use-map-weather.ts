import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { AppState } from "react-native";

import {
  readWeather,
  weatherPoint,
  WEATHER_REFRESH_MS,
  type Weather,
  type WeatherPoint,
} from "./weather";

export function useMapWeather(center: WeatherPoint) {
  const { latitude, longitude } = weatherPoint(center);
  const key = `${latitude},${longitude}`;
  const [result, setResult] = useState<{
    key: string;
    weather: Weather | null;
    error: boolean;
  } | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      let request: AbortController | undefined;
      let debounce: ReturnType<typeof setTimeout>;
      let timeout: ReturnType<typeof setTimeout>;

      const load = async () => {
        request?.abort();
        clearTimeout(timeout);
        const controller = new AbortController();
        request = controller;
        timeout = setTimeout(() => {
          controller.abort();
          if (active) setResult({ key, weather: null, error: true });
        }, 8000);
        try {
          const weather = await readWeather(
            { latitude, longitude },
            controller.signal,
          );
          if (active && !controller.signal.aborted)
            setResult({ key, weather, error: false });
        } catch {
          if (active && !controller.signal.aborted)
            setResult({ key, weather: null, error: true });
        } finally {
          if (request === controller) clearTimeout(timeout);
        }
      };
      const schedule = () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => void load(), 650);
      };
      if (!AppState.currentState || AppState.currentState === "active")
        schedule();
      const interval = setInterval(() => {
        if (AppState.currentState === "active") schedule();
      }, WEATHER_REFRESH_MS);
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active") schedule();
        else {
          clearTimeout(debounce);
          clearTimeout(timeout);
          request?.abort();
        }
      });
      return () => {
        active = false;
        request?.abort();
        clearTimeout(debounce);
        clearTimeout(timeout);
        clearInterval(interval);
        subscription.remove();
      };
    }, [key, latitude, longitude]),
  );

  // Never show weather for the previous area while a new request is pending.
  return result?.key === key ? result : null;
}
