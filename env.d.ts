/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/vue" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string
  readonly VITE_FIREBASE_AUTH_DOMAIN: string
  readonly VITE_FIREBASE_PROJECT_ID: string
  readonly VITE_FIREBASE_APP_ID: string
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string
  readonly VITE_FIREBASE_VAPID_KEY?: string
  readonly VITE_USE_EMULATORS?: string
  /** package.json version, set at build time */
  readonly VITE_APP_VERSION: string
  /** short commit hash of the build, set at build time; may be empty */
  readonly VITE_APP_COMMIT: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
