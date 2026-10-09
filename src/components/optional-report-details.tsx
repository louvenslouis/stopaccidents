import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from '@/features/language/native';
import { useThemeColor } from '@/features/appearance/theme-provider';

export function OptionalReportDetails({ children, hasValue, expanded = false }: {
  children: ReactNode;
  hasValue: boolean;
  expanded?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const color = useThemeColor();
  if (open || hasValue || expanded) return <View style={{ gap: 10 }}>{children}</View>;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: false }}
      onPress={() => setOpen(true)} style={{ minHeight: 44, justifyContent: 'center' }}>
      <Text style={{ color: color('#23766A', 'success'), fontWeight: '600' }}>Ajouter un détail</Text>
    </Pressable>
  );
}
