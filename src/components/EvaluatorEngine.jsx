import { useEffect, useMemo, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { Download, FileUp, Sigma } from 'lucide-react'
import ReportFairV from './ReportFairV'

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

function readExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = reader.result
        const workbook = XLSX.read(data, { type: 'array' })
        const firstSheetName = workbook.SheetNames[0]
        if (!firstSheetName) {
          reject(new Error('File Excel senza fogli validi.'))
          return
        }
        const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheetName], {
          defval: '',
        })
        resolve(jsonData)
      } catch (error) {
        reject(error)
      }
    }
    reader.onerror = () => reject(new Error('Errore nella lettura del file Excel.'))
    reader.readAsArrayBuffer(file)
  })
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

async function readTabularFile(file) {
  const name = (file?.name ?? '').toLowerCase()
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    return readExcelFile(file)
  }
  return readCsvFile(file)
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
  let noiseCells = 0
  let lossCells = 0
  let expectedCells = 0
  const totalCells = commonIds.length * DES_VARIABLE_KEYS.length

  const desByPatient = commonIds.map((id) => {
    const gt = gtMap.get(id)
    const op = opMap.get(id)
    let score = 0
    for (const key of DES_VARIABLE_KEYS) {
      const gtValue = gt[key]
      const opValue = op[key]
      const gtIsNotFound = isNotFound(gtValue)
      const opIsNotFound = isNotFound(opValue)

      if (!gtIsNotFound) {
        expectedCells += 1
        if (opIsNotFound || normalizeTextValue(opValue) === '') {
          lossCells += 1
        }
      }

      if (gtIsNotFound && !opIsNotFound) {
        noiseCells += 1
      } else if (!gtIsNotFound && !valueEquals(gtValue, opValue) && !opIsNotFound) {
        noiseCells += 1
      }

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
  const estimatedOnr = totalCells > 0 ? (noiseCells / totalCells) * 100 : 0
  const estimatedDlc = expectedCells > 0 ? (lossCells / expectedCells) * 100 : 0

  return {
    desByPatient,
    commonIdsCount: commonIds.length,
    meanDes,
    ttotal,
    abr,
    ee,
    estimatedOnr,
    estimatedDlc,
  }
}

function CsvDropzone({ title, onRowsParsed, rowsCount }) {
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')

  const parseAndSet = async (file) => {
    if (!file) {
      return
    }
    try {
      setError('')
      const rows = await readTabularFile(file)
      onRowsParsed(rows)
      setFileName(file.name)
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : 'Errore parsing CSV.')
      setFileName('')
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
        <span>Trascina CSV/XLSX/XLS o clicca per selezionare</span>
        <input
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(event) => parseAndSet(event.target.files?.[0])}
        />
      </label>
      <p className="mt-2 text-xs text-slate-500">Righe caricate: {rowsCount}</p>
      {fileName ? (
        <p className="mt-1 text-xs font-medium text-emerald-700">File caricato: {fileName}</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
    </div>
  )
}

function NumericInput({ label, value, onChange, disabled = false }) {
  return (
    <label className="grid gap-1">
      <span className="text-xs text-slate-600">{label}</span>
      <input
        type="number"
        step="0.01"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value || 0))}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-100"
      />
    </label>
  )
}

export default function EvaluatorEngine({ onResultsChange }) {
  const [groundTruthRows, setGroundTruthRows] = useState([])
  const [operatorRows, setOperatorRows] = useState({ A1: [], A2: [], B: [] })
  const [isExporting, setIsExporting] = useState(false)
  const reportRef = useRef(null)
  const [inputs, setInputs] = useState({
    A1: { t1: 0, t2: 0, onr: 0, dlc: 0 },
    A2: { t1: 0, t2: 0, onr: 0, dlc: 0 },
    B: { t1: 0, t2: 0, onr: 0, dlc: 0 },
  })
  const [metricMode, setMetricMode] = useState({
    A1: 'estimated',
    A2: 'estimated',
    B: 'estimated',
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
          estimatedOnr: 0,
          estimatedDlc: 0,
          onr: inputs[arm.key].onr,
          dlc: inputs[arm.key].dlc,
          onrMode: metricMode[arm.key],
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
        onr:
          metricMode[arm.key] === 'estimated' ? computed.estimatedOnr : inputs[arm.key].onr,
        dlc:
          metricMode[arm.key] === 'estimated' ? computed.estimatedDlc : inputs[arm.key].dlc,
        onrMode: metricMode[arm.key],
        t1: inputs[arm.key].t1,
        t2: inputs[arm.key].t2,
      }
    }

    return {
      groundTruthRowsCount: groundTruthRows.length,
      arms,
      ready: groundTruthRows.length > 0,
    }
  }, [groundTruthRows, inputs, metricMode, operatorRows])

  useEffect(() => {
    onResultsChange?.(results)
  }, [onResultsChange, results])

  const exportResultsPdf = async () => {
    if (!reportRef.current) {
      return
    }

    setIsExporting(true)
    try {
      const canvas = await html2canvas(reportRef.current, {
        scale: 2,
        backgroundColor: '#f8fafc',
        useCORS: true,
      })
      const imageData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageWidth = 210
      const pageHeight = 297
      const margin = 10
      const contentWidth = pageWidth - margin * 2
      const contentHeight = (canvas.height * contentWidth) / canvas.width

      let remainingHeight = contentHeight
      let yOffset = 0
      let pageIndex = 0
      while (remainingHeight > 0) {
        if (pageIndex > 0) {
          pdf.addPage()
        }
        const positionY = margin - yOffset
        pdf.addImage(imageData, 'PNG', margin, positionY, contentWidth, contentHeight)
        yOffset += pageHeight - margin * 2
        remainingHeight -= pageHeight - margin * 2
        pageIndex += 1
      }

      pdf.save('motore_valutazione_risultati.pdf')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <section className="grid gap-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <CsvDropzone
          title="Ground Truth - CSV/XLSX/XLS"
          rowsCount={groundTruthRows.length}
          onRowsParsed={setGroundTruthRows}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          {ARM_CONFIG.map((arm) => (
            <CsvDropzone
              key={arm.key}
              title={`Operatore - ${arm.label} (CSV/XLSX/XLS)`}
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
              <div className="mb-3 flex rounded-lg border border-slate-300 bg-white p-1 text-xs">
                <button
                  type="button"
                  onClick={() =>
                    setMetricMode((previous) => ({ ...previous, [arm.key]: 'manual' }))
                  }
                  className={`flex-1 rounded-md px-2 py-1 ${
                    metricMode[arm.key] === 'manual'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600'
                  }`}
                >
                  Manuale
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setMetricMode((previous) => ({ ...previous, [arm.key]: 'estimated' }))
                  }
                  className={`flex-1 rounded-md px-2 py-1 ${
                    metricMode[arm.key] === 'estimated'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600'
                  }`}
                >
                  Stimato
                </button>
              </div>
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
                  disabled={metricMode[arm.key] === 'estimated'}
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
                  disabled={metricMode[arm.key] === 'estimated'}
                  onChange={(value) =>
                    setInputs((previous) => ({
                      ...previous,
                      [arm.key]: { ...previous[arm.key], dlc: value },
                    }))
                  }
                />
              </div>
              {metricMode[arm.key] === 'manual' ? (
                <p className="mt-3 text-xs text-slate-500">
                  Modalita manuale: inserisci ONR e DLC come percentuali.
                </p>
              ) : (
                <p className="mt-3 text-xs text-slate-500">
                  Modalita stimata: ONR/DLC derivati automaticamente da confronto CSV.
                </p>
              )}
            </article>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={exportResultsPdf}
          disabled={isExporting}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
        >
          <Download className="h-4 w-4" />
          {isExporting ? 'Export PDF in corso...' : 'Esporta risultati PDF'}
        </button>
      </div>

      <div ref={reportRef} className="grid gap-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div>
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
                  <p className="mt-1 text-sm text-slate-700">
                    ONR: {item.onr.toFixed(2)}% ({item.onrMode === 'estimated' ? 'stimato' : 'manuale'})
                  </p>
                  <p className="mt-1 text-sm text-slate-700">
                    DLC: {item.dlc.toFixed(2)}% ({item.onrMode === 'estimated' ? 'stimato' : 'manuale'})
                  </p>
                </article>
              )
            })}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h4 className="text-sm font-semibold text-slate-900">Legenda sigle</h4>
          <div className="mt-3 grid gap-2 text-sm text-slate-700 md:grid-cols-2">
            <p>
              <strong>DES</strong>: Data Extraction Score (0-20 per paziente).
            </p>
            <p>
              <strong>T1</strong>: tempo iniziale operativo del braccio (min).
            </p>
            <p>
              <strong>T2</strong>: tempo adattativo/seconda fase del braccio (min).
            </p>
            <p>
              <strong>Ttotal</strong>: somma tempi, T1 + T2.
            </p>
            <p>
              <strong>ABR</strong>: Adaptation Burden Ratio, T2 / T1.
            </p>
            <p>
              <strong>EE</strong>: Extraction Efficiency, DES medio / Ttotal.
            </p>
            <p>
              <strong>ONR</strong>: Operational Noise Rate (%), manuale o stimato.
            </p>
            <p>
              <strong>DLC</strong>: Data Loss/Leakage Coefficient (%), manuale o stimato.
            </p>
            <p>
              <strong>ONR stimato</strong>: mismatch non-missing e allucinazioni su celle confrontate.
            </p>
            <p>
              <strong>DLC stimato</strong>: celle mancanti su celle attese (GT non NOT_FOUND).
            </p>
          </div>
        </div>
      </div>

      <ReportFairV evaluatorResults={results} />
    </section>
  )
}
