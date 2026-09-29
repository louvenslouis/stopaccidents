import { AppScreen } from "@/components/app-screen";
import { surfaceDepth } from "@/components/ui/surface-depth";
import {
  createThemedStyles,
  useThemeColor,
} from "@/features/appearance/theme-provider";
import { Pressable, Text, TextInput, View } from "@/features/language/native";
import {
  deleteSafetyRecord,
  readIdentityPhoto,
  readSafetyProfile,
  saveSafetyRecord,
  setSafetyAlertsEnabled,
} from "@/features/safety-profile/api";
import {
  vehicleTypes,
  type SafetyProfile,
  type SafetyRecord,
} from "@/features/safety-profile/model";
import { supabase } from "@/lib/supabase";
import { randomUUID } from "expo-crypto";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import LockKeyhole from "lucide-react-native/icons/lock-keyhole";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
} from "react-native";

export default function SafetyProfileScreen() {
  const router = useRouter();
  const styles = useStyles();
  const color = useThemeColor();
  const [account, setAccount] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let mounted = true,
      changed = false;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      changed = true;
      if (mounted) {
        setAccount(
          session && !session.user.is_anonymous ? session.user.id : null,
        );
        setChecking(false);
      }
    });
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (mounted && !changed) {
          setAccount(
            data.session && !data.session.user.is_anonymous
              ? data.session.user.id
              : null,
          );
          setChecking(false);
        }
      })
      .catch(() => {
        if (mounted) setChecking(false);
      });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);
  return (
    <AppScreen
      title="Véhicules et identité"
      headerLeft={
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retour au profil"
          onPress={() => router.replace("/profil")}
          style={styles.icon}
        >
          <ChevronLeft color={color("#171719", "text")} />
        </Pressable>
      }
    >
      {checking ? (
        <ActivityIndicator />
      ) : account ? (
        <PrivateProfile key={account} userId={account} />
      ) : (
        <Pressable
          accessibilityRole="button"
          style={styles.primary}
          onPress={() => router.replace("/profil")}
        >
          <Text style={styles.primaryText}>Se connecter</Text>
        </Pressable>
      )}
    </AppScreen>
  );
}
function PrivateProfile({ userId }: { userId: string }) {
  const styles = useStyles();
  const color = useThemeColor();
  const [profile, setProfile] = useState<SafetyProfile | null>(null);
  const [editing, setEditing] = useState<SafetyRecord | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SafetyRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true),
    lock = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    void readSafetyProfile(controller.signal)
      .then((data) => {
        if (mounted.current) setProfile(data);
      })
      .catch((e) => {
        if (mounted.current && !controller.signal.aborted) setError(e.message);
      });
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active") setPreview(null);
    });
    return () => {
      mounted.current = false;
      controller.abort();
      listener.remove();
    };
  }, []);
  useEffect(() => {
    if (!preview) return;
    const timer = setTimeout(() => setPreview(null), 60000);
    return () => clearTimeout(timer);
  }, [preview]);
  async function perform(operation: () => Promise<unknown>, close = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await operation();
      if (!mounted.current) return;
      if (close) {
        setEditing(null);
        setPhoto(null);
        setDeleting(null);
      }
      const data = await readSafetyProfile();
      if (mounted.current) setProfile(data);
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "Impossible d’enregistrer.");
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  function edit(record: SafetyRecord) {
    setEditing(record);
    setPhoto(null);
    setError(null);
  }
  function add(kind: SafetyRecord["kind"]) {
    edit({
      id: randomUUID(),
      kind,
      value: "",
      vehicle_type: kind === "registration" ? "car" : null,
      color: kind === "registration" ? "" : null,
      photo_path: null,
    });
  }
  async function choosePhoto(camera: boolean) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      if (
        camera &&
        !(await ImagePicker.requestCameraPermissionsAsync()).granted
      )
        throw new Error("Autorisez la caméra dans les réglages.");
      const options: ImagePicker.ImagePickerOptions = {
        mediaTypes: ["images"],
        base64: true,
        exif: false,
        quality: 0.6,
      };
      const result = await (camera
        ? ImagePicker.launchCameraAsync(options)
        : ImagePicker.launchImageLibraryAsync(options));
      if (!mounted.current || result.canceled) return;
      const data = result.assets[0]?.base64;
      if (!data || data.length * 0.75 > 6 * 1024 * 1024)
        throw new Error("Choisissez une photo JPEG de moins de 6 Mo.");
      setPhoto(data);
    } catch (e) {
      if (mounted.current)
        setError(e instanceof Error ? e.message : "Photo indisponible.");
    } finally {
      lock.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  const vehicles =
    profile?.records.filter((record) => record.kind === "registration") ?? [];
  const identity = profile?.records.find(
    (record) => record.kind === "identity",
  );
  const field = (
    label: string,
    value: string,
    update: (value: string) => void,
    maxLength: number,
    cap: "characters" | "sentences" = "characters",
  ) => (
    <TextInput
      accessibilityLabel={label}
      placeholder={label}
      placeholderTextColor={color("#77777C", "muted")}
      value={value}
      onChangeText={update}
      maxLength={maxLength}
      autoCapitalize={cap}
      autoCorrect={false}
      editable={!busy}
      style={styles.input}
    />
  );
  return (
    <View style={styles.content}>
      <View style={styles.row}>
        <LockKeyhole size={16} color={color("#267E70", "success")} />
        <Text style={styles.muted}>Confidentiel</Text>
      </View>
      {error && (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      )}
      {!profile ? (
        error ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void perform(async () => {})}
            style={styles.secondary}
          >
            <Text style={styles.buttonText}>Réessayer</Text>
          </Pressable>
        ) : (
          <ActivityIndicator color={color("#267E70", "success")} />
        )
      ) : (
        <>
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={[styles.title, styles.grow]}>Mes véhicules</Text>
              <Pressable
                accessibilityRole="button"
                disabled={busy || !!editing || vehicles.length >= 10}
                onPress={() => add("registration")}
                style={styles.secondary}
              >
                <Text style={styles.buttonText}>Ajouter</Text>
              </Pressable>
            </View>
            {vehicles.map((record) => (
              <View key={record.id} style={styles.item}>
                <Text translate={false} style={styles.value}>
                  {record.value}
                </Text>
                <View style={styles.row}>
                  <Text style={styles.muted}>
                    {
                      vehicleTypes.find(
                        (type) => type.id === record.vehicle_type,
                      )?.label
                    }
                  </Text>
                  <Text translate={false} style={styles.muted}>
                    {record.color}
                  </Text>
                </View>
                <View style={styles.row}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => edit(record)}
                    style={styles.secondary}
                  >
                    <Text style={styles.buttonText}>Modifier</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => setDeleting(record)}
                    style={styles.secondary}
                  >
                    <Text style={styles.error}>Supprimer</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </View>
          <View style={styles.card}>
            <Text style={styles.title}>Ma carte d’identité</Text>
            {identity ? (
              <>
                <Text translate={false} style={styles.value}>
                  {identity.value}
                </Text>
                <View style={styles.row}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => edit(identity)}
                    style={styles.secondary}
                  >
                    <Text style={styles.buttonText}>Modifier</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => setDeleting(identity)}
                    style={styles.secondary}
                  >
                    <Text style={styles.error}>Supprimer</Text>
                  </Pressable>
                  {identity.photo_path && (
                    <Pressable
                      accessibilityRole="button"
                      disabled={busy}
                      style={styles.secondary}
                      onPress={() =>
                        void perform(async () => {
                          const url = await readIdentityPhoto(
                            identity.photo_path!,
                          );
                          if (mounted.current) setPreview(url);
                        })
                      }
                    >
                      <Text style={styles.buttonText}>Voir la carte</Text>
                    </Pressable>
                  )}
                </View>
              </>
            ) : (
              <Pressable
                accessibilityRole="button"
                disabled={busy || !!editing}
                onPress={() => add("identity")}
                style={styles.secondary}
              >
                <Text style={styles.buttonText}>Ajouter ma carte</Text>
              </Pressable>
            )}
          </View>
          <View style={[styles.card, styles.row]}>
            <Text style={[styles.title, styles.grow]}>Alerter mes proches</Text>
            <Switch
              accessibilityLabel="Alerter mes proches"
              value={profile.alerts_enabled}
              disabled={busy}
              onValueChange={(enabled) =>
                void perform(() => setSafetyAlertsEnabled(userId, enabled))
              }
              trackColor={{ true: color("#267E70", "success") }}
            />
          </View>
        </>
      )}
      {editing && (
        <Modal
          visible
          transparent
          animationType="slide"
          onRequestClose={() => {
            if (!busy) {
              setEditing(null);
              setPhoto(null);
            }
          }}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.overlay}
          >
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.editorScroll}
            >
              <View style={styles.card}>
                {error && (
                  <Text accessibilityRole="alert" style={styles.error}>
                    {error}
                  </Text>
                )}
                <Text style={styles.title}>
                  {editing.kind === "identity"
                    ? "Carte d’identité"
                    : "Véhicule"}
                </Text>
                {editing.kind === "registration" && (
                  <View style={styles.row}>
                    {vehicleTypes.map((type) => (
                      <Pressable
                        key={type.id}
                        accessibilityRole="radio"
                        accessibilityState={{
                          checked: editing.vehicle_type === type.id,
                        }}
                        disabled={busy}
                        onPress={() =>
                          setEditing({ ...editing, vehicle_type: type.id })
                        }
                        style={[
                          styles.secondary,
                          editing.vehicle_type === type.id && styles.selected,
                        ]}
                      >
                        <Text style={styles.buttonText}>{type.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                {field(
                  editing.kind === "identity"
                    ? "Numéro d’identification"
                    : "Immatriculation",
                  editing.value,
                  (value) => setEditing({ ...editing, value }),
                  editing.kind === "identity" ? 100 : 45,
                )}
                {editing.kind === "registration" ? (
                  field(
                    "Couleur",
                    editing.color ?? "",
                    (value) => setEditing({ ...editing, color: value }),
                    40,
                    "sentences",
                  )
                ) : (
                  <>
                    {photo && (
                      <Image
                        source={{ uri: `data:image/jpeg;base64,${photo}` }}
                        cachePolicy="none"
                        contentFit="contain"
                        style={styles.photo}
                      />
                    )}
                    <View style={styles.row}>
                      <Pressable
                        accessibilityRole="button"
                        disabled={busy}
                        style={styles.secondary}
                        onPress={() => void choosePhoto(true)}
                      >
                        <Text style={styles.buttonText}>
                          Photographier la carte
                        </Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        disabled={busy}
                        style={styles.secondary}
                        onPress={() => void choosePhoto(false)}
                      >
                        <Text style={styles.buttonText}>Choisir une photo</Text>
                      </Pressable>
                    </View>
                  </>
                )}
                <View style={styles.row}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    style={styles.primary}
                    onPress={() =>
                      void perform(
                        () => saveSafetyRecord(userId, editing, photo),
                        true,
                      )
                    }
                  >
                    <Text style={styles.primaryText}>Enregistrer</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    style={styles.secondary}
                    onPress={() => {
                      setEditing(null);
                      setPhoto(null);
                    }}
                  >
                    <Text style={styles.buttonText}>Annuler</Text>
                  </Pressable>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>
      )}
      {deleting && (
        <Modal
          visible
          transparent
          onRequestClose={() => {
            if (!busy) setDeleting(null);
          }}
        >
          <View style={styles.overlay}>
            <View style={styles.card}>
              <Text style={styles.title}>Supprimer cet enregistrement ?</Text>
              <View style={styles.row}>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  style={styles.primary}
                  onPress={() =>
                    void perform(
                      () => deleteSafetyRecord(userId, deleting),
                      true,
                    )
                  }
                >
                  <Text style={styles.primaryText}>Supprimer</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  style={styles.secondary}
                  onPress={() => setDeleting(null)}
                >
                  <Text style={styles.buttonText}>Annuler</Text>
                </Pressable>
              </View>
              {error && (
                <Text accessibilityRole="alert" style={styles.error}>
                  {error}
                </Text>
              )}
            </View>
          </View>
        </Modal>
      )}
      {busy && <ActivityIndicator color={color("#267E70", "success")} />}
      <Modal
        visible={!!preview}
        transparent
        onRequestClose={() => setPreview(null)}
      >
        <View style={styles.overlay}>
          {preview && (
            <Image
              source={{ uri: preview }}
              cachePolicy="none"
              contentFit="contain"
              style={styles.largePhoto}
            />
          )}
          <Pressable
            accessibilityRole="button"
            style={styles.primary}
            onPress={() => setPreview(null)}
          >
            <Text style={styles.primaryText}>Fermer</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}
const useStyles = createThemedStyles((color) =>
  StyleSheet.create({
    content: {
      maxWidth: 640,
      width: "100%",
      alignSelf: "center",
      gap: 18,
      marginTop: 20,
    },
    card: {
      backgroundColor: color("#FFFFFF", "surface"),
      borderRadius: 24,
      padding: 20,
      gap: 16,
      ...surfaceDepth(color, "card"),
    },
    buttonText: {
      color: color("#171719", "text"),
      fontSize: 14,
      fontWeight: "600",
    },
    title: { fontSize: 18, fontWeight: "700", color: color("#171719", "text") },
    value: { fontSize: 18, fontWeight: "600", color: color("#171719", "text") },
    muted: { fontSize: 14, color: color("#77777C", "muted") },
    error: { color: color("#BA3D31", "accent") },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap",
    },
    grow: { flex: 1 },
    item: {
      gap: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: color("#E8E8EA", "border"),
      paddingTop: 16,
    },
    input: {
      minHeight: 52,
      paddingHorizontal: 16,
      borderRadius: 16,
      fontSize: 16,
      color: color("#171719", "text"),
      backgroundColor: color("#F7F7F7", "background"),
      ...surfaceDepth(color, "inset"),
    },
    primary: {
      minHeight: 44,
      padding: 14,
      alignItems: "center",
      borderRadius: 14,
      backgroundColor: color("#267E70", "success"),
    },
    primaryText: { color: color("#FFFFFF", "background"), fontWeight: "700" },
    secondary: {
      minHeight: 44,
      padding: 12,
      borderRadius: 14,
      backgroundColor: color("#F7F7F7", "background"),
      alignItems: "center",
      justifyContent: "center",
    },
    selected: { borderWidth: 2, borderColor: color("#267E70", "success") },
    icon: {
      width: 44,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    editorScroll: {
      flexGrow: 1,
      justifyContent: "center",
      width: "100%",
      maxWidth: 640,
      alignSelf: "center",
      paddingVertical: 28,
    },
    photo: { width: "100%", height: 180 },
    largePhoto: { width: "100%", height: "70%" },
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.95)",
      justifyContent: "center",
      padding: 24,
      gap: 20,
    },
  }),
);
