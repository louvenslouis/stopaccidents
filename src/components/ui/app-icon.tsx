import type { ComponentProps } from 'react';
import type Bell from 'lucide-react-native/icons/bell';
import { useThemeColor } from '@/features/appearance/theme-provider';

export type AppIconComponent = typeof Bell;

type AppIconProps = ComponentProps<AppIconComponent> & {
  icon: AppIconComponent;
};

export function AppIcon({
  color,
  icon: Icon,
  size = 24,
  strokeWidth = 2,
  ...props
}: AppIconProps) {
  const themeColor = useThemeColor();
  return <Icon color={color ?? themeColor('#111827', 'text')} size={size} strokeWidth={strokeWidth} {...props} />;
}
