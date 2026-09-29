import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Pressable, Text } from "@/features/language/native";
import { supabase } from "@/lib/supabase";
import { readSafetyAlerts } from "./api";
import { enableSafetyPush, listenForSafetyPush } from "./push";
import type { SafetyAlert } from "./model";

type State = {
  alerts: SafetyAlert[];
  error: string | null;
  refresh: () => Promise<void>;
  userId: string | null;
};
const Context = createContext<State>({
  alerts: [],
  error: null,
  refresh: async () => {},
  userId: null,
});
export const useSafetyAlerts = () => useContext(Context);
export function SafetyAlertsProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<SafetyAlert[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const accountRef = useRef<string | null>(null);
  useEffect(() => {
    let active = true,
      changed = false;
    const update = (id: string | null) => {
      if (!active || accountRef.current === id) return;
      accountRef.current = id;
      request.current?.abort();
      setAlerts([]);
      setError(null);
      setDismissed(null);
      setUserId(id);
    };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      changed = true;
      update(session && !session.user.is_anonymous ? session.user.id : null);
    });
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!changed)
          update(
            data.session && !data.session.user.is_anonymous
              ? data.session.user.id
              : null,
          );
      })
      .catch(() => {});
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  const refresh = useCallback(async () => {
    request.current?.abort();
    if (!userId) return;
    const controller = new AbortController();
    request.current = controller;
    try {
      const result = await readSafetyAlerts(controller.signal);
      if (!controller.signal.aborted) {
        setAlerts(result);
        setError(null);
      }
    } catch {
      if (!controller.signal.aborted) {
        setAlerts([]);
        setError("Impossible de charger les alertes.");
      }
    }
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    const initialRefresh = setTimeout(() => void refresh(), 0);
    let active = true,
      cleanup: (() => void) | undefined;
    const register = () => {
      void enableSafetyPush(userId, false).catch(() => {});
    };
    register();
    void listenForSafetyPush(
      () => {
        if (active) router.push("/(tabs)/mes-proches");
      },
      () => {
        if (active) {
          void refresh();
          register();
        }
      },
    )
      .then((dispose) => {
        if (active) cleanup = dispose;
        else dispose();
      })
      .catch(() => {});
    const state = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        void refresh();
        register();
      } else {
        request.current?.abort();
        setAlerts([]);
      }
    });
    const timer = setInterval(() => {
      if (AppState.currentState === "active") void refresh();
    }, 15000);
    return () => {
      active = false;
      request.current?.abort();
      clearTimeout(initialRefresh);
      clearInterval(timer);
      state.remove();
      cleanup?.();
    };
  }, [userId, refresh, router]);
  const unread = alerts.find((alert) => !alert.read_at);
  return (
    <Context.Provider value={{ alerts, error, refresh, userId }}>
      {children}
      {unread && dismissed !== unread.id && (
        <Pressable
          accessibilityRole="button"
          accessibilityLiveRegion="polite"
          style={styles.banner}
          onPress={() => {
            setDismissed(unread.id);
            router.push("/(tabs)/mes-proches");
          }}
        >
          <Text style={styles.label}>Alerte concernant un proche</Text>
        </Pressable>
      )}
    </Context.Provider>
  );
}
const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    bottom: 106,
    left: 24,
    right: 24,
    alignSelf: "center",
    padding: 16,
    borderRadius: 18,
    backgroundColor: "#9E352A",
    zIndex: 100,
  },
  label: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "700",
    textAlign: "center",
  },
});
