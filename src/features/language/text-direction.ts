// Directional controls can reverse Latin letters without changing their stored order.
// Keep accents, line breaks, joining characters and emoji intact.
export function normalizeTextDirection(value: string): string {
  return value.replace(/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');
}

export const leftToRightText = { direction: 'ltr', writingDirection: 'ltr' } as const;
