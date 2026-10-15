import { computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { signOut as firebaseSignOut } from 'firebase/auth'
import { useCurrentUser, useDocument } from 'vuefire'
import { auth, db } from '@/firebase'
import type { UserProfile } from '@/types/user'

export const useAuthStore = defineStore('auth', () => {
  // undefined while Firebase resolves the session, null when signed out
  const firebaseUser = useCurrentUser()

  const profileRef = computed(() =>
    firebaseUser.value ? doc(db, 'users', firebaseUser.value.uid) : null,
  )
  // undefined while loading, null when the doc does not exist (no accepted invite)
  const profile = useDocument<UserProfile>(profileRef)

  const isSignedIn = computed(() => !!firebaseUser.value)
  // Gate on the Firebase user too: the document binding can hold stale data briefly after sign-out.
  const hasProfile = computed(() => isSignedIn.value && !!profile.value)
  const isActive = computed(() => isSignedIn.value && profile.value?.status === 'active')
  const isAdmin = computed(() => isActive.value && profile.value?.role === 'admin')
  const uid = computed(() => firebaseUser.value?.uid ?? null)

  /** Resolves once the session and, if signed in, the profile document have loaded. */
  async function ready(): Promise<void> {
    if (firebaseUser.value === undefined) {
      await new Promise<void>((resolve) => {
        const stop = watch(firebaseUser, (u) => {
          if (u !== undefined) {
            stop()
            resolve()
          }
        })
      })
    }
    if (firebaseUser.value) await profile.promise.value
  }

  async function updateProfile(patch: Partial<Pick<UserProfile, 'displayName' | 'timezone' | 'photoURL'>>) {
    if (!profileRef.value) throw new Error('Not signed in')
    await updateDoc(profileRef.value, { ...patch, updatedAt: serverTimestamp() })
  }

  async function signOut() {
    await firebaseSignOut(auth)
  }

  return { firebaseUser, profile, uid, isSignedIn, hasProfile, isActive, isAdmin, ready, updateProfile, signOut }
})
