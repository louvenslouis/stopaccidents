# Live location sharing

Mes proches lets a registered user select one, several, or all currently accepted
connections, for 15 minutes, 1 hour, or 8 hours. Selecting all takes a snapshot;
newly accepted contacts do not silently gain access. Stop revokes the entire grant.

Only the latest GPS fix is stored, in private tables. Authenticated RPCs check the
stored account and accepted connection on each read. Owner-scoped session tokens
fence late GPS callbacks and other devices. Expired grants and fixes older than
90 seconds are excluded by the server. The receiving screen polls every 3 seconds
and clears received locations when a read fails. No public location URLs exist.

Tracking lives above the tabs so navigation does not stop it. Web uses a foreground
watcher; an inactive/closed tab cannot guarantee updates. Android/iOS also register
an Expo TaskManager location task when background permissions are available. A
foreground-only status is shown otherwise. A new native build is required for
expo-task-manager and the background location/service permissions in app.json.
Expo Go cannot validate background tracking. Killing the app can stop tracking.
Supabase auth and the sharing token use device-only keychain storage accessible
after the first unlock so the native task can authenticate while the phone is locked.

Validation: database tests exercise consent, selected recipients, invalid/pending
connections, anonymous users, account isolation, stale/out-of-order coordinates,
expiry, replacement tokens, stop, and deleted connections. Client/background tests
exercise GPS freshness, cancellation, revocation errors, account changes and newest
batched fixes. Test actual locked-device behavior with two signed-in accounts on a
native development/release build; JS export alone does not verify OS behavior.
