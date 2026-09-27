import type { BoxShadowValue } from 'react-native';
import type { ThemeColorResolver } from '@/features/appearance/palette';

function shadows(values: BoxShadowValue[]): { boxShadow: string } {
  return { boxShadow: values.map(({ offsetX, offsetY, blurRadius = 0, spreadDistance = 0, color, inset }) =>
    `${offsetX}px ${offsetY}px ${blurRadius}px ${spreadDistance}px ${String(color)}${inset ? ' inset' : ''}`).join(', ') };
}

type Depth = 'card' | 'control' | 'raised' | 'inset';

// Shared depth system: subtle cards, recessed fields, and raised primary controls.
export function surfaceDepth(color: ThemeColorResolver, depth: Depth): { boxShadow: string } {
  const dark = color('#FFFFFF', 'surface') !== '#FFFFFF';
  const highlight = dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.78)';
  if (depth === 'inset') return shadows([
      { offsetX: 0, offsetY: 2, blurRadius: 4, color: dark ? 'rgba(0,0,0,0.24)' : 'rgba(28,40,52,0.07)', inset: true },
      { offsetX: 0, offsetY: -1, blurRadius: 1, color: highlight, inset: true },
    ]);
  const raised = depth === 'raised';
  const card = depth === 'card';
  return shadows([
      {
        offsetX: 0,
        offsetY: raised ? 5 : card ? 4 : 2,
        blurRadius: raised ? 11 : card ? 16 : 5,
        spreadDistance: raised ? -2 : card ? -5 : -1,
        color: dark ? 'rgba(0,0,0,0.32)' : raised ? 'rgba(39,47,61,0.18)' : 'rgba(39,47,61,0.09)',
      },
      { offsetX: 0, offsetY: 1, blurRadius: 1, color: highlight, inset: true },
      { offsetX: 0, offsetY: -1, blurRadius: raised ? 3 : 2, color: dark ? 'rgba(0,0,0,0.16)' : 'rgba(39,47,61,0.05)', inset: true },
    ]);
}
