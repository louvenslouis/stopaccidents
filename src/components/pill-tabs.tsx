import {
  TabList,
  TabSlot,
  Tabs,
  TabTrigger,
  type TabListProps,
  type TabTriggerSlotProps,
} from 'expo-router/ui';
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { Ref } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const colors = {
  background: '#F7F7F7',
  bar: '#FFFFFF',
  active: '#FF5A45',
  activeBackground: '#FFF0EC',
  inactive: '#8A8A8E',
};

type TabButtonProps = TabTriggerSlotProps & {
  label: string;
  icon: SymbolViewProps['name'];
  ref?: Ref<View>;
};

function TabButton({ icon, isFocused, label, ...props }: TabButtonProps) {
  const color = isFocused ? colors.active : colors.inactive;

  return (
    <Pressable
      {...props}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.tabButton,
        isFocused && styles.tabButtonActive,
        pressed && styles.tabButtonPressed,
      ]}>
      <SymbolView name={icon} size={23} tintColor={color} weight="semibold" />
      <Text style={[styles.tabLabel, { color }]}>{label}</Text>
    </Pressable>
  );
}

function FloatingTabList(props: TabListProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      {...props}
      pointerEvents="box-none"
      style={[styles.tabBarPosition, { bottom: Math.max(insets.bottom, 12) + 8 }]}>
      <View style={styles.tabBar}>{props.children}</View>
    </View>
  );
}

export default function PillTabs() {
  return (
    <Tabs style={styles.container}>
      <TabSlot style={styles.content} />

      <TabList asChild>
        <FloatingTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton
              label="Accueil"
              icon={{ ios: 'house.fill', android: 'home', web: 'home' }}
            />
          </TabTrigger>

          <TabTrigger name="map" href="/carte" asChild>
            <TabButton label="Carte" icon={{ ios: 'map.fill', android: 'map', web: 'map' }} />
          </TabTrigger>

          <TabTrigger name="profile" href="/profil" asChild>
            <TabButton
              label="Profil"
              icon={{ ios: 'person.fill', android: 'person', web: 'person' }}
            />
          </TabTrigger>
        </FloatingTabList>
      </TabList>
    </Tabs>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    backgroundColor: colors.background,
  },
  tabBarPosition: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  tabBar: {
    width: '100%',
    maxWidth: 430,
    minHeight: 68,
    padding: 7,
    borderRadius: 34,
    backgroundColor: colors.bar,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#101828',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 8,
  },
  tabButton: {
    flex: 1,
    minHeight: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabButtonActive: {
    backgroundColor: colors.activeBackground,
  },
  tabButtonPressed: {
    opacity: 0.68,
  },
  tabLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
});
