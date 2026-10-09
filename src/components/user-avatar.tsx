import { useId } from 'react';
import { Platform } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { avatarOptions, parseAvatar, type AvatarConfig } from '@/features/profile/avatar';

function tint(hex: string, target: string, amount: number) {
  const channels = [1, 3, 5].map((offset) => Math.round(
    parseInt(hex.slice(offset, offset + 2), 16) * (1 - amount) + parseInt(target.slice(offset, offset + 2), 16) * amount,
  ).toString(16).padStart(2, '0'));
  return `#${channels.join('')}`;
}

const facePaths = {
  oval: 'M54 87C54 60 74 47 100 47C128 47 148 64 147 91L143 125C139 150 119 166 100 167C80 166 60 150 57 125Z',
  round: 'M51 89C51 60 72 47 100 47C131 47 150 65 150 93L148 120C147 150 124 166 100 166C73 166 51 149 51 121Z',
  square: 'M53 87C53 60 73 47 100 47C128 47 148 63 147 91L145 134Q145 149 130 158Q100 174 70 158Q55 149 55 134Z',
};
const curls = [[65, 56, 15], [82, 43, 17], [103, 40, 17], [124, 44, 17], [141, 57, 14], [59, 73, 10], [147, 75, 10], [73, 64, 12], [94, 57, 14], [116, 59, 13], [134, 66, 11]];
const garmentPath = 'M79 161Q47 161 34 182L27 205H174L167 182Q155 162 121 161Q100 181 79 161Z';

// Layered local vectors stay crisp at badge size and work without a network connection.
export function UserAvatar({ avatar: value, size = 96 }: { avatar: AvatarConfig; size?: number }) {
  const avatar = parseAvatar(value);
  const prefix = `avatar${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const fill = (name: string) => `url(#${prefix}${name})`;
  const skin = avatarOptions.skin.find(({ id }) => id === avatar.skin)!.color;
  const hair = avatarOptions.hairColor.find(({ id }) => id === avatar.hairColor)!.color;
  const eyes = avatarOptions.eyeColor.find(({ id }) => id === avatar.eyeColor)!.color;
  const clothes = avatarOptions.clothingColor.find(({ id }) => id === avatar.clothingColor)!.color;
  const background = avatarOptions.background.find(({ id }) => id === avatar.background)!.color;
  const frames = avatarOptions.glassesColor.find(({ id }) => id === avatar.glassesColor)!.color;
  const headwear = avatarOptions.headwearColor.find(({ id }) => id === avatar.headwearColor)!.color;
  const wearingHeadwear = avatar.headwear !== 'none';
  const hairFill = fill('hair');
  const shine = tint(hair, '#FFFFFF', 0.22);
  const ink = '#3C2B30';
  const longHair = ['long', 'bob', 'waves'].includes(avatar.hair);
  const sweptHair = longHair || ['bun', 'ponytail', 'puffs'].includes(avatar.hair);
  const eyesClosed = avatar.expression === 'laugh';
  const sunglasses = avatar.glasses === 'sun';
  return (
    <Svg width={size} height={size} viewBox="0 0 200 200" {...(Platform.OS === 'web' ? { 'aria-hidden': true as const } : { accessible: false })}>
      <Defs>
        <ClipPath id={`${prefix}crop`}><Circle cx="100" cy="100" r="100" /></ClipPath>
        <ClipPath id={`${prefix}hairline`}><Rect x="0" y="76" width="200" height="124" /></ClipPath>
        <ClipPath id={`${prefix}garment`}><Path d={garmentPath} /></ClipPath>
        <LinearGradient id={`${prefix}background`} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0" stopColor={tint(background, '#FFFFFF', 0.38)} /><Stop offset="1" stopColor={background} />
        </LinearGradient>
        <RadialGradient id={`${prefix}skin`} cx="35%" cy="28%" r="78%">
          <Stop offset="0" stopColor={tint(skin, '#FFE9D5', 0.23)} /><Stop offset="0.65" stopColor={skin} />
          <Stop offset="1" stopColor={tint(skin, '#623A32', 0.18)} />
        </RadialGradient>
        <LinearGradient id={`${prefix}hair`} x1="15%" y1="0%" x2="85%" y2="100%">
          <Stop offset="0" stopColor={tint(hair, '#FFFFFF', 0.12)} /><Stop offset="0.5" stopColor={hair} />
          <Stop offset="1" stopColor={tint(hair, '#171321', 0.35)} />
        </LinearGradient>
        <LinearGradient id={`${prefix}clothes`} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0" stopColor={tint(clothes, '#FFFFFF', 0.18)} /><Stop offset="1" stopColor={tint(clothes, '#1E2436', 0.2)} />
        </LinearGradient>
        <LinearGradient id={`${prefix}lenses`} x1="0%" y1="0%" x2="70%" y2="100%">
          <Stop offset="0" stopColor="#526578" /><Stop offset="1" stopColor="#242936" />
        </LinearGradient>
        <LinearGradient id={`${prefix}headwear`} x1="0%" y1="0%" x2="100%" y2="100%">
          <Stop offset="0" stopColor={tint(headwear, '#FFFFFF', 0.25)} /><Stop offset="1" stopColor={tint(headwear, '#352B35', 0.2)} />
        </LinearGradient>
        <LinearGradient id={`${prefix}straw`} x1="0%" y1="0%" x2="30%" y2="100%">
          <Stop offset="0" stopColor="#F5DFAD" /><Stop offset="0.55" stopColor="#E1BE7D" /><Stop offset="1" stopColor="#C49A57" />
        </LinearGradient>
      </Defs>
      <G clipPath={fill('crop')}>
        <Circle cx="100" cy="100" r="100" fill={avatar.backgroundPattern === 'plain' ? background : fill('background')} />
        {avatar.backgroundPattern === 'halo' && <>
          <Circle cx="100" cy="88" r="74" fill="#FFFFFF" opacity="0.28" />
          <Circle cx="100" cy="88" r="84" stroke="#FFFFFF" strokeWidth="1" opacity="0.35" fill="none" />
        </>}
        {avatar.backgroundPattern === 'dots' && <G fill="#FFFFFF" opacity="0.6">
          {[[26, 51, 4], [165, 36, 5], [176, 122, 4], [23, 144, 6], [138, 17, 3], [18, 95, 3], [162, 162, 3]].map(([cx, cy, r], index) => <Circle key={index} cx={cx} cy={cy} r={r} />)}
          <Path d="M40 24v10m-5-5h10M176 77v10m-5-5h10" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
        </G>}
        {avatar.backgroundPattern === 'arches' && <G fill="none" stroke="#FFFFFF" opacity="0.4" strokeWidth="12">
          <Path d="M-18 184V95a118 118 0 01236 0v89M8 184V96a92 92 0 01184 0v88" />
        </G>}
        <Ellipse cx="100" cy="197" rx="77" ry="16" fill="#303647" opacity="0.09" />
        <G clipPath={wearingHeadwear ? fill('hairline') : undefined}>
        {avatar.hair === 'afro' && <Path d="M45 118C26 110 29 89 34 79C22 65 38 47 48 43C44 26 67 22 77 25C87 11 110 15 118 22C140 13 153 29 154 38C178 39 181 60 172 73C185 92 173 112 158 118Z" fill={hairFill} />}
        {longHair && <Path d={avatar.hair === 'bob' ? 'M45 87Q42 31 100 30Q159 30 157 92L161 146Q149 165 127 153H71Q47 166 40 146Z' : avatar.hair === 'waves' ? 'M44 79Q40 30 99 30Q160 28 158 87Q177 111 162 130Q180 163 157 177Q138 187 126 164H72Q51 186 35 166Q22 149 38 132Q23 110 44 79Z' : 'M46 87Q39 33 99 29Q165 28 157 98L168 173Q155 188 133 170L67 174Q39 185 35 165Z'} fill={hairFill} />}
        {avatar.hair === 'bun' && <><Circle cx="104" cy="35" r="25" fill={hairFill} /><Path d="M87 21Q106 9 118 27M90 36Q110 20 120 37" stroke={shine} strokeWidth="2.5" fill="none" opacity="0.65" /></>}
        {avatar.hair === 'ponytail' && <><Path d="M122 44Q159 22 167 57Q169 82 159 104Q181 126 159 158Q171 117 146 111Q131 89 144 67Z" fill={hairFill} /><Ellipse cx="132" cy="46" rx="12" ry="7" fill={clothes} /></>}
        {avatar.hair === 'puffs' && <G fill={hairFill}>
          {[44, 156].map((cx) => <G key={cx}><Circle cx={cx} cy="51" r="25" /><Circle cx={cx - 14} cy="43" r="13" /><Circle cx={cx + 12} cy="36" r="13" /><Circle cx={cx + 15} cy="61" r="13" /><Path d={`M${cx - 13} 44q9 -14 21 -5`} stroke={shine} strokeWidth="3" fill="none" /></G>)}
        </G>}
        {['braids', 'locs'].includes(avatar.hair) && <G stroke={hair} strokeWidth={avatar.hair === 'locs' ? 15 : 12} strokeLinecap="round" fill="none">
          {[45, 57, 143, 155].map((x, i) => <G key={x}><Path d={`M${x} 73Q${x + (i < 2 ? -5 : 5)} 112 ${x} 162`} />
            <Path d={`M${x - 2} 83v68`} stroke={shine} strokeWidth="2" strokeDasharray={avatar.hair === 'braids' ? '3 5' : '14 5'} />
            {avatar.hair === 'braids' && <Path d={`M${x - 4} 151h8`} stroke="#E2BC72" strokeWidth="5" />}
          </G>)}
        </G>}
        </G>
        <Path d="M82 149L80 165Q100 184 120 165L117 149" fill={skin} />
        <Path d="M83 153Q100 169 117 153L118 161Q100 176 82 162Z" fill="#63382D" opacity="0.16" />
        <Path d={garmentPath} fill={avatar.clothing === 'overalls' ? '#F4EBD9' : fill('clothes')} />
        {avatar.clothing === 'gingham' && <G clipPath={fill('garment')} fill="none">
          <Path d="M40 164v44m16-44v44m16-44v44m16-44v44m16-44v44m16-44v44m16-44v44m16-44v44m16-44v44" stroke="#FFF4DF" strokeWidth="6" strokeOpacity="0.4" />
          <Path d="M26 174h148M26 188h148M26 202h148" stroke="#FFF4DF" strokeWidth="6" strokeOpacity="0.4" />
          <Path d="M48 164v44m32-44v44m32-44v44m32-44v44M26 181h148M26 195h148" stroke={tint(clothes, '#283D37', 0.4)} strokeOpacity="0.45" strokeWidth="1" />
        </G>}
        <Path d="M53 186l-4 18m98-18 4 18" stroke="#172D37" strokeOpacity="0.12" strokeWidth="2" strokeLinecap="round" />
        {avatar.clothing === 'tee' && <Path d="M79 162Q100 184 122 162" fill="none" stroke={tint(clothes, '#152D31', 0.25)} strokeWidth="5" />}
        {avatar.clothing === 'hoodie' && <>
          <Path d="M78 156Q56 157 61 176L80 188L100 177L120 188L141 176Q145 157 122 156L119 164Q100 183 81 164Z" fill={fill('clothes')} stroke={tint(clothes, '#1E2436', 0.2)} strokeWidth="2" />
          <Path d="M81 181v16m38-16v16" stroke="#FFF7E9" strokeWidth="2.5" strokeLinecap="round" /><Circle cx="81" cy="197" r="2" fill="#FFF7E9" /><Circle cx="119" cy="197" r="2" fill="#FFF7E9" />
        </>}
        {['shirt', 'gingham'].includes(avatar.clothing) && <>
          <Path d="M79 158L100 176L86 188L69 167ZM121 158L100 176L114 188L132 167Z" fill={tint(clothes, '#FFFFFF', 0.28)} />
          <Path d="M100 177v25" stroke="#FFFFFF" strokeOpacity="0.35" strokeWidth="2" /><Circle cx="104" cy="186" r="1.5" fill="#FFFFFF" /><Circle cx="104" cy="196" r="1.5" fill="#FFFFFF" />
        </>}
        {avatar.clothing === 'knit' && <>
          <Path d="M79 155Q100 163 121 155L124 174Q100 184 76 174Z" fill={fill('clothes')} />
          <Path d="M83 160v12m7-10v13m7-12v13m7-13v13m7-14v13m7-15v12" stroke="#FFFFFF" strokeOpacity="0.17" strokeWidth="2" />
        </>}
        {avatar.clothing === 'jacket' && <>
          <Path d="M81 163Q100 177 119 163L111 205H89Z" fill="#FFF4E3" />
          <Path d="M79 159L66 177L80 182L74 187L91 204L87 176ZM121 159L134 177L120 182L126 187L109 204L113 176Z" fill={tint(clothes, '#FFFFFF', 0.25)} />
        </>}
        {avatar.clothing === 'overalls' && <G clipPath={fill('garment')}>
          <Path d="M65 162L77 165L79 184H121L123 165L135 162L133 205H67Z" fill={fill('clothes')} />
          <Path d="M77 180H123V205H77Z" fill={fill('clothes')} />
          <Path d="M86 187h28v8q-14 10-28 0Z" fill="none" stroke="#F2DFC0" strokeWidth="1.5" strokeDasharray="2 2" />
          <Path d="M70 167l3 14m57-14-3 14" stroke="#F2DFC0" strokeWidth="1" strokeDasharray="2 2" />
          <Circle cx="75" cy="182" r="2.8" fill="#DEBA73" /><Circle cx="125" cy="182" r="2.8" fill="#DEBA73" />
        </G>}
        {avatar.clothing === 'blouse' && <>
          <Path d="M75 162Q100 181 125 162L131 170L125 179L118 176L112 181L105 178L99 183L92 178L85 181L79 176L72 179L68 170Z" fill={tint(clothes, '#FFFFFF', 0.32)} />
          <Path d="M76 168Q100 186 124 168" stroke={tint(clothes, '#735443', 0.32)} strokeWidth="1.5" strokeDasharray="2 3" fill="none" />
          <G stroke="#AE7654" strokeWidth="1.4" fill="none" strokeLinecap="round">
            {[56, 144].map((x) => <G key={x}><Path d={`M${x} 178v20m-4-18 4 4 4-4m-8 8 4 4 4-4`} /><Circle cx={x} cy="177" r="2" fill="#D9AA63" stroke="none" /></G>)}
          </G>
          <Path d="M93 179l7 5 7-5m-7 5-4 9m4-9 4 9" stroke={tint(clothes, '#735443', 0.4)} strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </>}
        <Ellipse cx="52" cy="108" rx="10" ry="16" fill={skin} /><Ellipse cx="148" cy="108" rx="10" ry="16" fill={skin} />
        <Path d="M49 104q-4 7 2 10m100-10q4 7-2 10" fill="none" stroke={tint(skin, '#6E3C32', 0.35)} strokeWidth="2.5" strokeLinecap="round" />
        <Path d={facePaths[avatar.face]} fill={fill('skin')} />
        <Ellipse cx="70" cy="124" rx="11" ry="6" fill="#DC7B78" opacity="0.23" /><Ellipse cx="131" cy="124" rx="11" ry="6" fill="#DC7B78" opacity="0.23" />
        {['short', 'full'].includes(avatar.beard) && <Path d={avatar.beard === 'full' ? 'M57 117Q62 126 72 131Q79 125 90 132Q100 137 110 132Q120 125 131 131Q141 124 144 117L140 142Q131 169 100 175Q70 169 60 144Z' : 'M59 128Q68 137 76 138Q100 155 125 138L141 128Q135 162 100 168Q67 162 59 128Z'} fill={hairFill} opacity={avatar.beard === 'short' ? 0.65 : 1} />}
        {avatar.beard === 'goatee' && <Path d="M87 148Q100 155 113 148L111 166Q100 174 89 165Z" fill={hairFill} />}
        <G fill="none" stroke={hair} strokeWidth="4" strokeLinecap="round">
          <Path d={avatar.expression === 'surprised' ? 'M66 87Q76 80 86 85' : 'M66 91Q77 86 86 91'} />
          <Path d={['wink', 'surprised'].includes(avatar.expression) ? 'M115 86Q126 80 135 87' : 'M115 91Q125 86 135 91'} />
        </G>
        {[77, 124].map((cx, index) => eyesClosed || (index === 1 && avatar.expression === 'wink') ? (
          <Path key={cx} d={`M${cx - 8} 108q8 -9 16 0`} stroke={ink} strokeWidth="3.2" strokeLinecap="round" fill="none" />
        ) : <G key={cx}>
          <Ellipse cx={cx} cy="107" rx="9" ry={avatar.expression === 'calm' ? 7 : 10} fill="#FFFCF5" />
          <Ellipse cx={cx + (index ? -1 : 1)} cy="108" rx="5.4" ry={avatar.expression === 'calm' ? 6 : 7.5} fill={eyes} />
          <Ellipse cx={cx + (index ? -1 : 1)} cy="109" rx="2.8" ry="4.5" fill="#27242C" />
          <Circle cx={cx + 2} cy="104.5" r="2.1" fill="#FFFFFF" />
          <Path d={`M${cx - 9} 104q8 -7 17 0`} stroke={ink} strokeOpacity="0.6" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </G>)}
        <Path d="M98 109l-4 12q5 5 12 0" fill="none" stroke={tint(skin, '#754538', 0.35)} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        {['joy', 'laugh'].includes(avatar.expression) ? <>
          <Path d="M83 134Q100 140 118 133Q116 155 101 156Q87 155 83 134Z" fill="#613238" />
          <Path d="M86 136Q102 141 115 135L112 142Q100 145 89 141Z" fill="#FFFCF4" />
          <Path d="M93 153Q102 145 111 152Q102 158 93 153" fill="#DA858D" />
        </> : avatar.expression === 'surprised' ? <Ellipse cx="101" cy="142" rx="7" ry="9" fill="#704048" />
          : avatar.expression === 'calm' ? <Path d="M89 138Q100 146 113 137" fill="none" stroke="#8B4D49" strokeWidth="3" strokeLinecap="round" /> : <>
            <Path d="M85 135Q100 143 117 134Q110 150 100 150Q91 149 85 135Z" fill="#874C4B" />
            <Path d="M89 137Q102 142 113 137Q103 148 89 137Z" fill="#FFFCF4" />
          </>}
        {['mustache', 'goatee'].includes(avatar.beard) && <Path d="M100 130Q91 125 86 133L79 137Q92 142 100 134Q110 142 122 136L115 133Q109 125 100 130Z" fill={hairFill} />}
        <G clipPath={wearingHeadwear ? fill('hairline') : undefined}>
        {avatar.hair === 'crop' && <><Path d="M51 94L51 69Q50 38 97 35Q153 29 150 70L148 94L138 70Q104 81 68 68L61 96Z" fill={hairFill} /><Path d="M65 57Q99 40 135 51" stroke={shine} strokeWidth="4" strokeLinecap="round" fill="none" /></>}
        {avatar.hair === 'curls' && <G>{curls.map(([cx, cy, r], i) => <G key={i}><Circle cx={cx} cy={cy} r={r} fill={hairFill} /><Path d={`M${cx - r / 2} ${cy - 2}q1 -8 ${r} -6`} fill="none" stroke={shine} strokeWidth="2.5" strokeLinecap="round" opacity="0.65" /></G>)}</G>}
        {avatar.hair === 'afro' && <><Path d="M49 91Q38 69 61 59Q65 41 86 49Q101 35 116 49Q139 40 146 62Q162 70 149 93L140 76Q103 72 62 79L58 95Z" fill={hairFill} /><Path d="M47 56q1-12 13-12m7-10q8-8 17-3m41 2q10-4 17 6" stroke={shine} strokeWidth="3" fill="none" strokeLinecap="round" /></>}
        {sweptHair && <>
          <Path d="M50 103Q41 58 76 42Q97 31 113 45Q141 39 152 73L148 115L139 94Q140 71 111 60Q94 80 64 83L58 115Z" fill={hairFill} />
          <Path d="M60 70Q80 46 100 49M122 54Q141 65 145 84" stroke={shine} strokeWidth="3" strokeLinecap="round" fill="none" />
          {avatar.hair === 'waves' && <Path d="M48 103q-8 17 0 30t-1 26m104-56q9 17 1 31t3 26" stroke={shine} strokeWidth="3" fill="none" />}
        </>}
        {avatar.hair === 'braids' && <>
          <Path d="M50 95Q41 41 100 35Q159 40 150 97L140 77Q120 75 100 54Q81 77 60 78Z" fill={hairFill} />
          <G fill="none" stroke={shine} strokeWidth="2.5" strokeLinecap="round">
            <Path d="M95 44Q75 57 57 64M89 42Q66 44 55 54M105 44Q125 57 143 64M111 42Q134 44 145 54M99 43v11" />
          </G>
        </>}
        {avatar.hair === 'locs' && <G strokeLinecap="round" fill="none">
          {[[-34, 80], [-19, 69], [-3, 73], [13, 64], [29, 78]].map(([dx, end]) => <G key={dx}><Path d={`M${99 + dx / 2} 40Q${99 + dx} 35 ${99 + dx * 1.3} ${end}`} stroke={hair} strokeWidth="17" /><Path d={`M${97 + dx / 2} 40Q${97 + dx} 39 ${97 + dx * 1.3} ${end - 6}`} stroke={shine} strokeWidth="2" /></G>)}
        </G>}
        {avatar.hair === 'pixie' && <><Path d="M52 97Q40 56 68 40Q109 18 143 45Q161 61 148 97L136 68Q115 84 89 78L101 64Q82 79 63 80Z" fill={hairFill} /><Path d="M61 61Q90 35 124 47M71 68Q90 65 99 56" stroke={shine} strokeWidth="3" fill="none" strokeLinecap="round" /></>}
        {avatar.hair === 'fade' && <><Path d="M52 94L52 65Q55 38 100 37Q145 36 149 65L147 94L136 73Q100 62 64 74L59 96Z" fill={hair} opacity="0.4" /><Path d="M58 69L59 53Q65 34 100 34Q138 33 143 54L143 69Q100 59 58 69Z" fill={hairFill} /><Path d="M68 50Q96 41 130 49" stroke={shine} strokeWidth="3" fill="none" strokeLinecap="round" /></>}
        {avatar.hair === 'sidepart' && <><Path d="M51 97Q43 48 80 38Q133 20 149 54L148 96L138 75L128 54Q105 81 63 77L59 99Z" fill={hairFill} /><Path d="M65 62Q99 64 124 43M130 46l10 20" stroke={shine} strokeWidth="3" fill="none" strokeLinecap="round" /></>}
        {avatar.hair === 'mohawk' && <><Path d="M53 93L57 67L64 68L60 96M141 96L135 68L143 67L148 92" fill={hair} opacity="0.45" /><Path d="M80 74L75 43L86 47L86 24L98 33L108 19L112 36L126 31L120 65L108 77Z" fill={hairFill} /><Path d="M94 62l5-22m8 18 5-16" stroke={shine} strokeWidth="3" strokeLinecap="round" /></>}
        </G>
        {['straw', 'wideStraw'].includes(avatar.headwear) && <>
          <Ellipse cx="100" cy="71" rx={avatar.headwear === 'wideStraw' ? 91 : 77} ry={avatar.headwear === 'wideStraw' ? 17 : 12} fill="#BF9457" opacity="0.2" />
          <Ellipse cx="100" cy="67" rx={avatar.headwear === 'wideStraw' ? 91 : 77} ry={avatar.headwear === 'wideStraw' ? 17 : 12} fill={fill('straw')} stroke="#C99F61" strokeWidth="1.5" />
          <Ellipse cx="100" cy="66" rx={avatar.headwear === 'wideStraw' ? 85 : 71} ry={avatar.headwear === 'wideStraw' ? 12 : 8} fill="none" stroke="#FFF0CB" strokeWidth="1.5" strokeDasharray="3 2" />
          <Path d={avatar.headwear === 'wideStraw' ? 'M57 63L63 39Q70 23 100 25Q132 23 139 39L144 63Q100 75 57 63Z' : 'M61 63L67 32Q100 22 132 32L140 63Q100 73 61 63Z'} fill={fill('straw')} />
          <G fill="none" stroke="#AF8143" strokeOpacity="0.35" strokeWidth="1.2" strokeDasharray="3 2">
            <Path d="M67 39Q100 49 135 39M64 46Q100 56 138 46M76 32l-6 24m16-26-3 28m14-29v29m13-28 3 28m9-26 6 24" />
          </G>
          <Path d="M63 52Q100 63 138 52L141 63Q100 75 60 63Z" fill={fill('headwear')} />
          <Path d="M65 54Q100 65 137 54" stroke="#FFFFFF" strokeOpacity="0.3" strokeWidth="1.5" fill="none" />
          <Path d="M129 57l12-2-2 11-9-5Z" fill={headwear} /><Circle cx="130" cy="60" r="2.3" fill={tint(headwear, '#FFFFFF', 0.25)} />
        </>}
        {avatar.headwear === 'headscarf' && <>
          <Path d="M47 86L45 61Q43 30 75 29Q100 15 124 31Q155 31 155 61L153 86Q128 77 105 65Q80 83 47 86Z" fill={fill('headwear')} />
          <Path d="M49 73Q88 68 121 35M56 52Q84 48 103 29M112 49Q133 54 151 72" stroke="#FFFFFF" strokeOpacity="0.23" strokeWidth="3" fill="none" strokeLinecap="round" />
          <Path d="M116 38Q109 13 127 20Q141 26 126 41Q151 20 154 37Q153 53 127 45Z" fill={headwear} />
          <Path d="M124 38q-6-13 1-13m6 16q13-9 15-5" stroke="#FFFFFF" strokeOpacity="0.25" strokeWidth="2" fill="none" strokeLinecap="round" />
          <Ellipse cx="124" cy="43" rx="7" ry="6" fill={tint(headwear, '#FFFFFF', 0.16)} />
          <Path d="M52 80Q84 76 104 62M114 65l34 15" stroke="#FFF0D7" strokeWidth="1.5" fill="none" strokeDasharray="2 4" />
        </>}
        {avatar.headwear === 'bandana' && <>
          <Path d="M148 60Q176 71 170 97L156 88L159 113Q141 90 146 73Z" fill={fill('headwear')} />
          <Path d="M50 79L51 54Q100 29 149 54L151 79Q100 65 50 79Z" fill={fill('headwear')} />
          <Path d="M55 72Q100 59 146 72" stroke="#FFF2D8" strokeWidth="1.5" strokeDasharray="2 3" fill="none" />
          <G fill="#FFF2D8" opacity="0.85">
            {[69, 89, 109, 129].map((cx, index) => <Path key={cx} d={`M${cx} ${index === 0 || index === 3 ? 54 : 48}l3 4-3 4-3-4Z`} />)}
          </G>
          <Ellipse cx="150" cy="68" rx="6" ry="7" fill={headwear} />
        </>}
        {avatar.earrings !== 'none' && <G>
          {[49, 151].map((cx) => <G key={cx}>
            {avatar.earrings === 'stud' && <>
              <Circle cx={cx} cy="122" r="4" fill="#FFF1CC" /><Circle cx={cx - 1} cy="121" r="1.3" fill="#FFFFFF" />
            </>}
            {['hoop', 'silverHoop'].includes(avatar.earrings) && <>
              <Ellipse cx={cx} cy="130" rx="7" ry="10" fill="none" stroke={avatar.earrings === 'silverHoop' ? '#8492A5' : '#B0823B'} strokeWidth="3.5" />
              <Path d={`M${cx - 4} 124q-4 7 1 12`} fill="none" stroke={avatar.earrings === 'silverHoop' ? '#EFF5FF' : '#FFE7A5'} strokeWidth="1.5" strokeLinecap="round" />
            </>}
            {avatar.earrings === 'drop' && <>
              <Circle cx={cx} cy="122" r="2.5" fill="#E0B666" /><Path d={`M${cx} 125l-5 9 5 6 5-6Z`} fill="#E3B968" /><Path d={`M${cx} 127l-2 7 2 3Z`} fill="#FFF0C5" />
            </>}
            {avatar.earrings === 'pearl' && <>
              <Circle cx={cx} cy="122" r="2.5" fill="#D3AB65" />
              <Path d={`M${cx} 123v6`} stroke="#D3AB65" strokeWidth="1.5" />
              <Circle cx={cx} cy="133" r="6" fill="#CBBFB2" />
              <Circle cx={cx - 0.6} cy="132.3" r="5.2" fill="#F8F2E6" />
              <Circle cx={cx - 2} cy="130.5" r="1.8" fill="#FFFFFF" />
            </>}
            {avatar.earrings === 'star' && <>
              <Circle cx={cx} cy="122" r="2.5" fill="#D5A552" />
              <Path d={`M${cx} 124v4`} stroke="#D5A552" strokeWidth="1.5" />
              <Path d={`M${cx} 126l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8Z`} fill="#E4BA6C" stroke="#B98C43" strokeWidth="0.7" strokeLinejoin="round" />
              <Path d={`M${cx} 129l-1.3 3.5-3.5.6`} fill="none" stroke="#FFF2C9" strokeWidth="1.2" strokeLinecap="round" />
            </>}
          </G>)}
        </G>}
        {avatar.glasses !== 'none' && <G stroke={frames} strokeWidth={avatar.glasses === 'aviator' ? 2.5 : 3.5} fill={sunglasses ? fill('lenses') : '#FFFFFF'} fillOpacity={sunglasses ? 1 : 0.12}>
          {avatar.glasses === 'round' ? <><Circle cx="77" cy="107" r="16" /><Circle cx="125" cy="107" r="16" /></>
            : avatar.glasses === 'catEye' ? <><Path d="M56 94L94 100L92 113Q88 125 69 119Z" /><Path d="M108 100L146 94L133 119Q114 125 110 113Z" /></>
              : avatar.glasses === 'aviator' ? <><Path d="M60 98Q74 93 93 100L91 113Q82 128 65 119Q58 114 60 98Z" /><Path d="M109 100Q128 93 142 98Q144 114 137 119Q120 128 111 113Z" /><Path d="M93 99h16" fill="none" /></>
                : <><Rect x="59" y="94" width="35" height="27" rx={sunglasses ? 9 : 6} /><Rect x="108" y="94" width="35" height="27" rx={sunglasses ? 9 : 6} /></>}
          <Path d="M94 104Q100 100 108 104M53 100L60 102M142 102L148 100" fill="none" />
          {sunglasses && <Path d="M66 100l9 1m40-1 9 1" stroke="#FFFFFF" strokeOpacity="0.5" strokeWidth="2" strokeLinecap="round" />}
        </G>}
      </G>
    </Svg>
  );
}
