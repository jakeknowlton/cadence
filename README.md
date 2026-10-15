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

1. Open the app and sign in with Google (the emulator shows a fake account picker), or create an email account. Emulator verification links are printed in the emulator log and listed in the Emulator UI under Authentication.
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

Each deploy pushes hosting, Firestore rules, and indexes together.

### Releasing to production

Production deploys only from a version tag on `main`, and only after you approve it.

```sh
pnpm release patch   # or minor / major: bumps package.json, commits, tags vX.Y.Z, pushes
```

The tag starts the Release workflow (`.github/workflows/release.yml`). It checks that the tag is on `main` and matches `package.json`, runs the full test suite, builds with `.env.production`, then pauses on the `production` environment. Open the run under Actions, click **Review deployments**, and approve. It then deploys hosting, rules, and indexes to `cadence-jkn-prod`. The running version is shown at the bottom of the Me page.

To roll back hosting, use Hosting, Release history, Rollback in the Firebase console. To roll back rules, check out the previous tag and run `pnpm exec firebase deploy --only firestore --project prod`.

The deploy needs a service account key stored as an **environment** secret, so only the approved production job can read it. Create it as for dev below, but in `cadence-jkn-prod`, then:

```sh
gh secret set FIREBASE_SERVICE_ACCOUNT_PROD --env production --repo jakeknowlton/cadence < ~/Downloads/<key>.json && rm ~/Downloads/<key>.json
```

### Continuous deployment to dev

Every push to `main` runs lint, type-check, unit, rules, and end-to-end tests, then deploys to `cadence-jkn-dev` (`.github/workflows/ci.yml`). The deploy step needs a service account key in the repository secret `FIREBASE_SERVICE_ACCOUNT_DEV`; without it the step is skipped with a warning. One-time setup:

1. In the Google Cloud console for `cadence-jkn-dev`, IAM & Admin, Service Accounts: create `github-deploy` and grant it Firebase Hosting Admin, Firebase Rules Admin, Cloud Datastore Index Admin, and Viewer.
2. Keys tab: add a JSON key and download it.
3. Store it as the secret and delete the file:
   ```sh
   gh secret set FIREBASE_SERVICE_ACCOUNT_DEV < ~/Downloads/<key>.json && rm ~/Downloads/<key>.json
   ```

Project aliases are in `.firebaserc` (default is dev). Environments: `.env.development` (emulators), `.env.staging` (dev project), `.env.production` (prod project). All committed; Firebase web config values are public identifiers, not secrets.

In production the first admin is created by hand: sign in once, then in the Firebase console create `users/{uid}` with `email`, `displayName`, `photoURL: null`, `role: "admin"`, `timezone`, `status: "active"`, `createdAt`, `updatedAt`.
