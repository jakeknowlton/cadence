# Cadence: Technical Design

How [SPEC.md](SPEC.md) is built. Draft v0.4. The spec defines behaviour; this document defines structure. Where the two disagree, the spec wins and this document is wrong.

## Architecture

The frontend talks to Firestore directly through VueFire for all reads and nearly all writes, with Firestore security rules as the authority on who may do what. A small set of Cloud Functions for Firebase (2nd gen, running on Cloud Run) handles the few things a browser cannot or should not do. There is no API server.

| Need | Why not in the browser | Function |
|------|-----------------------|----------|
| Accept an invite: verify the email, create the user, apply memberships, mark the invite used, all at once | Multi-document write with trust checks | `acceptInvite` callable |
| Notification fan-out and push delivery | Sending push needs server credentials; must run even if the actor closes the tab | `onCompletionCreated` trigger |
| Monthly rollups for stats and charts | Must be correct regardless of which client wrote; needs all of a month's completions | `onCompletionWritten` trigger, `rebuildSummaries` callable |
| Last-admin protection, token revocation on deactivate | Rules cannot count documents; only the Admin SDK revokes tokens | `onUserWritten` trigger |
| Scheduled reminders (v2) | Needs a schedule | `scheduledReminders` |

Cloud Functions require the Blaze pay-as-you-go plan. At this scale the bill rounds to zero. If stats ever outgrow monthly rollups, the next step is the Firestore-to-BigQuery export extension, which adds SQL over completions without replacing anything.

### Stack

| Layer | Choice |
|-------|--------|
| Frontend | Vue 3, TypeScript, Vite, Pinia, Vue Router |
| Firebase binding | VueFire |
| UI | shadcn-vue (Reka UI primitives, Tailwind CSS v4), components copied into `src/components/ui` |
| Icons | Phosphor Icons via `@phosphor-icons/vue`; replaces the Lucide imports shadcn-vue scaffolds with |
| Charts | Decided in Phase 0; candidates `unovis` and `vue-chartjs` |
| Dates | `date-fns` and `date-fns-tz` |
| Validation | `zod` schemas generated from task field definitions |
| Auth | Firebase Auth: Google sign-in and email-link sign-in |
| Database | Cloud Firestore with offline persistence |
| Functions | Cloud Functions for Firebase 2nd gen, Node 22, TypeScript, in `/functions` |
| Push | Firebase Cloud Messaging web push, service worker from `vite-plugin-pwa` |
| Hosting | Firebase Hosting with custom domain `cadence.jkn.dev`, also added to Firebase Auth authorized domains |
| Local dev | Firebase Emulator Suite: Auth, Firestore, Functions |
| Tests | Vitest for units and rules (`@firebase/rules-unit-testing`), Playwright end to end against emulators |
| CI | GitHub Actions: lint, type-check, unit, rules tests; deploy on `main` |

## Data model

```
users/{uid}
  email, displayName, photoURL
  role: 'user' | 'admin'
  timezone                          // IANA name, e.g. 'America/Denver'
  status: 'active' | 'deactivated'
  createdAt, updatedAt

users/{uid}/private/fcm
  tokens: { [token]: { createdAt, userAgent } }

invites/{inviteId}
  email                             // lowercased
  token                             // random, carried in the link
  invitedBy, groupIds: string[]
  status: 'pending' | 'accepted' | 'revoked' | 'expired'
  createdAt, expiresAt, acceptedAt?, acceptedBy?

groups/{groupId}
  name, description, icon, color
  memberIds: string[]               // denormalised for queries and rules
  weekStartsOn: 0 | 1               // 0 Sunday, 1 Monday
  weekStartLocked: boolean
  editWindowDays: number
  archivedAt: Timestamp | null
  createdAt, createdBy

groups/{groupId}/members/{uid}
  userId                            // duplicate of the id for collection-group queries
  joinedAt, leftAt: Timestamp | null
  notifications: NotificationPrefs

groups/{groupId}/taskVersions/{versionId}
  taskId, version, replaces?
  effectiveFrom: 'YYYY-MM-DD'
  effectiveTo: 'YYYY-MM-DD' | null
  name, description, icon, sortOrder                       // cosmetic
  cadence, activeDays, requiredCount, completionType,      // measured
  fields: TaskField[], target?: TaskTarget
  fieldKeys: string[]               // fields[].key, for rules
  fieldTypes: { [key]: 'type|unit' } // for the type/unit lock in rules
  snapshot: { …measured fields… }   // canonical copy completions must match
  createdAt, createdBy

groups/{groupId}/completions/{completionId}
  userId, taskId, taskVersionId
  cadence, periodKey                // 'd:2026-10-15' | 'w:2026-10-12' | 'm:2026-10-01'
  completedAt                       // informational
  loggedAt                          // server timestamp
  values: { [fieldKey]: value }
  note?
  taskSnapshot                      // == taskVersion.snapshot plus weekStartsOn
  deletedAt: Timestamp | null

groups/{groupId}/summaries/{userId}_{taskId}_{YYYY-MM}
  userId, taskId, month
  completions, completionsAll       // counting, and including non-counting
  periods: { [cadence]: { complete, missed } }
  fields: { [key]: { sum, count, min, max } }
  byDay: { [YYYY-MM-DD]: { count, values: { [key]: number } } }
  updatedAt

notifications/{uid}/items/{actorId}_{taskId}_{periodKey}
  type, groupId, actorId, completionId, taskName, periodKey
  createdAt, readAt: Timestamp | null
```

Period keys are cadence-prefixed start dates so they sort chronologically within a cadence and work for any week start. Task effective ranges are plain dates so versions of different cadences can be compared in one query.

### Types

```ts
type Cadence = 'daily' | 'weekly' | 'monthly'
type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6

interface TaskField {
  key: string
  label: string
  type: 'number' | 'duration' | 'text' | 'boolean' | 'select'
  unit?: string
  required: boolean
  min?: number; max?: number; step?: number
  options?: string[]
  default?: unknown
}

interface TaskTarget {
  fieldKey: string
  comparator: '>=' | '<=' | '==' | 'between'
  value: number
  valueMax?: number
  gatesCompletion: boolean
}

interface NotificationPrefs {
  onMemberCompletion: { enabled: boolean; cadences: Cadence[]; taskIds: string[] | null }
  channels: { push: boolean }
  quietHours?: { start: string; end: string }
}
```

## Queries and indexes

| Screen | Query | Composite index |
|--------|-------|-----------------|
| My groups | groups where `memberIds` contains uid and `archivedAt` is null | memberIds, archivedAt |
| Versions in effect for a date range | two queries, `effectiveTo == null` and `effectiveTo >= start`, both with `effectiveFrom <= end`, merged in the client | effectiveTo, effectiveFrom |
| Today view | completions where `userId` is me, `periodKey` in the current day, week, and month keys, `deletedAt` null | userId, deletedAt, periodKey |
| Period grid | completions where `periodKey` equals the key and `deletedAt` null | periodKey, deletedAt |
| Activity feed | completions where `deletedAt` null, ordered by `loggedAt` descending, limit 50 | deletedAt, loggedAt |
| My completions in a group I left | completions where `userId` is me, ordered by `periodKey` | userId, periodKey |
| Stats and charts | summaries where `userId` and `taskId` match and `month` is in range | userId, taskId, month |
| Rebuild one month | completions where `userId`, `taskId` match and `periodKey` is within the month, per cadence prefix | userId, taskId, periodKey |

## Access control

Rules read the caller's user doc for status and role, and the group doc for membership. That is two or three document reads per request, which is acceptable.

| Collection | Read | Write |
|-----------|------|-------|
| users | any active user | admin; or the owner, changing only timezone, display name, photo |
| users/private | owner | owner |
| invites | admin | admin |
| groups | member or admin | admin; `weekStartsOn` only while `weekStartLocked` is false |
| members | member or admin | admin; or the owner, changing only `notifications` |
| taskVersions | member or admin | admin; a new version must keep every shared key's `fieldTypes` entry unchanged; an update may touch only cosmetic fields and `effectiveTo` |
| completions | member, admin, or the completion's owner | create: member, `userId` is the caller, `taskSnapshot` equals the version's `snapshot`, `values` keys within `fieldKeys`, `periodKey` matches the key pattern, `completedAt` within `editWindowDays` plus two days of server time; update and delete: owner under the same time check and soft-delete only, or admin |
| summaries | member or admin | functions only |
| notifications/items | owner; update `readAt` only | functions only |

Rules cannot loop over a field list or do timezone arithmetic, so three things are enforced only in the app: per-field type and range validation, the exact edit window in the member's timezone, and consistency between `periodKey` and `completedAt`. The rules bound them; the group is trusted for the rest.

Rules tests should cover: an authenticated user with no account reads nothing; a member cannot write another member's completion; a snapshot differing from the version doc is rejected; an unknown value key is rejected; a completion dated a week ago is rejected; a non-admin cannot write a task version; a new version changing a field's type is rejected; week start cannot change once locked; a removed member reads their own completions but not the group.

## Cloud Functions

| Function | Trigger | Behaviour |
|----------|---------|-----------|
| `acceptInvite(token)` | callable | Checks the caller's email matches the invite (case-insensitive) and the invite is pending and unexpired. In one transaction creates `users/{uid}` with role `user` and the client's timezone, adds memberships and `memberIds`, marks the invite accepted. |
| `onCompletionCreated` | completion created | Loads active members and preferences, drops the actor and anyone opted out of this cadence or task, applies quiet hours. Writes an inbox item with the deterministic id, so retries and undo-redo cycles produce one item. Sends FCM push with a visible notification payload to each enabled token, deleting tokens FCM reports as invalid. |
| `onCompletionWritten` | completion created, updated, or deleted | Recomputes the summary for the member, task, and month of the period from raw completions in that month. Recomputing rather than incrementing keeps it idempotent and self-healing. Sets `weekStartLocked` on the first weekly completion. |
| `rebuildSummaries(groupId?)` | callable, admin only | Regenerates every summary from raw completions. |
| `onUserWritten` | user updated | Reverts a write that would leave zero active admins. Revokes refresh tokens when a user is deactivated. |
| `scheduledReminders` | schedule (v2) | Per-timezone sweep for members with incomplete tasks and reminders enabled. |

## Frontend structure

### Routes

```
/login                       sign in
/invite/:token               accept invite, then redirect
/no-access                   signed in without an account
/                            Today
/groups                      my groups
/groups/:id                  activity feed and current period grid
/groups/:id/history          period picker and grid
/groups/:id/stats            stats and charts
/groups/:id/settings         my notification preferences for this group
/inbox                       notifications
/me                          profile, timezone, device push status
/me/history                  my completions across groups, including ones I have left
/admin/users                 users, invites, roles
/admin/groups/:id            members and task editor
```

Guards: `requiresAuth`, `requiresActiveUser`, `requiresAdmin`.

### Stores and pure modules

Pinia stores wrap VueFire bindings: auth and profile; groups, members, and task versions with a "versions in effect for a range" selector; completions for the active group and period with log and undo actions; summaries with derived stats and chart series; inbox and device token registration.

Logic that does not touch Firebase lives in plain TypeScript modules with unit tests: period key maths, active-day and edit-window checks, week start handling; zod schema generation from field definitions; completion status (counting, complete, goal met); edit classification (cosmetic, measured, refused); stats and chart series from summaries, per cadence segment.

### Components

The app shell switches between bottom tabs and a sidebar. A task row either toggles a checkbox or opens a bottom sheet that renders fields from the definition. The period grid is responsive. The task editor classifies the edit live and shows "applies now", "new version from <date>", or "not allowed, replace task instead". An icon picker browses Phosphor. A stats panel and trend chart read summaries.

## Push implementation

- The service worker from `vite-plugin-pwa` imports the FCM messaging worker. Every push carries a visible notification payload; Safari may revoke permission for a web app that receives a push and shows nothing, so there are no data-only pushes.
- Platform detection: iOS is identified from the user agent; "installed" is `display-mode: standalone`. In a Safari tab the settings screen shows Add to Home Screen steps and no permission button, since iOS cannot grant push there.
- `Notification.requestPermission()` is called only from a tap. The resulting token is written to `users/{uid}/private/fcm`.
- On every launch and on return to the foreground, the app requests the token again and updates the stored one if it changed. This heals iOS subscriptions that lapse.
- The settings screen reads the current permission state and whether this device's token is stored, and shows subscribed, not subscribed, or denied.

## Testing

- Unit tests for every pure module, especially period maths across week starts, month boundaries, and timezones, and edit classification.
- Rules tests as listed under Access control, run against the Firestore emulator.
- Function tests against the emulator: invite acceptance paths, deterministic notification ids under undo and redo, summary recompute on create, edit, and soft delete.
- Playwright against emulators for the critical paths: invite and sign in, build each spec example task, log a day, change a task's cadence and confirm last month's grid and the miles chart are unchanged.
