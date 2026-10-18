# Cadence: Technical Design

How [SPEC.md](SPEC.md) is built. v0.5. The spec defines behaviour; this document defines structure. Where the two disagree, the spec wins and this document is wrong.

## Architecture

The frontend talks to Firestore directly through VueFire for every read and write, with Firestore security rules as the only server-side logic. There are no Cloud Functions and no API server, so the app runs on Firebase's free Spark plan. Three things that would normally be server work are done differently:

| Need | How it works without a server |
|------|-------------------------------|
| Accept an invite atomically | The invite document's id is the token. Rules let only a signed-in user with a verified, matching email read it. The client writes the profile and marks the invite accepted in one batch; the rules cross-check the two writes with `get()` and `getAfter()`, so neither can happen alone. |
| Notification fan-out | The completing member's client writes an inbox item into each recipient's inbox. Rules allow creating an item in another user's inbox only when both are members of the group named on it, the actor is the caller, and the id is `actorId_taskId_periodKey`. Create-only rules make redo and retries idempotent. |
| Stats and charts | Computed in the app from one task's completions, loaded with a single query. Streaks and rates need the period-by-period walk anyway, and a task has at most a few thousand completions. |
| Last-admin protection | The admin page disables the action; rules already block deactivated users on every request, so revoking tokens is unnecessary. |
| Week-start lock | The member who logs the group's first weekly completion flips `weekStartLocked` in the same batch; rules let members change only that field, only to true. |

If push notifications or scheduled reminders are ever wanted, the step up is the Blaze plan plus Cloud Functions; the data model does not change.

### Stack

| Layer | Choice |
|-------|--------|
| Frontend | Vue 3, TypeScript, Vite, Pinia, Vue Router |
| Firebase binding | VueFire |
| UI | shadcn-vue (Reka UI primitives, Tailwind CSS v4), components copied into `src/components/ui` |
| Icons | Phosphor Icons via `@phosphor-icons/vue`; replaces the Lucide imports shadcn-vue scaffolds with. A curated set of 48 is bundled for task and group icons. |
| Type | Bricolage Grotesque (variable, optical size axis), one family; 800 for headings, tabular numerals for stats |
| Theme | Light and dark via CSS variables on `:root` and `.dark`; a Pinia theme store persists the choice (auto, light, dark) and an inline script in `index.html` applies it before first paint. Palette: Chalk `#F3F5F2` / Pine Night `#0F1613` backgrounds, Pine `#1E5A45` primary, Clay `#B4443A` for missed. |
| Logo | `CadenceMark.vue`: a ring of seven segments around a check, in currentColor. `public/app-icon.svg` is the tile artwork; `pnpm icons` rasterises the PNGs with Playwright. |
| Charts | `chart.js` via `vue-chartjs` |
| Dates | `date-fns` and `date-fns-tz` |
| Validation | `zod` schemas generated from task field definitions |
| Auth | Firebase Auth: Google, and email and password with `sendEmailVerification`. Spark quotas: 1,000 verification and 150 password reset emails a day. |
| Database | Cloud Firestore with offline persistence |
| PWA | `vite-plugin-pwa` manifest and service worker; app badge via the Badging API |
| Hosting | Firebase Hosting with custom domain `cadence.jkn.dev`, also added to Firebase Auth authorized domains |
| Local dev | Firebase Emulator Suite: Auth, Firestore, Functions |
| Tests | Vitest for units and rules (`@firebase/rules-unit-testing` inside the emulator), Playwright end to end |
| CI | GitHub Actions: lint, type-check, unit, rules, and end-to-end tests on every push and PR; pushes to `main` deploy hosting, rules, and indexes to `cadence-jkn-dev`. Version tags `vX.Y.Z` on `main` run the same checks, then wait for approval on the `production` environment (required reviewer, restricted to version tags) before deploying to `cadence-jkn-prod`. Each project has its own service account; the prod key is an environment secret. |

## Data model

```
users/{uid}
  email, displayName, photoURL
  role: 'user' | 'admin'
  timezone                          // IANA name, e.g. 'America/Denver'
  status: 'active' | 'deactivated'
  createdAt, updatedAt

users/{uid}
  inviteToken                       // the invite this profile was created from

invites/{token}                     // the document id is the random token in the link
  email                             // lowercased
  invitedBy
  status: 'pending' | 'accepted' | 'revoked'
  createdAt, expiresAt, acceptedAt?, acceptedBy?

groups/{groupId}
  name, description, icon, color
  memberIds: string[]               // denormalised for queries and rules
  formerMemberIds: string[]         // keeps a removed member's read access to their own completions
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
  taskId, version, prevVersionId, replaces
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
  userId, groupId, taskId, taskVersionId, taskName
  cadence, periodKey                // 'd:2026-10-15' | 'w:2026-10-12' | 'm:2026-10-01'
  weekStartsOn                      // the group's setting at the time
  completedAt                       // informational
  loggedAt                          // server timestamp
  values: { [fieldKey]: value }
  note?
  taskSnapshot                      // == taskVersion.snapshot (map equality enforced by rules)
  deletedAt: Timestamp | null

notifications/{uid}/items/{actorId}_{taskId}_{periodKey}
  type, groupId, actorId, actorName, taskId, taskName, completionId, periodKey
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
}

interface NotificationPrefs {
  onMemberCompletion: { enabled: boolean; cadences: Cadence[]; taskIds: string[] | null }
  quietHours?: { start: string; end: string }
}
```

## Queries and indexes

| Screen | Query | Composite index |
|--------|-------|-----------------|
| My groups | groups where `memberIds` contains uid, ordered by name; archived filtered in the app | memberIds (contains), name |
| Versions in effect for a date range | two queries, `effectiveTo == null` and `effectiveTo >= start`, both with `effectiveFrom <= end`, merged in the client | effectiveTo, effectiveFrom |
| Today view | completions where `userId` is me and `periodKey` in the current day, week, and month keys | userId, periodKey |
| Period grid | completions where `periodKey` equals the key; soft-deleted filtered in the app | none (single field) |
| Activity feed | completions ordered by `loggedAt` descending, limit 60; soft-deleted filtered in the app | none (single field) |
| My history across groups | collection group `completions` where `userId` is me, ordered by `periodKey` | collection-group: userId, periodKey |
| Stats and charts | completions where `taskId` matches, filtered by member and date range in the app | none (single field) |

## Access control

Rules read the caller's user doc for status and role, and the group doc for membership. That is two or three document reads per request, which is acceptable.

| Collection | Read | Write |
|-----------|------|-------|
| users | any active user, or the owner | create: the owner, only in the same batch that marks their invite accepted, with role `user`; update: admin (role, status, name), or the owner (timezone, display name, photo) |
| users/private | owner | owner |
| invites | admin; or a signed-in user with a verified email equal to the invite's, for that one document | create: admin; update: admin to revoke, or the invitee to accept in the same batch that creates their profile |
| groups | member, former member, or admin | admin; `weekStartsOn` only while `weekStartLocked` is false; a member may set `weekStartLocked` to true |
| members | member or admin | admin; or the owner, changing only `notifications` |
| taskVersions | member, former member, or admin | admin; a new version must link `prevVersionId`, increment `version`, and keep every shared key's `fieldTypes` entry unchanged (`diff().changedKeys()` is empty); an update may touch only cosmetic fields, `effectiveTo`, and field labels |
| completions | member, admin, or the completion's owner (also via collection group) | create: member, `userId` is the caller, `groupId` matches, `taskSnapshot` equals the version's `snapshot`, `values` keys within `fieldKeys`, `periodKey` matches the pattern and its prefix matches `cadence`, `weekStartsOn` matches the group, `completedAt` within `editWindowDays` plus two days of server time; update: owner under the same time check (values, note, soft-delete), or admin; hard delete never |
| notifications/items | owner | create: an active member of the group, for another member of the same group, as themselves, with the deterministic id; update: owner, `readAt` only; delete: owner |

Rules cannot loop over a field list or do timezone arithmetic, so three things are enforced only in the app: per-field type and range validation, the exact edit window in the member's timezone, and consistency between `periodKey` and `completedAt`. The rules bound them; the group is trusted for the rest.

Rules tests should cover: an authenticated user with no account reads nothing; a member cannot write another member's completion; a snapshot differing from the version doc is rejected; an unknown value key is rejected; a completion dated a week ago is rejected; a non-admin cannot write a task version; a new version changing a field's type is rejected; week start cannot change once locked; a removed member reads their own completions but not the group.

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
/me                          profile, timezone, sign out
/me/history                  my completions across groups
/me/history                  my completions across groups, including ones I have left
/admin/users                 users, invites, roles
/admin/groups/:id            members and task editor
```

Guards: `requiresAuth`, `requiresActiveUser`, `requiresAdmin`.

### Stores and pure modules

Pinia stores wrap VueFire bindings: auth and profile; my groups and, for admins, all groups; the inbox with its unread count. Composables cover one group's document, roster, and task versions; one period's completions and in-effect tasks; the user's current date in their timezone; and logging, editing, and soft-deleting completions with inbox fan-out.

Logic that does not touch Firebase lives in plain TypeScript modules with unit tests: period key maths, active-day and edit-window checks, week start handling; zod schema generation from field definitions; completion status (counting, complete, one-tap defaults); edit classification (cosmetic, measured, refused); stats and chart series from raw completions, per cadence segment; version document construction and edit classification.

### Components

The app shell switches between bottom tabs and a sidebar. A task row either toggles a checkbox or opens a bottom sheet that renders fields from the definition. The period grid is responsive. The task editor classifies the edit live and shows "applies now", "new version from <date>", or "not allowed, replace task instead". An icon picker browses Phosphor. The stats view computes per-member stats and feeds three trend charts.

## Inbox and badge

- When a completion is logged, the client computes recipients from the group's membership documents (enabled, cadence included, task included, not the actor, not left) and writes inbox items in batches of eight, since each write costs two rule reads and a batch may use at most twenty.
- Fan-out is best effort after the completion commits; a failure never undoes the completion. A redo hits the create-only rule for already-notified recipients and fails quietly.
- The inbox store watches unread items and calls the Badging API where available.

## Testing

- Unit tests for every pure module, especially period maths across week starts, month boundaries, and timezones, and edit classification.
- Rules tests run inside the Firestore emulator via `firebase emulators:exec`.
- Rules tests also cover the invite acceptance batch (wrong email, unverified, used, expired, profile without invite, invite without profile) and inbox writes (deterministic id, self, impersonation, non-member).
- Playwright against emulators for the critical paths: invite and sign in, build each spec example task, log a day, change a task's cadence and confirm last month's grid and the miles chart are unchanged.
