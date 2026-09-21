import type { ComponentProps } from 'react';
import type Bell from 'lucide-react-native/icons/bell';

export type AppIconComponent = typeof Bell;

type AppIconProps = ComponentProps<AppIconComponent> & {
  icon: AppIconComponent;
};

export function AppIcon({
  color = '#111827',
  icon: Icon,
  size = 24,
  strokeWidth = 2,
  ...props
}: AppIconProps) {
  return <Icon color={color} size={size} strokeWidth={strokeWidth} {...props} />;
}
