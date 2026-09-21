import Head from 'expo-router/head';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type AppScreenProps = {
  eyebrow: string;
  title: string;
  description: string;
  headerRight?: ReactNode;
};

export function AppScreen({ eyebrow, title, description, headerRight }: AppScreenProps) {
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <Head>
        <title>{title} — Stop Accidents</title>
      </Head>
      <StatusBar style="dark" />

      <View style={styles.content}>
        <View style={styles.header}>
          <View style={styles.heading}>
            <Text style={styles.eyebrow}>{eyebrow}</Text>
            <Text style={styles.title}>{title}</Text>
          </View>
          {headerRight}
        </View>
        <Text style={styles.description}>{description}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F7F7F7',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 36,
    paddingBottom: 116,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 16,
  },
  heading: {
    flex: 1,
  },
  eyebrow: {
    color: '#FF5A45',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  title: {
    marginTop: 8,
    color: '#171719',
    fontSize: 36,
    lineHeight: 42,
    fontWeight: '700',
    letterSpacing: -1.1,
  },
  description: {
    maxWidth: 480,
    marginTop: 10,
    color: '#77777C',
    fontSize: 16,
    lineHeight: 24,
  },
});
