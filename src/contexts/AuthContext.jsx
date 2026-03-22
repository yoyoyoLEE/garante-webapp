/* eslint-disable react/prop-types -- AuthProvider è il root provider */
/* eslint-disable react-refresh/only-export-components -- hook useAuth esposto insieme al provider */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const firebaseReady = isFirebaseConfigured()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(firebaseReady)

  useEffect(() => {
    if (!firebaseReady) {
      setLoading(false)
      return undefined
    }
    const auth = getFirebaseAuth()
    if (!auth) {
      setLoading(false)
      return undefined
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
    })
    return () => unsub()
  }, [firebaseReady])

  const signInEmailPassword = useCallback(async (email, password) => {
    const auth = getFirebaseAuth()
    if (!auth) throw new Error('Firebase non configurato')
    await signInWithEmailAndPassword(auth, email, password)
  }, [])

  const registerEmailPassword = useCallback(async (email, password) => {
    const auth = getFirebaseAuth()
    if (!auth) throw new Error('Firebase non configurato')
    await createUserWithEmailAndPassword(auth, email, password)
  }, [])

  const signInGoogle = useCallback(async () => {
    const auth = getFirebaseAuth()
    if (!auth) throw new Error('Firebase non configurato')
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    await signInWithPopup(auth, provider)
  }, [])

  const signOutUser = useCallback(async () => {
    const auth = getFirebaseAuth()
    if (!auth) return
    await signOut(auth)
  }, [])

  const value = useMemo(
    () => ({
      firebaseReady,
      user,
      loading,
      signInEmailPassword,
      registerEmailPassword,
      signInGoogle,
      signOut: signOutUser,
    }),
    [
      firebaseReady,
      user,
      loading,
      signInEmailPassword,
      registerEmailPassword,
      signInGoogle,
      signOutUser,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth deve essere usato dentro AuthProvider')
  }
  return ctx
}
