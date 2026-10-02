import type { ReactNode } from 'react';
import { Platform, StyleSheet } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import AtSign from 'lucide-react-native/icons/at-sign';
import Check from 'lucide-react-native/icons/check';
import KeyRound from 'lucide-react-native/icons/key-round';
import Smile from 'lucide-react-native/icons/face-slightly-smiling';
import { View } from '@/features/language/native';
import { createThemedStyles, useThemeColor } from '@/features/appearance/theme-provider';
import { AppIcon } from './ui/app-icon';

const decorativeProps = Platform.OS === 'web'
  ? { 'aria-hidden': true as const }
  : { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const };

/** Decorative local vectors: no personal photo or remote image is needed. */
export function ProfileJourneyArt({ kind }: { kind: 'connection' | 'alias' }) {
  const color = useThemeColor();
  const styles = useStyles();
  const green = color('#267E70', 'success');
  const soft = color('#E0F0E8', 'successSoft');
  const paper = color('#FFFFFF', 'surface');
  const border = color('#D5E3DC', 'border');
  const coral = color('#D9654F', 'accent');
  return (
    <View style={styles.art} {...decorativeProps}>
      <Svg width="100%" height="100%" viewBox="0 0 360 180">
        <Ellipse cx="180" cy="88" rx="115" ry="78" fill={soft} />
        <Ellipse cx="180" cy="164" rx="105" ry="7" fill={green} opacity="0.08" />
        <Circle cx="65" cy="57" r="6" fill={coral} opacity="0.7" />
        <Circle cx="293" cy="119" r="4" fill={green} opacity="0.5" />
        <Path d="M286 34v12m-6-6h12M73 130v10m-5-5h10" stroke={green} strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
        <Path d="M65 100Q32 85 47 64M297 67q24 22 6 37" stroke={border} strokeWidth="2" strokeLinecap="round" strokeDasharray="4 7" fill="none" />
        {kind === 'connection' ? <>
          <G transform="rotate(-10 145 95)">
            <Rect x="82" y="34" width="142" height="119" rx="20" fill={green} opacity="0.12" />
            <Rect x="87" y="29" width="142" height="119" rx="20" fill={paper} stroke={border} strokeWidth="1.5" />
            <Circle cx="116" cy="58" r="6" fill={coral} />
            <Rect x="131" y="54" width="67" height="7" rx="3.5" fill={border} />
            <Rect x="105" y="80" width="104" height="43" rx="12" fill={soft} />
            {[119, 137, 155, 173, 191].map((x) => <Circle key={x} cx={x} cy="101" r="3.5" fill={green} />)}
          </G>
          <G transform="rotate(9 233 107)">
            <Path d="M232 50l48 18v36c0 29-21 46-48 57-27-11-48-28-48-57V68Z" fill={green} />
            <Path d="M232 60l38 14v30c0 22-15 36-38 47-23-11-38-25-38-47V74Z" fill="none" stroke="#FFFFFF" strokeOpacity="0.22" strokeWidth="1.5" />
            <Rect x="216" y="94" width="32" height="27" rx="8" fill="#FFFFFF" />
            <Path d="M222 94v-8a10 10 0 0120 0v8" stroke="#FFFFFF" strokeWidth="4" fill="none" strokeLinecap="round" />
            <Circle cx="232" cy="106" r="3" fill={green} />
            <Path d="M232 108v5" stroke={green} strokeWidth="2.5" strokeLinecap="round" />
          </G>
        </> : <>
          <G transform="rotate(7 194 90)">
            <Rect x="103" y="32" width="167" height="121" rx="21" fill={green} opacity="0.12" />
          </G>
          <G transform="rotate(-5 180 90)">
            <Rect x="92" y="24" width="174" height="123" rx="21" fill={paper} stroke={border} strokeWidth="1.5" />
            <Circle cx="128" cy="65" r="23" fill={soft} />
            <Circle cx="128" cy="59" r="8" fill={green} />
            <Path d="M113 80c1-16 29-16 30 0" fill={green} />
            <Rect x="164" y="51" width="72" height="7" rx="3.5" fill={border} />
            <Rect x="164" y="68" width="46" height="7" rx="3.5" fill={border} />
            <Rect x="111" y="104" width="131" height="24" rx="12" fill={soft} />
            {[127, 145, 163, 181, 199, 217].map((x) => <Circle key={x} cx={x} cy="116" r="3" fill={green} opacity="0.65" />)}
          </G>
          <G transform="rotate(10 262 130)">
            <Rect x="235" y="105" width="51" height="51" rx="17" fill={coral} />
            <Path d="M258 122a9 9 0 00-1 16c8 4 18-1 18-10 0-9-8-15-16-13-7 1-12 6-13 12-1 8 4 16 12 19m6-24v12c0 6 8 5 9-1" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" />
            <Circle cx="259" cy="129" r="5.5" fill="none" stroke="#FFFFFF" strokeWidth="2.5" />
          </G>
        </>}
        <Path d="M88 27l3-7 3 7 7 3-7 3-3 7-3-7-7-3Z" fill={coral} opacity="0.65" />
      </Svg>
    </View>
  );
}

export function ProfileJourneyProgress({ step }: { step: 0 | 1 | 2 }) {
  const styles = useStyles();
  const color = useThemeColor();
  const labels = ['Création du compte', 'Choix de l’alias', 'Création de l’avatar'];
  return (
    <View style={styles.progress} accessibilityRole="progressbar" accessibilityLabel={labels[step]}
      accessibilityValue={{ min: 1, max: 3, now: step + 1 }}>
      {[KeyRound, AtSign, Smile].map((icon, index) => (
        <View key={index} style={styles.progressSegment} {...decorativeProps}>
          {index > 0 && <View style={[styles.connector, index <= step && styles.connectorDone]} />}
          <View style={[styles.step, index === step && styles.currentStep, index < step && styles.doneStep]}>
            <AppIcon icon={index < step ? Check : icon} size={16}
              color={index < step ? '#FFFFFF' : index === step ? color('#267E70', 'success') : color('#99A59F', 'muted')} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function AvatarPortraitStage({ children }: { children: ReactNode }) {
  const styles = useStyles();
  const color = useThemeColor();
  return (
    <View style={styles.portraitStage}>
      <View style={[StyleSheet.absoluteFill, styles.decoration]} {...decorativeProps}>
        <Svg width="100%" height="100%" viewBox="0 0 340 246">
          <Circle cx="170" cy="123" r="119" fill={color('#E0F0E8', 'successSoft')} />
          <Circle cx="170" cy="123" r="112" fill="none" stroke={color('#267E70', 'success')} strokeOpacity="0.25" strokeDasharray="3 10" strokeWidth="1.5" />
          <Circle cx="62" cy="51" r="15" fill="#DDD5FA" /><Circle cx="62" cy="51" r="7" fill="#A396CE" />
          <Circle cx="279" cy="187" r="17" fill="#F5CDD4" /><Circle cx="279" cy="187" r="8" fill="#D98799" />
          <Circle cx="63" cy="193" r="6" fill="#C6ECD4" />
          <Path d="M276 41v18m-9-9h18" stroke={color('#D9654F', 'accent')} strokeWidth="3" strokeLinecap="round" />
        </Svg>
      </View>
      <View style={styles.portrait}>{children}</View>
    </View>
  );
}

const useStyles = createThemedStyles((color) => StyleSheet.create({
  decoration: { pointerEvents: 'none' },
  art: { pointerEvents: 'none', width: '100%', maxWidth: 360, height: 164, alignSelf: 'center' },
  progress: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginVertical: 4 },
  progressSegment: { flexDirection: 'row', alignItems: 'center' },
  connector: { height: 2, width: 35, backgroundColor: color('#E1E8E4', 'border') },
  connectorDone: { backgroundColor: color('#267E70', 'success') },
  step: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: color('#EEF1EF', 'surface') },
  currentStep: { backgroundColor: color('#E0F0E8', 'successSoft'), borderWidth: 1.5, borderColor: color('#267E70', 'success') },
  doneStep: { backgroundColor: '#267E70' },
  portraitStage: { width: '100%', maxWidth: 340, height: 246, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  portrait: { padding: 7, borderRadius: 112, backgroundColor: color('#FFFFFF', 'surface'), borderWidth: 1, borderColor: color('#D5E3DC', 'border') },
}));
