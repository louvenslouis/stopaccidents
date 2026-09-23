import { useMapWeather } from "@/features/map/use-map-weather";
import { useAppLocation } from "@/features/location/app-location";
import { reverseGeocodeZone } from "@/features/accident-report/reverse-geocode";
import {
  weatherCondition,
  weatherPoint,
  type WeatherPoint,
} from "@/features/map/weather";
import Cloud from "lucide-react-native/icons/cloud";
import CloudFog from "lucide-react-native/icons/cloud-fog";
import CloudLightning from "lucide-react-native/icons/cloud-lightning";
import CloudMoon from "lucide-react-native/icons/cloud-moon";
import CloudRain from "lucide-react-native/icons/cloud-rain";
import CloudSnow from "lucide-react-native/icons/cloud-snow";
import CloudSun from "lucide-react-native/icons/cloud-sun";
import Moon from "lucide-react-native/icons/moon";
import Sun from "lucide-react-native/icons/sun";
import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

const icons = {
  sun: Sun,
  moon: Moon,
  cloud: Cloud,
  "cloud-sun": CloudSun,
  "cloud-moon": CloudMoon,
  fog: CloudFog,
  rain: CloudRain,
  snow: CloudSnow,
  storm: CloudLightning,
};

function forecastHour(time: number) {
  return new Date(time).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Port-au-Prince",
  });
}

export function MapWeather({ center }: { center: WeatherPoint }) {
  const { location } = useAppLocation();
  const result = useMapWeather(location?.coordinates ?? center);
  const roundedCenter = weatherPoint(center);
  const centerKey = `${roundedCenter.latitude},${roundedCenter.longitude}`;
  const [centerZone, setCenterZone] = useState<{
    key: string;
    name: string | null;
  } | null>(null);
  useEffect(() => {
    if (location) return;
    let active = true;
    const timeout = setTimeout(() => {
      void reverseGeocodeZone(
        roundedCenter.latitude,
        roundedCenter.longitude,
      ).then((name) => {
        if (active) setCenterZone({ key: centerKey, name });
      });
    }, 650);
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [centerKey, location, roundedCenter.latitude, roundedCenter.longitude]);
  const zone = location
    ? location.location
    : centerZone?.key === centerKey
      ? centerZone.name
      : null;
  const locationLabel =
    zone?.split(",")[0].trim() ||
    (location ? "Zone à préciser" : "Centre de la carte");
  const weather = result?.weather;
  const forecastLabel = weather?.precipitation
    .map(
      (hour) =>
        `${forecastHour(hour.time)}, ${
          hour.probability === null
            ? "indisponible"
            : `${Math.round(hour.probability)} pour cent`
        }`,
    )
    .join(" ; ");
  const condition = weather
    ? weatherCondition(weather.code, weather.isDay)
    : null;
  const Icon = condition ? icons[condition.icon] : Cloud;
  return (
    <View style={styles.card}>
      <View
        style={styles.row}
        accessible
        accessibilityLabel={
          weather && condition
            ? `Météo — ${locationLabel} : ${Math.round(weather.temperature)} degrés Celsius, ${condition.label}, vent ${Math.round(weather.windSpeed)} kilomètres par heure`
            : result?.error
              ? "Météo indisponible"
              : "Chargement de la météo"
        }
      >
        <Icon size={21} color="#596975" strokeWidth={1.6} />
        <Text style={styles.temperature}>
          {weather ? `${Math.round(weather.temperature)}°` : "—"}
        </Text>
        <Text style={styles.condition} numberOfLines={1}>
          {condition?.label ?? (result?.error ? "Indisponible" : "Météo…")}
        </Text>
      </View>
      <Text style={styles.detail}>
        {weather ? `Vent ${Math.round(weather.windSpeed)} km/h · ` : ""}{locationLabel}
      </Text>
      {weather &&
        (weather.precipitation.length === 3 ? (
          <View
            style={styles.forecast}
            accessible
            accessibilityLabel={`Probabilité de précipitations pour les trois prochaines heures : ${forecastLabel}`}
          >
            <Text style={styles.forecastTitle}>
              Risque de pluie · 3 prochaines heures
            </Text>
            <View style={styles.forecastHours}>
              {weather.precipitation.map((hour) => (
                <View key={hour.time} style={styles.forecastHour}>
                  <Text style={styles.forecastTime}>
                    {forecastHour(hour.time)}
                  </Text>
                  <Text style={styles.forecastProbability}>
                    {hour.probability === null
                      ? "—"
                      : `${Math.round(hour.probability)} %`}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : (
          <Text style={styles.detail}>Prévisions de pluie indisponibles</Text>
        ))}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Source météo : Open-Meteo"
        hitSlop={8}
        onPress={() =>
          void Linking.openURL("https://open-meteo.com/").catch(() => undefined)
        }
      >
        <Text style={styles.source}>Open-Meteo</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 240,
    maxWidth: 260,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 3,
    backgroundColor: "rgba(255,255,255,0.94)",
    borderWidth: 1,
    borderColor: "rgba(218,225,228,0.8)",
    shadowColor: "#263846",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  temperature: {
    color: "#283842",
    fontSize: 22,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  condition: { color: "#4B5C67", fontSize: 12, flexShrink: 1 },
  detail: { color: "#64727D", fontSize: 10, lineHeight: 15 },
  forecast: { marginTop: 5, gap: 4 },
  forecastTitle: { color: "#64727D", fontSize: 10, lineHeight: 15 },
  forecastHours: { flexDirection: "row", gap: 6 },
  forecastHour: {
    flex: 1,
    alignItems: "center",
    borderRadius: 7,
    backgroundColor: "#F0F5F8",
    paddingVertical: 4,
  },
  forecastTime: { color: "#64727D", fontSize: 10 },
  forecastProbability: {
    color: "#283842",
    fontSize: 12,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  source: {
    color: "#64727D",
    fontSize: 10,
    lineHeight: 15,
    textDecorationLine: "underline",
  },
});
