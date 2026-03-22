import { ShieldAlert } from 'lucide-react'

export default function FirebaseConfigMissing() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6 text-slate-900">
      <div className="max-w-lg rounded-lg border border-amber-200 bg-white p-8 shadow-sm">
        <div className="mb-4 flex items-center gap-3 text-amber-800">
          <ShieldAlert className="h-8 w-8 shrink-0" />
          <h1 className="text-lg font-semibold">Configurazione Firebase mancante</h1>
        </div>
        <p className="text-sm text-slate-600">
          Crea un file <code className="rounded bg-slate-100 px-1">.env.local</code>{' '}
          nella root del progetto e imposta le variabili{' '}
          <code className="rounded bg-slate-100 px-1">VITE_FIREBASE_*</code>{' '}
          copiandole da Firebase Console → Impostazioni progetto → Le tue app.
        </p>
        <p className="mt-3 text-sm text-slate-600">
          Per il deploy su GitHub Actions, definisci le stesse variabili come{' '}
          <strong>Repository variables</strong> (scheda Variables) e assicurati che
          il workflow le passi al comando <code className="rounded bg-slate-100 px-1">npm run build</code>.
        </p>
      </div>
    </div>
  )
}
