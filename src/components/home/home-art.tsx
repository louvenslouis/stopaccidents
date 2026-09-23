import Svg, { Circle, Path, Rect } from "react-native-svg";

/** Decorative route sketch, deliberately distinct from a geographic map. */
export function JourneyArt() {
  return (
    <Svg
      width="100%"
      height="120"
      viewBox="0 0 560 120"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path
        d="M0 83H560M0 39H560M64 0V120M175 0V120M310 0V120M455 0V120"
        stroke="#35554E"
        strokeWidth="1"
      />
      <Path
        d="M80 82H182C208 82 208 34 234 34H363C389 34 389 82 415 82H484"
        fill="none"
        stroke="#365C52"
        strokeWidth="18"
        strokeLinecap="round"
      />
      <Path
        d="M80 82H182C208 82 208 34 234 34H363C389 34 389 82 415 82H484"
        fill="none"
        stroke="#C4EAB1"
        strokeWidth="3"
        strokeDasharray="5 7"
        strokeLinecap="round"
      />
      <Circle cx="80" cy="82" r="17" fill="#25473E" stroke="#769F8E" />
      <Circle cx="80" cy="82" r="5" fill="#D6EDCB" />
      <Circle cx="484" cy="82" r="17" fill="#FF7359" />
      <Path
        d="M479 84V78L484 74L489 78V84H486V80H482V84Z"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <Rect x="262" y="16" width="57" height="35" rx="17.5" fill="#D5ECC9" />
      <Path d="M283 39L291 25L298 39L291 35Z" fill="#23463D" />
    </Svg>
  );
}

export function RadarArt() {
  return (
    <Svg
      width="88"
      height="88"
      viewBox="0 0 88 88"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Circle cx="44" cy="44" r="41" fill="#F0F2E9" />
      <Circle cx="44" cy="44" r="31" fill="none" stroke="#D6DECD" />
      <Circle cx="44" cy="44" r="20" fill="none" stroke="#D6DECD" />
      <Path d="M44 12V76M12 44H76" stroke="#D6DECD" />
      <Circle cx="44" cy="44" r="8" fill="#284E42" />
      <Circle cx="44" cy="44" r="3" fill="#FFFFFF" />
      <Circle
        cx="61"
        cy="27"
        r="5"
        fill="#F27254"
        stroke="#F0F2E9"
        strokeWidth="3"
      />
      <Circle
        cx="20"
        cy="59"
        r="4"
        fill="#91AC82"
        stroke="#F0F2E9"
        strokeWidth="2"
      />
    </Svg>
  );
}
