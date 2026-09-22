import { Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";
import Check from "lucide-react-native/icons/check";
import { AppIcon } from "@/components/ui/app-icon";
import type { AccidentType } from "@/features/accident-report/model";

export const accidentTypes: {
  value: AccidentType;
  label: string;
  description: string;
}[] = [
  {
    value: "two_cars",
    label: "Deux voitures",
    description: "Collision entre voitures",
  },
  {
    value: "car_motorcycle",
    label: "Voiture et moto",
    description: "Moto à 2 roues",
  },
  {
    value: "car_pedestrian",
    label: "Voiture et piéton",
    description: "Une personne à pied",
  },
  {
    value: "car_tuktuk",
    label: "Voiture et tuk-tuk",
    description: "Moto à 3 roues",
  },
  {
    value: "single_car",
    label: "Voiture seule",
    description: "Sortie de route, obstacle…",
  },
  {
    value: "single_motorcycle",
    label: "Moto seule",
    description: "Chute, sortie de route…",
  },
  {
    value: "other",
    label: "Autre situation",
    description: "Camion, vélo, plusieurs véhicules…",
  },
];

function Car({ color = "#E76B55" }: { color?: string }) {
  return (
    <G>
      <Path
        d="M4 26 L10 13 Q12 10 18 10 H32 L44 25 L53 28 Q56 29 56 34 V42 H3 V31Z"
        fill={color}
      />
      <Path d="M14 14 H23 V25 H9Z M27 14 H31 L40 25 H27Z" fill="#DCEFF0" />
      <Rect x="46" y="30" width="8" height="5" rx="2" fill="#FFE8AB" />
      <Path d="M25 29 H30" stroke="#A54537" strokeWidth="2" />
      <Circle cx="13" cy="42" r="7" fill="#354456" />
      <Circle cx="45" cy="42" r="7" fill="#354456" />
      <Circle cx="13" cy="42" r="3" fill="#B9C7D0" />
      <Circle cx="45" cy="42" r="3" fill="#B9C7D0" />
    </G>
  );
}
function Moto() {
  return (
    <G
      stroke="#354456"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Circle cx="10" cy="40" r="9" fill="#ECF2F4" />
      <Circle cx="46" cy="40" r="9" fill="#ECF2F4" />
      <Path
        d="M10 40 L23 24 L32 39 H10 M32 39 L42 25 L46 40 M42 25 L38 14 H32"
        fill="none"
      />
      <Path d="M18 23 H33 L28 32 H17Z" fill="#E9AD48" stroke="#D19634" />
      <Path d="M15 21 H25" strokeWidth="5" />
    </G>
  );
}
function TukTuk() {
  return (
    <G>
      <Path d="M5 15 H32 L41 30 H47 V43 H4Z" fill="#E8AE4B" />
      <Path d="M7 17 H20 V32 H7Z M24 17 H30 L37 30 H24Z" fill="#DCEFF0" />
      <Path d="M2 14 Q2 9 7 9 H31 L36 15Z" fill="#354456" />
      <Path d="M22 16 V41" stroke="#B67F28" strokeWidth="2" />
      <Circle cx="10" cy="43" r="6" fill="#354456" />
      <Circle cx="22" cy="45" r="5" fill="#536477" />
      <Circle cx="43" cy="43" r="6" fill="#354456" />
      <Rect x="41" y="32" width="6" height="4" rx="1" fill="#FFF4CC" />
    </G>
  );
}
function Scene({ type }: { type: AccidentType }) {
  const paired = [
    "two_cars",
    "car_motorcycle",
    "car_pedestrian",
    "car_tuktuk",
  ].includes(type);
  return (
    <Svg width="116" height="116" viewBox="0 0 128 128" accessible={false}>
      <Ellipse cx="64" cy="91" rx="48" ry="6" fill="#DCE5E5" />
      {paired ? (
        <>
          <G transform="translate(9 50) scale(.92)">
            <Car />
          </G>
          {type === "two_cars" && (
            <G transform="translate(120 49) scale(-.92 .92)">
              <Car color="#6B9FAD" />
            </G>
          )}
          {type === "car_motorcycle" && (
            <G transform="translate(118 48) scale(-.85 .85)">
              <Moto />
            </G>
          )}
          {type === "car_tuktuk" && (
            <G transform="translate(119 46) scale(-.95 .95)">
              <TukTuk />
            </G>
          )}
          {type === "car_pedestrian" && (
            <G
              stroke="#354456"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <Circle cx="91" cy="44" r="7" fill="#D7A27E" stroke="none" />
              <Path d="M90 57 L87 73 L80 89 M87 73 L99 87" fill="none" />
              <Path
                d="M90 57 L101 68 M90 57 L80 65"
                fill="none"
                stroke="#6B9FAD"
                strokeWidth="7"
              />
            </G>
          )}
          <Path
            d="M58 45 L62 36 M67 45 L73 37 M54 40 L51 34"
            stroke="#E49D42"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      ) : type === "single_car" ? (
        <G transform="translate(30 40) rotate(-12 28 25) scale(1.2)">
          <Car />
        </G>
      ) : type === "single_motorcycle" ? (
        <G transform="translate(28 38) rotate(-18 28 25) scale(1.2)">
          <Moto />
        </G>
      ) : (
        <G>
          <G transform="translate(22 45)">
            <Car color="#6B9FAD" />
          </G>
          <Circle cx="92" cy="57" r="16" fill="#E8AE4B" />
          <Path
            d="M85 57 H99 M92 50 V64"
            stroke="#fff"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </G>
      )}
    </Svg>
  );
}
export function AccidentTypePicker({
  value,
  disabled = false,
  onChange,
}: {
  value: AccidentType | null;
  disabled?: boolean;
  onChange: (value: AccidentType) => void;
}) {
  return (
    <View style={styles.grid}>
      {accidentTypes.map((type) => {
        const selected = value === type.value;
        return (
          <Pressable
            key={type.value}
            accessibilityRole="radio"
            accessibilityLabel={`${type.label}. ${type.description}`}
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(type.value)}
            style={({ pressed }) => [
              styles.choice,
              (pressed || disabled) && { opacity: 0.6 },
            ]}
          >
            <View style={[styles.circle, selected && styles.selected]}>
              <Scene type={type.value} />
              {selected && (
                <View style={styles.check}>
                  <AppIcon icon={Check} size={15} color="#fff" />
                </View>
              )}
            </View>
            <Text style={[styles.label, selected && styles.selectedLabel]}>
              {type.label}
            </Text>
            <Text style={styles.description}>{type.description}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 20 },
  choice: { width: "47%", flexGrow: 0, alignItems: "center", gap: 5 },
  circle: {
    width: 122,
    height: 122,
    borderRadius: 61,
    borderWidth: 2,
    borderColor: "#E7ECEC",
    backgroundColor: "#F1F6F5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 3,
  },
  selected: { backgroundColor: "#FFF0E9", borderColor: "#D94235" },
  check: {
    position: "absolute",
    right: 2,
    bottom: 3,
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: "#D94235",
    borderWidth: 2,
    borderColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
    color: "#354456",
  },
  selectedLabel: { color: "#C6382C" },
  description: {
    fontSize: 11,
    lineHeight: 16,
    textAlign: "center",
    color: "#738093",
  },
});
