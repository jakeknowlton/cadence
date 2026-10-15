# Cadence

Invite-only group accountability app: a group defines daily, weekly, and monthly tasks, members check them off, and everyone sees everyone's progress. Lives at [cadence.jkn.dev](https://cadence.jkn.dev).

- [Product spec](docs/SPEC.md)
- [Technical design](docs/DESIGN.md)

Runs entirely on Firebase's free Spark plan: Auth, Firestore, and Hosting, with security rules as the only server-side logic. No Cloud Functions.

## Setup

Tool versions are pinned in `mise.toml`. With [mise](https://mise.jdx.dev) installed:

```sh
mise install
pnpm install
```

The Firestore emulator needs Java 11 or newer on the path.

## Development

Everything runs locally against the Firebase Emulator Suite; no cloud project is needed.

```sh
pnpm dev:all      # emulators + Vite dev server (http://localhost:5173)
pnpm emulators    # Auth + Firestore emulators only, UI at http://localhost:4000
```

First run:

1. Open the app and sign in with Google. The emulator shows a fake account picker; add any account.
2. You'll land on "You need an invite". Make that account the first admin:
   ```sh
   pnpm seed:admin you@example.com
   ```
3. Reload. The Admin tab appears: create a group, add yourself, add tasks, then invite a second fake account to test the invite flow.

Vue devtools are off by default because their floating overlay covers the tab bar on a phone; start with `VITE_DEVTOOLS=1 pnpm dev` to enable them.

Emulator data is exported to `emulator-data/` on exit and re-imported on the next start, so your groups and tasks survive restarts.

## Checks

```sh
pnpm lint         # oxlint + eslint
pnpm type-check
pnpm test:unit    # vitest
pnpm test:rules   # Firestore security rules, runs inside the emulator
pnpm test:e2e     # Playwright
pnpm build
```

## Deploy

```sh
pnpm deploy:dev    # cadence-jkn-dev → https://cadence-jkn-dev.web.app
pnpm deploy:prod   # cadence-jkn-prod → https://cadence.jkn.dev
```

Project aliases are in `.firebaserc` (default is dev). Environments: `.env.development` (emulators), `.env.staging` (dev project), `.env.production` (prod project). All committed; Firebase web config values are public identifiers, not secrets.

In production the first admin is created by hand: sign in once, then in the Firebase console create `users/{uid}` with `email`, `displayName`, `photoURL: null`, `role: "admin"`, `timezone`, `status: "active"`, `createdAt`, `updatedAt`.
