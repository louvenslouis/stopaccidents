# Saved commute routes

`/trajets` is accessible from the home journey card, home menu and profile. Registered
users can save up to twenty private routes. The editor works without location
permission: choose endpoints with map pins, address search or saved home/work,
then add, drag, reorder or remove intermediate street points. Undo restores the
previous set of points. A separate review step confirms the road geometry.

The OSRM request goes through every point in order, with a 25 m snapping limit.
The response must contain every waypoint in its full geometry; failure never
substitutes a straight line. In-flight requests are cancelled when points change.
Stored geometry stays unchanged when editing only a schedule. Editing a street
requires confirming the new trace. The service uses the public routing endpoint
configured by `EXPO_PUBLIC_ROUTING_URL`; use a dedicated service for production
traffic. Routing/search requests contain the user-selected locations, as in the
existing map planner; these locations are not included in notification payloads.

Schedules use ISO weekdays, an explicit IANA timezone (the UI uses
`America/Port-au-Prince`), departure time, travel duration and 0/15/30/60 minutes
of advance warning. The backend checks the window from the selected lead time
through departure plus travel duration, including previous/next calendar days
for journeys crossing midnight and timezone daylight-saving transitions.

The server projects published, unclosed and visible event contributions onto the
confirmed line segments with a 60 m corridor. This is geometric proximity; the
source reports do not provide road IDs, so a very close parallel street can still
match. It cannot establish whether an unreported problem exists. Each matching
event creates at most one inbox item per route and scheduled departure. Merged
events are deduplicated and withdrawn evidence is rechecked on reads and sends.
Private RLS limits routes to their registered owner; private alerts and delivery
tables are exposed only through restricted RPCs. No live GPS enters matching.

The existing `safety-push` worker runs both independent queues every minute.
Apply `supabase/migrations/20261003054913_saved_routes_alerts.sql` before deploying
the worker. The existing cron and its private worker credential are reused.
Claims are leased; deliveries retry with backoff and Expo tickets/receipts are
checked. Pre-send eligibility checks cover route pause, schedule, evidence,
device consent and active sessions. Payloads contain only a generic message and
`{type: 'route_alert'}`. Opening a notification navigates to `/trajets`.

Route device opt-in is separate from safety-profile notifications. App foreground
refresh, token rotation and session changes renew enabled registrations. Web has
the inbox but no remote push support. Native push requires a real EAS project ID,
native app identifiers and configured FCM/APNs credentials in an installed build;
Expo Go cannot receive these remote pushes. Until configured, the app saves the
route and reports the push setup limitation without claiming activation. GPS can
be disabled, but the phone still needs connectivity and OS notifications enabled.

Validation covers waypoint response ordering, aborted requests, invalid geometry,
map bridge messages, schedule validation, ownership/session changes, RLS, corridor
matching, midnight/DST, event deduplication, independent notification consent,
revocation, provider failures and receipts. Real background/locked-device delivery
must be validated after native push credentials are configured.
