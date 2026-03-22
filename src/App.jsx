import { useMemo, useState } from 'react'
import {
  ClipboardCheck,
  FileText,
  Loader2,
  LogOut,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react'
import GeneratorEngine from './components/GeneratorEngine'
import EvaluatorEngine from './components/EvaluatorEngine'
import LoginPage from './components/LoginPage.jsx'
import FirebaseConfigMissing from './components/FirebaseConfigMissing.jsx'
import { useAuth } from './contexts/AuthContext.jsx'

function App() {
  const tabs = useMemo(
    () => [
      {
        id: 'multimodal-generator',
        label: 'Generatore Multimodale',
        icon: FileText,
        description:
          'Motore per la generazione procedurale di dataset clinico e referti multimodali.',
      },
      {
        id: 'evaluation-engine',
        label: 'Motore di Valutazione',
        icon: ClipboardCheck,
        description:
          'Confronto statistico tra bracci, calcolo DES e indicatori di efficienza.',
      },
    ],
    [],
  )

  const [activeTabId, setActiveTabId] = useState(tabs[0].id)
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0]

  const { firebaseReady, user, loading, signOut } = useAuth()

  if (!firebaseReady) {
    return <FirebaseConfigMissing />
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto grid min-h-screen max-w-[1600px] grid-cols-1 lg:grid-cols-[280px_1fr]">
        <aside className="flex min-h-screen flex-col gap-8 bg-slate-900 p-8 text-slate-100 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-indigo-600/90 p-2">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                Clinical Platform
              </p>
              <h1 className="text-lg font-semibold">Garante Web App</h1>
            </div>
          </div>

          <div className="rounded-lg border border-slate-700 bg-slate-800/70 p-4 shadow-sm">
            <p className="text-sm font-medium text-slate-200">
              Data Lake Clinico
            </p>
            <p className="mt-2 text-sm text-slate-400">
              Ambiente operativo per validazione multimodale e controllo
              statistico FAIR-V.
            </p>
          </div>

          <nav className="flex flex-1 flex-col gap-2">
            {tabs.map((tab) => {
              const TabIcon = tab.icon
              const isActive = tab.id === activeTabId

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTabId(tab.id)}
                  className={`flex items-center gap-3 rounded-lg px-4 py-3 text-left text-sm transition ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <TabIcon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </nav>

          <div className="mt-auto border-t border-slate-700 pt-6">
            <p
              className="mb-2 truncate text-xs text-slate-500"
              title={user.email ?? ''}
            >
              {user.email ?? user.uid}
            </p>
            <button
              type="button"
              onClick={() => signOut()}
              className="flex w-full items-center gap-2 rounded-lg px-4 py-2 text-left text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
            >
              <LogOut className="h-4 w-4" />
              Esci
            </button>
          </div>
        </aside>

        <main className="p-8 lg:p-10">
          <header className="mb-8 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium uppercase tracking-wider text-slate-500">
                Dashboard Medica
              </p>
              <h2 className="mt-2 text-3xl font-semibold text-slate-900">
                {activeTab.label}
              </h2>
              <p className="mt-3 max-w-3xl text-sm text-slate-500">
                {activeTab.description}
              </p>
            </div>
            <div className="hidden rounded-lg bg-white p-3 text-slate-700 shadow-sm ring-1 ring-slate-200 sm:block">
              <Stethoscope className="h-5 w-5" />
            </div>
          </header>

          {activeTabId === 'multimodal-generator' ? (
            <GeneratorEngine />
          ) : (
            <EvaluatorEngine />
          )}
        </main>
      </div>
    </div>
  )
}

export default App
