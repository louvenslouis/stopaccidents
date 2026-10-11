/** Absolute deck coordinates keep the incoming card still when selection commits. */
export function reportDeckTransform(distance: number, width: number) {
  'worklet';
  const back = Math.max(0, distance);
  return {
    x: distance < 0 ? distance * width * 1.12 : distance <= 1 ? distance * 24 : 24 - (distance - 1) * 48,
    y: back * 10,
    rotation: distance < 0 ? distance * 15 : distance <= 1 ? distance * 4 : 4 - (distance - 1) * 8,
    scale: Math.max(0.86, 1 - back * 0.045),
    opacity: distance < 0 ? Math.max(0, 1 + distance) : Math.min(1, Math.max(0, 3 - distance)),
  };
}
