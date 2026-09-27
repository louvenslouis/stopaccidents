import { Stack } from 'expo-router';
import { useThemeColor } from '@/features/appearance/theme-provider';

export default function ProfileLayout() {
  const color = useThemeColor();
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color('#F7F7F7', 'background') } }} />;
}
