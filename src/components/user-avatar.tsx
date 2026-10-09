import { useId } from 'react';
import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { avatarOptions, type AvatarConfig } from '@/features/profile/avatar';

// Local vector layers keep every combination available offline, on web and native.
export function UserAvatar({ avatar, size = 96 }: { avatar: AvatarConfig; size?: number }) {
  const prefix = useId().replace(/[^a-zA-Z0-9]/g, '');
  const fill = (name: string) => `url(#${prefix}${name})`;
  const skin = avatarOptions.skin.find(({ id }) => id === avatar.skin)!.color;
  const hair = avatarOptions.hairColor.find(({ id }) => id === avatar.hairColor)!.color;
  const longHair = avatar.hair === 'long' || avatar.hair === 'bob';
  const curls = [[65, 56, 15], [82, 43, 17], [103, 40, 17], [124, 44, 17], [141, 57, 14], [59, 73, 10], [147, 75, 10], [73, 64, 12], [94, 57, 14], [116, 59, 13], [134, 66, 11]];
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200" accessible={false}>
      <Defs>
        <RadialGradient id={`${prefix}shadow`} cx="50%" cy="50%" rx="50%" ry="50%">
          <Stop offset="0" stopColor="#272033" stopOpacity="0.28" /><Stop offset="1" stopColor="#272033" stopOpacity="0" />
        </RadialGradient>
        <RadialGradient id={`${prefix}skin`} cx="37%" cy="28%" r="78%">
          <Stop offset="0" stopColor="#FFFFFF" /><Stop offset="0.19" stopColor={skin} />
          <Stop offset="0.72" stopColor={skin} /><Stop offset="1" stopColor="#402218" />
        </RadialGradient>
        <RadialGradient id={`${prefix}hair`} cx="32%" cy="20%" r="85%">
          <Stop offset="0" stopColor={hair} /><Stop offset="0.48" stopColor={hair} />
          <Stop offset="1" stopColor="#120F13" />
        </RadialGradient>
        <LinearGradient id={`${prefix}shine`} x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.28" /><Stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
        </LinearGradient>
        <RadialGradient id={`${prefix}nose`} cx="35%" cy="25%" r="80%">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.35" /><Stop offset="0.55" stopColor={skin} />
          <Stop offset="1" stopColor="#653326" stopOpacity="0.55" />
        </RadialGradient>
      </Defs>
      <Ellipse cx="101" cy="184" rx="43" ry="10" fill={fill('shadow')} />
      {avatar.hair === 'afro' && <Path d="M45 118C26 110 29 89 34 79C22 65 38 47 48 43C44 26 67 22 77 25C87 11 110 15 118 22C140 13 153 29 154 38C178 39 181 60 172 73C185 92 173 112 158 118Z" fill={fill('hair')} />}
      {longHair && <Path d={avatar.hair === 'long' ? 'M46 87Q39 33 99 29Q165 28 157 98L168 163Q155 183 133 166L67 170Q39 179 35 155Z' : 'M45 87Q42 31 100 30Q159 30 157 92L161 146Q149 165 127 153H71Q47 166 40 146Z'} fill={fill('hair')} />}
      {avatar.hair === 'bun' && <><Circle cx="104" cy="37" r="25" fill={fill('hair')} /><Path d="M47 96Q42 41 100 42Q158 40 155 101Z" fill={fill('hair')} /></>}
      <Path d="M84 146L82 162Q99 178 118 162L115 145" fill={fill('skin')} />
      <Ellipse cx="52" cy="108" rx="10" ry="16" fill={fill('skin')} />
      <Ellipse cx="148" cy="108" rx="10" ry="16" fill={fill('skin')} />
      <Path d="M54 87C54 60 74 47 100 47C128 47 148 64 147 91L143 125C139 150 119 166 100 167C80 166 60 150 57 125Z" fill={fill('skin')} />
      <Ellipse cx="71" cy="125" rx="12" ry="7" fill="#D86A61" opacity="0.17" />
      <Ellipse cx="131" cy="125" rx="12" ry="7" fill="#D86A61" opacity="0.17" />
      {avatar.beard !== 'none' && <Path d={avatar.beard === 'full' ? 'M57 117Q62 126 72 131Q79 125 90 132Q100 137 110 132Q120 125 131 131Q141 124 144 117L140 142Q131 169 100 175Q70 169 60 144Z' : 'M59 128Q68 137 76 138Q100 155 125 138L141 128Q135 162 100 168Q67 162 59 128Z'} fill={fill('hair')} opacity={avatar.beard === 'short' ? 0.7 : 1} />}
      <G fill="none" stroke={hair} strokeWidth="5" strokeLinecap="round">
        <Path d="M65 92Q76 85 86 91" /><Path d={avatar.expression === 'wink' ? 'M114 88Q126 82 136 90' : 'M114 91Q125 85 136 92'} />
      </G>
      <Ellipse cx="77" cy="106" rx="10" ry="11" fill="#FFFBF5" />
      <Ellipse cx="79" cy="107" rx="5.5" ry="7.5" fill="#4A332A" /><Ellipse cx="80" cy="108" rx="3.5" ry="5.5" fill="#211B20" />
      <Circle cx="81" cy="104" r="2.4" fill="#FFFFFF" />
      {avatar.expression === 'wink' ? <Path d="M115 108Q125 99 135 108" stroke="#3B2825" strokeWidth="3.5" strokeLinecap="round" fill="none" /> : <>
        <Ellipse cx="124" cy="106" rx="10" ry="11" fill="#FFFBF5" />
        <Ellipse cx="123" cy="107" rx="5.5" ry="7.5" fill="#4A332A" /><Ellipse cx="124" cy="108" rx="3.5" ry="5.5" fill="#211B20" />
        <Circle cx="125" cy="104" r="2.4" fill="#FFFFFF" />
      </>}
      <Path d="M97 105Q93 119 92 121Q100 128 109 121L103 105" fill={fill('nose')} />
      {avatar.expression === 'joy' ? <>
        <Path d="M82 134Q100 141 119 133Q117 156 101 157Q86 156 82 134Z" fill="#622D2E" />
        <Path d="M85 136Q102 141 116 135L113 142Q100 146 88 141Z" fill="#FFFAF0" />
        <Ellipse cx="102" cy="153" rx="8" ry="3" fill="#D98282" />
      </> : <>
        <Path d="M84 135Q100 143 118 134Q110 151 99 150Q90 149 84 135Z" fill="#763D38" />
        <Path d="M88 137Q102 143 114 137Q103 149 88 137Z" fill="#FFFAF0" />
      </>}
      {avatar.hair === 'crop' && <><Path d="M51 94L51 69Q50 38 97 35Q153 29 150 70L148 94L138 70Q104 81 68 68L61 96Z" fill={fill('hair')} /><Path d="M65 57Q99 40 135 51" stroke={fill('shine')} strokeWidth="7" strokeLinecap="round" fill="none" /></>}
      {avatar.hair === 'curls' && <G>{curls.map(([cx, cy, r], i) => <G key={i}><Circle cx={cx} cy={cy} r={r} fill={fill('hair')} /><Path d={`M${cx - r / 2} ${cy - 2}q1 -8 ${r} -6`} fill="none" stroke={fill('shine')} strokeWidth="3" strokeLinecap="round" /></G>)}</G>}
      {avatar.hair === 'afro' && <Path d="M49 91Q38 69 61 59Q65 41 86 49Q101 35 116 49Q139 40 146 62Q162 70 149 93L140 76Q103 72 62 79L58 95Z" fill={fill('hair')} />}
      {(longHair || avatar.hair === 'bun') && <>
        <Path d="M50 103Q41 58 76 42Q97 31 113 45Q141 39 152 73L148 115L139 94Q140 71 111 60Q94 80 64 83L58 115Z" fill={fill('hair')} />
        <Path d="M60 70Q80 46 100 49M122 54Q141 65 145 84" stroke={fill('shine')} strokeWidth="4" strokeLinecap="round" fill="none" />
      </>}
      {avatar.glasses !== 'none' && <G stroke="#302A34" strokeWidth="3.5" fill="#FFFFFF" fillOpacity="0.1">
        {avatar.glasses === 'round' ? <><Circle cx="77" cy="107" r="16" /><Circle cx="125" cy="107" r="16" /></> : <><Rect x="59" y="93" width="35" height="28" rx="7" /><Rect x="108" y="93" width="35" height="28" rx="7" /></>}
        <Path d="M94 104Q100 100 108 104M53 100L60 102M142 102L148 100" fill="none" />
      </G>}
    </Svg>
  );
}
