import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Platform, StyleSheet, View, type ViewProps } from 'react-native';
import { useFocusEffect, usePathname } from 'expo-router';
import { useAppTheme } from '@/features/appearance/theme-provider';
import { tabForeground } from './tab-contrast';

type Region = { ref: RefObject<View | null>; color: string; path: string };
type Controls = {
  register: (region: Region) => () => void;
  bar: RefObject<View | null>;
  start: () => void;
  stop: () => void;
};
const ControlsContext = createContext<Controls | null>(null);
const ColorsContext = createContext<string[]>([]);

export function TabContrastProvider({ children }: { children: ReactNode }) {
  const { scheme, color } = useAppTheme();
  const path = usePathname();
  const background = color('#F7F7F7', 'background');
  const fallback = tabForeground(background, scheme === 'dark');
  const colorKey = `${path}:${scheme}`;
  const [colorState, setColors] = useState({ key: '', values: [] as string[] });
  const bar = useRef<View | null>(null);
  const regions = useRef(new Set<Region>());
  const generation = useRef(0);
  const interval = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sample = useCallback(() => {
    const revision = ++generation.current;
    bar.current?.measureInWindow((x, y, width, height) => {
      if (!width || !height) return;
      const measured = [...regions.current].filter((region) => region.path === path);
      const results: { x: number; y: number; width: number; height: number; color: string }[] = [];
      const finish = () => {
        if (revision !== generation.current) return;
        setColors((state) => {
          const previous = state.key === colorKey ? state.values : [];
          const next = [0, 1, 2, 3].map((index) => {
            const px = x + 8 + (width - 16) * (index + 0.5) / 4;
            const py = y + height / 2;
            // Smaller nested sections take precedence over their parent card.
            const region = results.filter((r) => px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height)
              .sort((a, b) => a.width * a.height - b.width * b.height)[0];
            return tabForeground(region?.color ?? background, scheme === 'dark', previous[index]);
          });
          return next.every((value, index) => value === previous[index]) ? state : { key: colorKey, values: next };
        });
      };
      if (!measured.length) { finish(); return; }
      let pending = measured.length;
      for (const region of measured) {
        if (!region.ref.current) { if (--pending === 0) finish(); continue; }
        region.ref.current.measureInWindow((rx, ry, rw, rh) => {
          if (rw > 0 && rh > 0) results.push({ x: rx, y: ry, width: rw, height: rh, color: region.color });
          if (--pending === 0) finish();
        });
      }
    });
  }, [background, colorKey, path, scheme]);

  const stop = useCallback(() => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    stopTimer.current = setTimeout(() => {
      if (interval.current) clearInterval(interval.current);
      interval.current = null;
      sample();
    }, 240);
  }, [sample]);
  const start = useCallback(() => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    if (!interval.current) {
      sample();
      interval.current = setInterval(sample, 120);
    }
  }, [sample]);
  const register = useCallback((region: Region) => {
    regions.current.add(region);
    const timer = setTimeout(sample, 400);
    return () => { clearTimeout(timer); regions.current.delete(region); };
  }, [sample]);

  const invalidate = useCallback(() => { generation.current++; }, []);
  useEffect(() => {
    const timer = setTimeout(sample, 400);
    const update = () => { start(); stop(); };
    if (Platform.OS === 'web') {
      window.addEventListener('scroll', update, true);
      window.addEventListener('resize', update);
    }
    return () => {
      invalidate();
      clearTimeout(timer);
      if (interval.current) clearInterval(interval.current);
      if (stopTimer.current) clearTimeout(stopTimer.current);
      interval.current = null;
      if (Platform.OS === 'web') {
        window.removeEventListener('scroll', update, true);
        window.removeEventListener('resize', update);
      }
    };
  }, [invalidate, sample, start, stop]);

  const controls = useMemo(() => ({ register, bar, start, stop }), [register, start, stop]);
  return <ControlsContext value={controls}>
    <ColorsContext value={colorState.key === colorKey ? colorState.values : [fallback, fallback, fallback, fallback]}>
      {children}
    </ColorsContext>
  </ControlsContext>;
}

export function useTabContrastControls() { return useContext(ControlsContext); }
export function useTabContrastColor(index: number) { return useContext(ColorsContext)[index]; }

export function ContrastSurface(props: ViewProps) {
  const controls = useTabContrastControls();
  const path = usePathname();
  const ref = useRef<View | null>(null);
  const background = StyleSheet.flatten(props.style)?.backgroundColor;
  useFocusEffect(useCallback(() => {
    if (typeof background !== 'string' || !/^#[\da-f]{6}$/i.test(background)) return;
    return controls?.register({ ref, color: background, path });
  }, [background, controls, path]));
  return <View {...props} ref={ref} collapsable={false} />;
}
