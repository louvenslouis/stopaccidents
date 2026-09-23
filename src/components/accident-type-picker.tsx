import { createThemedStyles } from '@/features/appearance/theme-provider';
import { Image } from 'expo-image';
import Check from 'lucide-react-native/icons/check';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AppIcon } from '@/components/ui/app-icon';
import type { AccidentType } from '@/features/accident-report/model';

export const accidentTypes: {
  value: AccidentType;
  label: string;
  description: string;
  illustration: number;
}[] = [
  {
    value: 'two_cars',
    label: 'Deux voitures',
    description: 'Collision entre voitures',
    illustration: require('../../assets/images/accident-types/two-cars.png'),
  },
  {
    value: 'car_motorcycle',
    label: 'Voiture et moto',
    description: 'Moto à 2 roues',
    illustration: require('../../assets/images/accident-types/car-motorcycle.png'),
  },
  {
    value: 'car_pedestrian',
    label: 'Voiture et piéton',
    description: 'Une personne à pied',
    illustration: require('../../assets/images/accident-types/car-pedestrian.png'),
  },
  {
    value: 'car_tuktuk',
    label: 'Voiture et tuk-tuk',
    description: 'Moto à 3 roues',
    illustration: require('../../assets/images/accident-types/car-tuktuk.png'),
  },
  {
    value: 'single_car',
    label: 'Voiture seule',
    description: 'Sortie de route ou obstacle',
    illustration: require('../../assets/images/accident-types/single-car.png'),
  },
  {
    value: 'single_motorcycle',
    label: 'Moto seule',
    description: 'Chute ou sortie de route',
    illustration: require('../../assets/images/accident-types/single-motorcycle.png'),
  },
  {
    value: 'other',
    label: 'Autre situation',
    description: 'Camion, vélo ou plusieurs véhicules',
    illustration: require('../../assets/images/accident-types/other.png'),
  },
];

export function AccidentTypePicker({
  value,
  disabled = false,
  onChange,
}: {
  value: AccidentType | null;
  disabled?: boolean;
  onChange: (value: AccidentType) => void;
}) {
  const styles = useStyles();

  return (
    <View style={styles.grid}>
      {accidentTypes.map((type) => {
        const selected = value === type.value;
        return (
          <Pressable
            key={type.value}
            accessibilityRole="radio"
            accessibilityLabel={`${type.label}. ${type.description}`}
            accessibilityState={{ checked: selected, disabled }}
            disabled={disabled}
            onPress={() => onChange(type.value)}
            style={({ pressed }) => [
              styles.choice,
              (pressed || disabled) && styles.dimmed,
            ]}
          >
            <View style={[styles.circle, selected && styles.selected]}>
              <Image
                source={type.illustration}
                style={styles.illustration}
                contentFit="contain"
                accessible={false}
                alt=""
              />
              {selected && (
                <View style={styles.check}>
                  <AppIcon icon={Check} size={15} color="#fff" />
                </View>
              )}
            </View>
            <Text style={[styles.label, selected && styles.selectedLabel]}>
              {type.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const useStyles = createThemedStyles((themeColor) => StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, rowGap: 20 },
  choice: { width: '47%', flexGrow: 0, alignItems: 'center', gap: 8 },
  dimmed: { opacity: 0.6 },
  circle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 1.5,
    borderColor: themeColor('#E7ECEC', 'border'),
    backgroundColor: themeColor('#F1F6F5', 'elevated'),
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  illustration: { width: 94, height: 94 },
  selected: { backgroundColor: themeColor('#FFF0E9', 'accentSoft'), borderColor: '#D94235' },
  check: {
    position: 'absolute',
    right: 1,
    bottom: 2,
    width: 25,
    height: 25,
    borderRadius: 13,
    backgroundColor: '#D94235',
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: 'center',
    color: themeColor('#354456', 'secondary'),
  },
  selectedLabel: { color: themeColor('#C6382C', 'accent') },
}));
