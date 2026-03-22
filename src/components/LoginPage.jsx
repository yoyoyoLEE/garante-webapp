import { useState } from 'react'
import { Loader2, LogIn, ShieldCheck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext.jsx'

export default function LoginPage() {
  const {
    signInEmailPassword,
    registerEmailPassword,
    signInGoogle,
    loading: authLoading,
  } = useAuth()
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleEmailSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      if (mode === 'signin') {
        await signInEmailPassword(email.trim(), password)
      } else {
        await registerEmailPassword(email.trim(), password)
      }
    } catch (err) {
      const code = err?.code || ''
      const map = {
        'auth/invalid-email': 'Indirizzo e-mail non valido.',
        'auth/user-disabled': 'Account disabilitato.',
        'auth/user-not-found': 'Nessun account con questa e-mail.',
        'auth/wrong-password': 'Password errata.',
        'auth/invalid-credential': 'Credenziali non valide.',
        'auth/email-already-in-use': 'E-mail già registrata.',
        'auth/weak-password': 'Password troppo debole (min. 6 caratteri).',
      }
      setError(map[code] || err?.message || 'Accesso non riuscito.')
    } finally {
      setBusy(false)
    }
  }

  async function handleGoogle() {
    setError('')
    setBusy(true)
    try {
      await signInGoogle()
    } catch (err) {
      const code = err?.code || ''
      if (code === 'auth/popup-closed-by-user') {
        setError('Finestra Google chiusa. Riprova.')
      } else {
        setError(err?.message || 'Accesso con Google non riuscito.')
      }
    } finally {
      setBusy(false)
    }
  }

  const disabled = busy || authLoading

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-8 flex items-center gap-3">
          <div className="rounded-lg bg-indigo-600 p-2 text-white shadow-sm">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Accesso riservato
            </p>
            <h1 className="text-xl font-semibold text-slate-900">
              Garante Web App
            </h1>
          </div>
        </div>

        <p className="mb-6 text-sm text-slate-500">
          Accedi con e-mail e password oppure con Google per utilizzare la
          piattaforma.
        </p>

        {error ? (
          <div
            className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <form onSubmit={handleEmailSubmit} className="flex flex-col gap-4">
          <div>
            <label
              htmlFor="login-email"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              E-mail
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none ring-indigo-600 focus:ring-2"
              disabled={disabled}
            />
          </div>
          <div>
            <label
              htmlFor="login-password"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete={
                mode === 'signin' ? 'current-password' : 'new-password'
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900 shadow-sm outline-none ring-indigo-600 focus:ring-2"
              disabled={disabled}
            />
          </div>

          <button
            type="submit"
            disabled={disabled}
            className="flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            {mode === 'signin' ? 'Accedi' : 'Crea account'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          {mode === 'signin' ? (
            <>
              Non hai un account?{' '}
              <button
                type="button"
                className="font-medium text-indigo-600 hover:underline"
                onClick={() => {
                  setMode('signup')
                  setError('')
                }}
              >
                Registrati
              </button>
            </>
          ) : (
            <>
              Hai già un account?{' '}
              <button
                type="button"
                className="font-medium text-indigo-600 hover:underline"
                onClick={() => {
                  setMode('signin')
                  setError('')
                }}
              >
                Accedi
              </button>
            </>
          )}
        </p>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-slate-400">oppure</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={disabled}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <svg className="h-5 w-5" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
          )}
          Continua con Google
        </button>
      </div>
    </div>
  )
}
