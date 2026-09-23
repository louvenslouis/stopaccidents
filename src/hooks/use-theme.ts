/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useAppTheme } from '@/features/appearance/theme-provider';

export function useTheme() {
  return Colors[useAppTheme().scheme];
}
