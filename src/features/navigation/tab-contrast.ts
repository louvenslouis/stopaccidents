export type RGB = [number, number, number];

export function parseHex(color: string): RGB {
  return [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16)) as RGB;
}

export function luminance(rgb: RGB) {
  const linear = rgb.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

export function contrastRatio(a: RGB, b: RGB) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// Estimate the known veil, without claiming to sample photos or native blur pixels.
export function glassBackground(background: string, dark: boolean): RGB {
  const veil: RGB = dark ? [20, 24, 30] : [255, 255, 255];
  return parseHex(background).map((channel, index) =>
    channel * 0.52 + veil[index] * 0.48) as RGB;
}

export function tabForeground(background: string, dark: boolean, previous?: string) {
  const surface = glassBackground(background, dark);
  const palette = dark
    ? ['#BFC8D4', '#E3E9F1', '#FFFFFF', '#171719']
    : ['#59616B', '#343B45', '#171719', '#FFFFFF'];
  const preferred = palette.find((color) => contrastRatio(parseHex(color), surface) >= 5)
    ?? (luminance(surface) > 0.179 ? '#000000' : '#FFFFFF');
  // A small margin prevents repeated switches near a section boundary.
  if (previous && previous !== preferred) {
    const oldRatio = contrastRatio(parseHex(previous), surface);
    const newRatio = contrastRatio(parseHex(preferred), surface);
    if (oldRatio >= 4.5 && newRatio < 5.5) return previous;
  }
  return preferred;
}
