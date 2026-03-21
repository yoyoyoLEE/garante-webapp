import { useEffect, useMemo, useState } from 'react'
import Papa from 'papaparse'
import { FileUp, Sigma } from 'lucide-react'

const DES_VARIABLE_KEYS = [
  'age',
  'biologicalsex',
  'bmi',
  'admissionsetting',
  'primarydiagnosis',
  'asascore',
  'diabetesmellitus',
  'hypertension',
  'preophemoglobin',
  'preopwbc',
  'surgicalprocedure',
  'surgicalapproach',
  'operativetimeminutes',
  'estimatedbloodlossml',
  'intraoperativecomplications',
  'antibioticprophylaxis',
  'postopday1painvas',
  'postopsurgicalsiteinfection',
  'lengthofstaydays',
  'dischargedestination',
]

const ARM_CONFIG = [
  { key: 'A1', label: 'Braccio A1' },
  { key: 'A2', label: 'Braccio A2' },
  { key: 'B', label: 'Braccio B' },
]

function canonicalizeKey(value) {
  return (value ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

function normalizeTextValue(value) {
  return (value ?? '')
    .toString()
    .trim()
    .replace(/\s+/g, ' ')
}

function isNotFound(value) {
  return normalizeTextValue(value).toUpperCase() === 'NOT_FOUND'
}

function parseNumber(value) {
  const parsed = Number(normalizeTextValue(value).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function valueEquals(gtRaw, opRaw) {
  const gt = normalizeTextValue(gtRaw)
  const op = normalizeTextValue(opRaw)

  if (isNotFound(gt)) {
    return isNotFound(op)
  }

  const gtNum = parseNumber(gt)
  const opNum = parseNumber(op)
  if (gtNum !== null && opNum !== null) {
    return Math.abs(gtNum - opNum) < 1e-6
  }

  return gt.toLowerCase() === op.toLowerCase()
}

function toCanonicalRow(rawRow) {
  const row = {}
  Object.entries(rawRow ?? {}).forEach(([key, value]) => {
    row[canonicalizeKey(key)] = value
  })
  return row
}

function getPatientId(canonicalRow, fallbackIndex) {
  const knownIdKeys = ['patientid', 'patient', 'id', 'recordid', 'ptid']
  for (const key of knownIdKeys) {
    const value = normalizeTextValue(canonicalRow[key])
    if (value) {
      return value
    }
  }
  return `ROW_${fallbackIndex + 1}`
}

function readCsvFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (result.errors?.length) {
          reject(new Error(result.errors[0].message))
          return
        }
        resolve(result.data ?? [])
      },
      error: (error) => reject(error),
    })
  })
}

function computeArmMetrics({ groundTruthRows, operatorRows, t1, t2 }) {
  const gtMap = new Map()
  groundTruthRows.forEach((rawRow, index) => {
    const row = toCanonicalRow(rawRow)
    gtMap.set(getPatientId(row, index), row)
  })

  const opMap = new Map()
  operatorRows.forEach((rawRow, index) => {
    const row = toCanonicalRow(rawRow)
    opMap.set(getPatientId(row, index), row)
  })

  const commonIds = [...gtMap.keys()].filter((id) => opMap.has(id))
  const desByPatient = commonIds.map((id) => {
    const gt = gtMap.get(id)
    const op = opMap.get(id)
    let score = 0
    for (const key of DES_VARIABLE_KEYS) {
      if (valueEquals(gt[key], op[key])) {
        score += 1
      }
    }
    return { patientId: id, score }
  })

  const meanDes =
    desByPatient.length > 0
      ? desByPatient.reduce((acc, row) => acc + row.score, 0) / desByPatient.length
      : 0
  const ttotal = t1 + t2
  const abr = t1 > 0 ? t2 / t1 : 0
  const ee = ttotal > 0 ? meanDes / ttotal : 0

  return {
    desByPatient,
    commonIdsCount: commonIds.length,
    meanDes,
    ttotal,
    abr,
    ee,
  }
}

function CsvDropzone({ title, onRowsParsed, rowsCount }) {
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')

  const parseAndSet = async (file) => {
    if (!file) {
      return
    }
    try {
      setError('')
      const rows = await readCsvFile(file)
      onRowsParsed(rows)
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'Errore parsing CSV.')
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-3 text-sm font-semibold text-slate-900">{title}</p>
      <label
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-5 text-sm transition ${
          dragOver
            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
            : 'border-slate-300 bg-slate-50 text-slate-600 hover:bg-slate-100'
        }`}
        onDragOver={(event) => {
          event.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragOver(false)
          parseAndSet(event.dataTransfer.files?.[0])
        }}
      >
        <FileUp className="h-5 w-5" />
        <span>Trascina CSV o clicca per selezionare</span>
        <input
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(event) => parseAndSet(event.target.files?.[0])}
        />
      </label>
      <p className="mt-2 text-xs text-slate-500">Righe caricate: {rowsCount}</p>
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
    </div>
  )
}

function NumericInput({ label, value, onChange }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs text-slate-600">{label}</span>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(event) => onChange(Number(event.target.value || 0))}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
      />
    </label>
  )
}

export default function EvaluatorEngine({ onResultsChange }) {
  const [groundTruthRows, setGroundTruthRows] = useState([])
  const [operatorRows, setOperatorRows] = useState({ A1: [], A2: [], B: [] })
  const [inputs, setInputs] = useState({
    A1: { t1: 0, t2: 0, onr: 0, dlc: 0 },
    A2: { t1: 0, t2: 0, onr: 0, dlc: 0 },
    B: { t1: 0, t2: 0, onr: 0, dlc: 0 },
  })

  const results = useMemo(() => {
    const hasGroundTruth = groundTruthRows.length > 0
    const arms = {}

    for (const arm of ARM_CONFIG) {
      const rows = operatorRows[arm.key]
      if (!hasGroundTruth || rows.length === 0) {
        arms[arm.key] = {
          label: arm.label,
          desByPatient: [],
          commonIdsCount: 0,
          meanDes: 0,
          ttotal: 0,
          abr: 0,
          ee: 0,
          onr: inputs[arm.key].onr,
          dlc: inputs[arm.key].dlc,
          t1: inputs[arm.key].t1,
          t2: inputs[arm.key].t2,
        }
        continue
      }

      const computed = computeArmMetrics({
        groundTruthRows,
        operatorRows: rows,
        t1: inputs[arm.key].t1,
        t2: inputs[arm.key].t2,
      })

      arms[arm.key] = {
        label: arm.label,
        ...computed,
        onr: inputs[arm.key].onr,
        dlc: inputs[arm.key].dlc,
        t1: inputs[arm.key].t1,
        t2: inputs[arm.key].t2,
      }
    }

    return {
      groundTruthRowsCount: groundTruthRows.length,
      arms,
      ready: groundTruthRows.length > 0,
    }
  }, [groundTruthRows, inputs, operatorRows])

  useEffect(() => {
    onResultsChange(results)
  }, [onResultsChange, results])

  return (
    <section className="grid gap-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <CsvDropzone
          title="Ground Truth CSV"
          rowsCount={groundTruthRows.length}
          onRowsParsed={setGroundTruthRows}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          {ARM_CONFIG.map((arm) => (
            <CsvDropzone
              key={arm.key}
              title={`CSV Operatore - ${arm.label}`}
              rowsCount={operatorRows[arm.key].length}
              onRowsParsed={(rows) =>
                setOperatorRows((previous) => ({ ...previous, [arm.key]: rows }))
              }
            />
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Sigma className="h-4 w-4 text-indigo-600" />
          <h3 className="text-base font-semibold text-slate-900">
            Input tempi e indici per braccio
          </h3>
        </div>
        <div className="grid gap-4 lg:grid-cols-3">
          {ARM_CONFIG.map((arm) => (
            <article key={arm.key} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="mb-3 text-sm font-semibold text-slate-800">{arm.label}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <NumericInput
                  label="T1 (min)"
                  value={inputs[arm.key].t1}
                  onChange={(value) =>
                    setInputs((previous) => ({
                      ...previous,
                      [arm.key]: { ...previous[arm.key], t1: value },
                    }))
                  }
                />
                <NumericInput
                  label="T2 (min)"
                  value={inputs[arm.key].t2}
                  onChange={(value) =>
                    setInputs((previous) => ({
                      ...previous,
                      [arm.key]: { ...previous[arm.key], t2: value },
                    }))
                  }
                />
                <NumericInput
                  label="ONR (%)"
                  value={inputs[arm.key].onr}
                  onChange={(value) =>
                    setInputs((previous) => ({
                      ...previous,
                      [arm.key]: { ...previous[arm.key], onr: value },
                    }))
                  }
                />
                <NumericInput
                  label="DLC (%)"
                  value={inputs[arm.key].dlc}
                  onChange={(value) =>
                    setInputs((previous) => ({
                      ...previous,
                      [arm.key]: { ...previous[arm.key], dlc: value },
                    }))
                  }
                />
              </div>
            </article>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="mb-4 text-base font-semibold text-slate-900">Output DES e metriche derivate</h3>
        <div className="grid gap-4 lg:grid-cols-3">
          {ARM_CONFIG.map((arm) => {
            const item = results.arms[arm.key]
            return (
              <article key={arm.key} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">{arm.label}</p>
                <p className="mt-2 text-xs text-slate-600">
                  Pazienti confrontabili: {item.commonIdsCount}
                </p>
                <p className="mt-1 text-sm text-slate-700">DES medio: {item.meanDes.toFixed(2)} / 20</p>
                <p className="mt-1 text-sm text-slate-700">Ttotal: {item.ttotal.toFixed(2)} min</p>
                <p className="mt-1 text-sm text-slate-700">ABR: {item.abr.toFixed(3)}</p>
                <p className="mt-1 text-sm text-slate-700">EE: {item.ee.toFixed(4)}</p>
              </article>
            )
          })}
        </div>
      </div>
    </section>
  )
}
