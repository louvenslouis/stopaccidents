import { View } from 'react-native';
import Svg, { Ellipse, Path, Rect } from 'react-native-svg';

/** Small sculpted illustration, kept vector-native on iOS, Android and web. */
export function TrophyArt() {
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><Svg width={92} height={104} viewBox="0 0 92 104">
    <Ellipse cx="47" cy="95" rx="31" ry="6" fill="#785C33" opacity={0.12} />
    <Path d="M27 25H12v12c0 14 11 20 23 19M65 25h15v12c0 14-11 20-23 19" fill="none" stroke="#CB8B39" strokeWidth="8" />
    <Path d="M26 22H12v12c0 14 11 20 23 19M64 22h15v12c0 14-11 20-23 19" fill="none" stroke="#F2C974" strokeWidth="6" />
    <Rect x="42" y="56" width="12" height="27" rx="4" fill="#CA8C3B" />
    <Rect x="39" y="55" width="9" height="27" rx="4" fill="#F4CC78" />
    <Path d="M25 16h44v22c0 18-9 27-22 27S25 56 25 38Z" fill="#CC8C3A" />
    <Path d="M22 12h44v22c0 18-9 27-22 27S22 52 22 34Z" fill="#F4C568" />
    <Path d="M25 15h16v26c0 8 3 13 6 17-13 0-22-8-22-24Z" fill="#FFE4A6" />
    <Rect x="20" y="10" width="48" height="7" rx="3.5" fill="#FFE4A6" />
    <Path d="m46 24 3.4 7 7.6 1.1-5.5 5.4 1.3 7.5-6.8-3.6-6.8 3.6 1.3-7.5-5.5-5.4 7.6-1.1Z" fill="#B67A2D" />
    <Path d="m44 22 3.4 7 7.6 1.1-5.5 5.4 1.3 7.5-6.8-3.6-6.8 3.6 1.3-7.5-5.5-5.4 7.6-1.1Z" fill="#FFF2CA" />
    <Rect x="28" y="79" width="40" height="13" rx="5" fill="#987143" />
    <Rect x="25" y="76" width="40" height="12" rx="5" fill="#E6BB76" />
    <Rect x="27" y="77" width="34" height="3" rx="1.5" fill="#FFDF9E" />
    <Path d="m77 7 2 5 5 2-5 2-2 5-2-5-5-2 5-2ZM11 62l2 4 4 2-4 2-2 4-2-4-4-2 4-2Z" fill="#E9BF74" />
  </Svg></View>;
}
