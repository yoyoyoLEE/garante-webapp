import { useMemo, useState } from 'react'
import {
  ClipboardCheck,
  FileText,
  ShieldCheck,
  Stethoscope,
} from 'lucide-react'
import GeneratorEngine from './components/GeneratorEngine'
import EvaluatorEngine from './components/EvaluatorEngine'

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

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto grid min-h-screen max-w-[1600px] grid-cols-1 lg:grid-cols-[280px_1fr]">
        <aside className="flex flex-col gap-8 bg-slate-900 p-8 text-slate-100 shadow-sm">
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
