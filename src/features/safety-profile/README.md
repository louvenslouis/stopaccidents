# Confidential safety profile and alerts

Registered accounts can save up to ten vehicles (type, plate and color) and one
identity card (number and optional JPEG, at most 6 MiB). The profile is separate
from public aliases, Auth metadata and report feeds. Private-schema tables have
RLS and no client table privileges; owner-only RPCs check the stored account.
Identity photos use encrypted private database storage and owner-only RPCs. Profile
fields and report identifiers are encrypted; alert matching uses keyed HMAC indexes.
See `docs/sensitive-data.md` for keys, migration and rotation.
The app does not persist profile identifiers or photographs in offline drafts.

The owner explicitly enables **Alerter mes proches**. Only connections accepted
before the event can receive alerts. Saving a profile or accepting a connection
does not replay historical events. Disabling alerts immediately removes access
to matching alerts and cancels unsent delivery on the next worker pass.

## Matching

Sources are the **accident** supplementary step (explicit registration and identity
fields) and the explicit plate field of **suspicious vehicle** reports. Suspicious
vehicle details and identifiers commit in one transaction; legacy edits invalidate
stale private identifiers. Free-form narratives in other event types are not parsed
or treated as proof of involvement. Type and color describe the
registered vehicle but never independently trigger an alert.

Numbers are uppercased; spaces and hyphens are ignored. Other symbols are
rejected, leading zeroes are preserved, and only full exact matches qualify.
No fuzzy match, face recognition or OCR is performed. Stored profile records,
alert consent and accepted connections must predate the event. Creating an
alert requires an active published event created within the previous 48 hours.

Deferred transaction triggers inspect the final identifier set, including direct
API writes, so step-four replacement never sends an intermediate match. Events
are resolved through their canonical group. An advisory lock and uniqueness
constraint deduplicate concurrent contributions, retries and plate-plus-ID
matches into one alert per event, subject and recipient. The reporter cannot
query whether a number belongs to a registered user.

Every read, worker claim and pre-send check rechecks evidence, current consent, connection,
publication status and account/record existence. Corrected identifiers, deleted
records, closed reports and suspended evidence disappear from the inbox; another
valid contribution to the same event can continue supporting the alert. An
already delivered OS notification cannot be recalled. The inbox says
**Correspondance à vérifier**, not that the person is confirmed injured.

## Notifications

The app checks the private inbox every 15 seconds while active and refreshes on
resume; unread alerts surface above the tabs. Mes proches opens the event and
marks the private alert read. It exposes alias and event details, never profile
numbers, card images, account UUIDs or the reporter's identity.

Native users opt in with **Activer les notifications** in Mes proches. Device
registrations are tied to an authenticated session and random installation ID;
revoked sessions, explicitly disabled installations and expired device leases
cannot receive subsequent jobs. Push payloads are generic, including on the lock
screen. No sensitive identifiers, aliases or event details are sent to Expo.

The server worker claims at most 25 jobs with SKIP LOCKED and five-minute leases,
processes five provider requests concurrently, retries transient errors with
backoff, stores Expo tickets, checks receipts after 15 minutes and removes
DeviceNotRegistered tokens. Jobs expire after 24 hours / 12 attempts. Expo/FCM/APNs
can deliver more than once following an ambiguous network failure; inbox entries
are deduplicated, but exactly-once OS delivery cannot be guaranteed. Provider
receipt success does not prove the person read the alert.

Deploy `supabase/functions/safety-push` with JWT verification disabled: it instead
requires the random `x-safety-worker-key` verified by a service-role-only RPC.
The credential lives in a locked private table, never the client or repository.
The scheduler SQL in `supabase/migrations/20260929025737_safety_push_schedule.sql` invokes this endpoint once
per minute through pg_cron/pg_net. Worker RPC implementations are private; public
wrappers are service-role-only and invoker rights.

For a native build, configure the actual EAS project ID in `extra.eas.projectId`
(or `EXPO_PUBLIC_EAS_PROJECT_ID`), Android FCM v1 / iOS APNs credentials, and rebuild
with the expo-notifications and expo-image-picker plugins. If enhanced Expo push
security is enabled, configure `EXPO_ACCESS_TOKEN` as an Edge Function secret.
Expo Go and web are not remote-push delivery targets here. Without native push
credentials, private inbox alerts still work. Validate background / locked-phone
delivery on two real signed-in installations before relying on push alerts.

## Validation

`tests/safety-profile-database.test.mjs` runs all migrations in PGlite and covers
account isolation, private Storage policies, guest rejection, invalid/duplicate
numbers, exact matching, dual-match deduplication, corrections, atomic replacement,
shared events, suspension, consent revocation, session revocation and deletion.
`tests/safety-push.test.mjs` exercises provider failure, ticket/receipt handling,
invalid tokens, generic payloads and failed acknowledgements without sending real
notifications. This feature does not contact emergency services.
