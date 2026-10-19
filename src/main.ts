import './assets/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { VueFire, VueFireAuth } from 'vuefire'

import App from './App.vue'
import router from './router'
import { auth, firebaseApp, usingEmulators } from './firebase'
import { useThemeStore } from './stores/theme'
import { isChunkLoadError, reloadOnce } from './lib/reloadOnce'

const app = createApp(App)

app.use(createPinia())
useThemeStore() // applies the saved or system theme before first paint
app.use(router)
app.use(VueFire, { firebaseApp, modules: [VueFireAuth()] })

app.mount('#app')

// Safety net for a deploy that replaced a screen's code under an open page: reload once into the new version.
window.addEventListener('vite:preloadError', (e) => {
  if (reloadOnce()) e.preventDefault()
})
router.onError((err, to) => {
  if (isChunkLoadError(err)) reloadOnce(to.fullPath)
})

// Test hook: lets Playwright sign in against the Auth emulator without a Google popup. Emulator builds only.
if (import.meta.env.DEV && usingEmulators) {
  import('firebase/auth').then(({ createUserWithEmailAndPassword, signInWithEmailAndPassword }) => {
    ;(window as unknown as { __cadenceTest: unknown }).__cadenceTest = {
      async signIn(email: string, password: string) {
        try {
          await signInWithEmailAndPassword(auth, email, password)
        } catch {
          await createUserWithEmailAndPassword(auth, email, password)
        }
        return auth.currentUser?.uid
      },
      async refresh() {
        await auth.currentUser?.reload()
        await auth.currentUser?.getIdToken(true)
      },
    }
  })
}
