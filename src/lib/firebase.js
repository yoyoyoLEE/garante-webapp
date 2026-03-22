import { initializeApp, getApps } from 'firebase/app'
import {
  browserLocalPersistence,
  getAuth,
  initializeAuth,
} from 'firebase/auth'

/**
 * Config Web da Firebase Console → Impostazioni progetto → Le tue app.
 * Valori pubblici (la chiave API è limitata per dominio in Google Cloud).
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export function isFirebaseConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
      firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.appId,
  )
}

/** @returns {import('firebase/app').FirebaseApp | null} */
export function getFirebaseApp() {
  if (!isFirebaseConfigured()) return null
  if (!getApps().length) {
    return initializeApp(firebaseConfig)
  }
  return getApps()[0]
}

/** Istanza Auth in cache (persistenza locale: resta connesso dopo chiusura browser). */
let authSingleton = null

/** @returns {import('firebase/auth').Auth | null} */
export function getFirebaseAuth() {
  const app = getFirebaseApp()
  if (!app) return null
  if (authSingleton) return authSingleton

  try {
    authSingleton = initializeAuth(app, {
      persistence: browserLocalPersistence,
    })
  } catch (e) {
    // Hot reload / doppia init in dev
    if (e?.code === 'auth/already-initialized') {
      authSingleton = getAuth(app)
    } else {
      throw e
    }
  }
  return authSingleton
}
