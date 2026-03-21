import { useMemo, useState } from 'react'
import JSZip from 'jszip'
import Papa from 'papaparse'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  PlayCircle,
} from 'lucide-react'

const TOTAL_PATIENTS = 330
const RATE_LIMIT_SLEEP_MS = 2500
const CORRUPTION_RATE = 0.1
const OPENROUTER_MODEL = 'meta-llama/llama-3.3-70b-instruct:free'
const STORAGE_KEY = 'garante.generator.checkpoint.v1'
const CORRUPTED_MARKER = '[CORRUPTED_FILE]'
const DOC_KEYS = ['txt_ingresso', 'jpg_operatorio', 'pdf_dimissione']

const CLINICAL_VARIABLES = [
  { id: 'V01', key: 'age' },
  { id: 'V02', key: 'biologicalSex' },
  { id: 'V03', key: 'bmi' },
  { id: 'V04', key: 'admissionSetting' },
  { id: 'V05', key: 'primaryDiagnosis' },
  { id: 'V06', key: 'asaScore' },
  { id: 'V07', key: 'diabetesMellitus' },
  { id: 'V08', key: 'hypertension' },
  { id: 'V09', key: 'preopHemoglobin' },
  { id: 'V10', key: 'preopWbc' },
  { id: 'V11', key: 'surgicalProcedure' },
  { id: 'V12', key: 'surgicalApproach' },
  { id: 'V13', key: 'operativeTimeMinutes' },
  { id: 'V14', key: 'estimatedBloodLossMl' },
  { id: 'V15', key: 'intraoperativeComplications' },
  { id: 'V16', key: 'antibioticProphylaxis' },
  { id: 'V17', key: 'postopDay1PainVas' },
  { id: 'V18', key: 'postopSurgicalSiteInfection' },
  { id: 'V19', key: 'lengthOfStayDays' },
  { id: 'V20', key: 'dischargeDestination' },
  { id: 'H01', key: 'surgicalEnergyDeviceBrand' },
  { id: 'H02', key: 'pathologySpecimenSent' },
  { id: 'H03', key: 'nonPharmacologicalAllergy' },
]

function hashSeed(input) {
  let h = 1779033703 ^ input.length
  for (let i = 0; i < input.length; i += 1) {
    h = Math.imul(h ^ input.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return (h >>> 0) || 1
}

function mulberry32(seed) {
  return function next() {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickFrom(list, rng) {
  return list[Math.floor(rng() * list.length)]
}

function boolToYesNo(v) {
  return v ? 'Yes' : 'No'
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function toMultilineText(value) {
  return (value ?? '').toString().replace(/\r\n/g, '\n')
}

function createPdfArrayBuffer(patientId, text) {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  pdf.setFillColor(241, 245, 249)
  pdf.rect(0, 0, 210, 30, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(13)
  pdf.text('GARANTE WEB APP - U.O. Chirurgia Generale', 14, 14)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.text(`Referto di dimissione | ${patientId}`, 14, 21)
  pdf.text(new Date().toLocaleDateString('it-IT'), 170, 21)

  pdf.setFont('times', 'normal')
  pdf.setFontSize(11)
  const wrapped = pdf.splitTextToSize(toMultilineText(text), 180)
  let y = 36
  for (const line of wrapped) {
    if (y > 280) {
      pdf.addPage()
      y = 20
    }
    pdf.text(line, 14, y)
    y += 5.2
  }

  return pdf.output('arraybuffer')
}

async function canvasToJpegBlob(canvas, quality = 0.75) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Impossibile convertire canvas in JPG'))
          return
        }
        resolve(blob)
      },
      'image/jpeg',
      quality,
    )
  })
}

async function createJpgBlobFromText(patientId, text) {
  const wrapper = document.createElement('div')
  wrapper.style.position = 'fixed'
  wrapper.style.left = '-100000px'
  wrapper.style.top = '0'
  wrapper.style.width = '1000px'
  wrapper.style.padding = '28px'
  wrapper.style.background = '#f8fafc'
  wrapper.style.color = '#0f172a'
  wrapper.style.border = '1px solid #cbd5e1'
  wrapper.style.fontFamily = '"Courier New", Courier, monospace'
  wrapper.style.fontSize = '15px'
  wrapper.style.lineHeight = '1.55'
  wrapper.style.whiteSpace = 'pre-wrap'
  wrapper.style.filter = 'contrast(0.88) blur(0.3px)'
  wrapper.style.boxShadow = 'inset 0 0 0 9999px rgba(248,250,252,0.04)'
  wrapper.style.backgroundImage =
    'radial-gradient(rgba(15,23,42,0.075) 0.45px, transparent 0.5px)'
  wrapper.style.backgroundSize = '3px 3px'
  wrapper.textContent = `REPORT OPERATORIO - ${patientId}\n\n${toMultilineText(text)}`
  document.body.appendChild(wrapper)

  try {
    const canvas = await html2canvas(wrapper, {
      scale: 1.5,
      backgroundColor: '#f8fafc',
      useCORS: true,
    })
    return await canvasToJpegBlob(canvas, 0.72)
  } finally {
    document.body.removeChild(wrapper)
  }
}

function buildPatient(seed, patientIndex) {
  const rng = mulberry32(hashSeed(`${seed}-${patientIndex}`))
  const isUrgent = rng() >= 0.5
  const sex = rng() >= 0.5 ? 'M' : 'F'
  const approach = pickFrom(['Open', 'Laparoscopic', 'Robotic'], rng)
  const age = 18 + Math.floor(rng() * 73)
  const bmi = (18 + rng() * 27).toFixed(1)
  const asaScore = pickFrom(['I', 'II', 'III', 'IV'], rng)

  const electiveDx = [
    'Colelitiasi sintomatica sottoposta a Colecistectomia VLS',
    'Ernia inguinale monolaterale sottoposta a Ernioplastica',
    'Neoplasia del colon sottoposta a Resezione colica',
  ]
  const urgentDx = [
    'Appendicite acuta sottoposta a Appendicectomia',
    'Occlusione intestinale sottoposta a Laparotomia esplorativa',
    'Peritonite da ulcera perforata sottoposta a Sutura gastrica',
  ]

  const procedures = [
    'Colecistectomia',
    'Appendicectomia',
    'Ernioplastica',
    'Resezione colica',
    'Laparotomia esplorativa',
  ]

  return {
    patientId: `PT-${String(patientIndex + 1).padStart(3, '0')}`,
    age,
    biologicalSex: sex,
    bmi: Number(bmi),
    admissionSetting: isUrgent ? 'Urgent' : 'Elective',
    primaryDiagnosis: isUrgent ? pickFrom(urgentDx, rng) : pickFrom(electiveDx, rng),
    asaScore,
    diabetesMellitus: boolToYesNo(rng() < 0.24),
    hypertension: boolToYesNo(rng() < 0.31),
    preopHemoglobin: Number((10.2 + rng() * 5.5).toFixed(1)),
    preopWbc: Math.round(4200 + rng() * 16000),
    surgicalProcedure: pickFrom(procedures, rng),
    surgicalApproach: approach,
    operativeTimeMinutes: Math.round(35 + rng() * 220),
    estimatedBloodLossMl: Math.round(rng() * 700),
    intraoperativeComplications: boolToYesNo(rng() < 0.13),
    antibioticProphylaxis: boolToYesNo(rng() < 0.9),
    postopDay1PainVas: Math.round(rng() * 10),
    postopSurgicalSiteInfection: boolToYesNo(rng() < 0.1),
    lengthOfStayDays: Math.max(1, Math.round(1 + rng() * 12)),
    dischargeDestination: pickFrom(['Home', 'Rehab', 'Transfer'], rng),
    surgicalEnergyDeviceBrand: pickFrom(
      ['Harmonic', 'LigaSure', 'Monopolare', 'Bipolare'],
      rng,
    ),
    pathologySpecimenSent: boolToYesNo(rng() < 0.7),
    nonPharmacologicalAllergy: pickFrom(
      ['Nessuna', 'Lattice', 'Iodio', 'Cerotti'],
      rng,
    ),
  }
}

function assignVariableMask(seed, patientIndex) {
  const rng = mulberry32(hashSeed(`mask-${seed}-${patientIndex}`))
  const map = {}
  for (const variable of CLINICAL_VARIABLES) {
    map[variable.key] = pickFrom(DOC_KEYS, rng)
  }
  return map
}

function computeCorruption(seed, patientIndex) {
  const rng = mulberry32(hashSeed(`corruption-${seed}-${patientIndex}`))
  return {
    txt_ingresso: rng() < CORRUPTION_RATE,
    jpg_operatorio: rng() < CORRUPTION_RATE,
    pdf_dimissione: rng() < CORRUPTION_RATE,
  }
}

function buildGroundTruth(patient, variableToDoc, corruptedDocs) {
  const groundTruth = { patientId: patient.patientId }
  for (const variable of CLINICAL_VARIABLES) {
    const assignedDoc = variableToDoc[variable.key]
    groundTruth[variable.key] = corruptedDocs[assignedDoc]
      ? 'NOT_FOUND'
      : patient[variable.key]
  }
  return groundTruth
}

function buildPromptInput(patient, variableToDoc) {
  return {
    patient,
    distributionMask: variableToDoc,
    formatRules: {
      language: 'Italiano clinico formale',
      outputShape: ['txt_ingresso', 'jpg_operatorio', 'pdf_dimissione'],
      strictJsonOnly: true,
    },
  }
}

async function requestOpenRouterCompletion(apiKey, promptPayload) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Sei un medical report generator. Devi rispondere esclusivamente con un JSON valido e senza testo extra.',
        },
        {
          role: 'user',
          content: `Genera 3 referti testuali coerenti con i dati clinici. Ritorna solo JSON con chiavi esatte txt_ingresso, jpg_operatorio, pdf_dimissione.
Regola: concentra ogni variabile nel documento indicato dalla distributionMask. Negli altri documenti usa contenuto contestuale ma non duplicare variabili strutturate.
Input: ${JSON.stringify(promptPayload)}`,
        },
      ],
    }),
  })

  if (response.status === 429) {
    const err = new Error('Rate limited by OpenRouter')
    err.code = 429
    throw err
  }

  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`OpenRouter error ${response.status}: ${detail}`)
  }

  const data = await response.json()
  const content = data?.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('OpenRouter response missing content')
  }

  let parsed
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new Error('OpenRouter returned non-JSON content')
  }

  for (const key of DOC_KEYS) {
    if (typeof parsed[key] !== 'string') {
      throw new Error(`Invalid JSON shape: missing ${key}`)
    }
  }

  return parsed
}

function loadCheckpoint() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) {
      return null
    }
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function persistCheckpoint(payload) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

export default function GeneratorEngine() {
  const [secretSeed, setSecretSeed] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [statusMessage, setStatusMessage] = useState('In attesa di avvio.')
  const [errorMessage, setErrorMessage] = useState('')
  const [progressIndex, setProgressIndex] = useState(0)
  const [generatedRows, setGeneratedRows] = useState([])
  const [groundTruthRows, setGroundTruthRows] = useState([])
  const [corruptionCount, setCorruptionCount] = useState(0)
  const [resumedFromCheckpoint, setResumedFromCheckpoint] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState('')

  const progressPercent = useMemo(
    () => Math.round((progressIndex / TOTAL_PATIENTS) * 100),
    [progressIndex],
  )

  const handleGenerate = async () => {
    const seed = secretSeed.trim()
    setErrorMessage('')

    if (!seed) {
      setErrorMessage('Inserisci il Secret Seed prima di iniziare.')
      return
    }

    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY
    if (!apiKey) {
      setErrorMessage(
        'API key OpenRouter non trovata. Configura VITE_OPENROUTER_API_KEY nel file .env.local.',
      )
      return
    }

    setIsRunning(true)

    let startAt = 0
    let workingGeneratedRows = []
    let workingGroundTruthRows = []
    let workingCorruptionCount = 0

    const checkpoint = loadCheckpoint()
    if (checkpoint?.seed === seed) {
      startAt = Number(checkpoint.nextIndex ?? 0)
      workingGeneratedRows = checkpoint.generatedRows ?? []
      workingGroundTruthRows = checkpoint.groundTruthRows ?? []
      workingCorruptionCount = Number(checkpoint.corruptionCount ?? 0)
      setGeneratedRows(workingGeneratedRows)
      setGroundTruthRows(workingGroundTruthRows)
      setCorruptionCount(workingCorruptionCount)
      setProgressIndex(startAt)
      setResumedFromCheckpoint(startAt > 0)
      setStatusMessage(
        startAt > 0
          ? `Ripresa dal checkpoint: paziente ${startAt + 1}/${TOTAL_PATIENTS}.`
          : 'Generazione avviata.',
      )
    } else {
      persistCheckpoint({
        seed,
        nextIndex: 0,
        generatedRows: [],
        groundTruthRows: [],
        corruptionCount: 0,
        updatedAt: new Date().toISOString(),
      })
      setGeneratedRows([])
      setGroundTruthRows([])
      setCorruptionCount(0)
      setProgressIndex(0)
      setResumedFromCheckpoint(false)
      setStatusMessage('Generazione avviata.')
    }

    try {
      for (let i = startAt; i < TOTAL_PATIENTS; i += 1) {
        setStatusMessage(`Elaborazione paziente ${i + 1}/${TOTAL_PATIENTS}...`)

        const patient = buildPatient(seed, i)
        const variableToDoc = assignVariableMask(seed, i)
        const corruptedDocs = computeCorruption(seed, i)
        const promptPayload = buildPromptInput(patient, variableToDoc)

        let docPayload
        let attempts = 0
        let waitMs = RATE_LIMIT_SLEEP_MS

        while (attempts < 5) {
          attempts += 1
          try {
            docPayload = await requestOpenRouterCompletion(apiKey, promptPayload)
            break
          } catch (error) {
            if (error?.code === 429 && attempts < 5) {
              setStatusMessage(
                `Rate limit ricevuto (429). Retry ${attempts}/5 in ${Math.round(waitMs / 1000)}s...`,
              )
              await sleep(waitMs)
              waitMs *= 2
              continue
            }
            throw error
          }
        }

        if (!docPayload) {
          throw new Error(`Impossibile generare i referti per ${patient.patientId}.`)
        }

        const finalDocs = { ...docPayload }
        let patientCorruptedFiles = 0
        for (const key of DOC_KEYS) {
          if (corruptedDocs[key]) {
            finalDocs[key] = CORRUPTED_MARKER
            patientCorruptedFiles += 1
          }
        }

        const groundTruth = buildGroundTruth(patient, variableToDoc, corruptedDocs)

        const generatedRow = {
          patientId: patient.patientId,
          clinicalInput: patient,
          distributionMask: variableToDoc,
          corruptedDocs,
          documents: finalDocs,
        }

        workingGeneratedRows = [...workingGeneratedRows, generatedRow]
        workingGroundTruthRows = [...workingGroundTruthRows, groundTruth]
        workingCorruptionCount += patientCorruptedFiles

        const nextIndex = i + 1
        setGeneratedRows(workingGeneratedRows)
        setGroundTruthRows(workingGroundTruthRows)
        setCorruptionCount(workingCorruptionCount)
        setProgressIndex(nextIndex)

        persistCheckpoint({
          seed,
          nextIndex,
          generatedRows: workingGeneratedRows,
          groundTruthRows: workingGroundTruthRows,
          corruptionCount: workingCorruptionCount,
          updatedAt: new Date().toISOString(),
        })

        if (nextIndex < TOTAL_PATIENTS) {
          await sleep(RATE_LIMIT_SLEEP_MS)
        }
      }

      setStatusMessage('Generazione completata con successo.')
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Errore sconosciuto.')
      setStatusMessage('Generazione interrotta. Puoi riprendere dal checkpoint.')
    } finally {
      setIsRunning(false)
    }
  }

  const exportMultimodalDataset = async () => {
    if (generatedRows.length !== TOTAL_PATIENTS || groundTruthRows.length !== TOTAL_PATIENTS) {
      setErrorMessage('Per esportare, completa prima la generazione dei 330 pazienti.')
      return
    }

    setErrorMessage('')
    setIsExporting(true)
    setExportMessage('Preparazione archivio ZIP in corso...')

    try {
      const zip = new JSZip()
      const reportsFolder = zip.folder('reports')
      if (!reportsFolder) {
        throw new Error('Impossibile creare la cartella reports nel file ZIP.')
      }

      for (let i = 0; i < generatedRows.length; i += 1) {
        const row = generatedRows[i]
        const patientFolder = reportsFolder.folder(row.patientId)
        if (!patientFolder) {
          throw new Error(`Impossibile creare cartella per ${row.patientId}.`)
        }

        patientFolder.file(`${row.patientId}_ingresso.txt`, row.documents.txt_ingresso)

        const pdfBuffer = createPdfArrayBuffer(row.patientId, row.documents.pdf_dimissione)
        patientFolder.file(`${row.patientId}_dimissione.pdf`, pdfBuffer)

        const jpgBlob = await createJpgBlobFromText(
          row.patientId,
          row.documents.jpg_operatorio,
        )
        patientFolder.file(`${row.patientId}_operatorio.jpg`, jpgBlob)

        if ((i + 1) % 5 === 0) {
          setExportMessage(`Rendering file multimodali: ${i + 1}/${generatedRows.length}`)
          await sleep(0)
        }
      }

      setExportMessage('Creazione ground_truth_secret.csv...')
      const csvColumns = ['patientId', ...CLINICAL_VARIABLES.map((variable) => variable.key)]
      const csvRows = groundTruthRows.map((row) => {
        const projected = {}
        for (const key of csvColumns) {
          projected[key] = row[key] ?? 'NOT_FOUND'
        }
        return projected
      })
      const csv = Papa.unparse(csvRows, { columns: csvColumns })
      zip.file('ground_truth_secret.csv', csv)

      setExportMessage('Compressione archivio dataset_operatori.zip...')
      const archiveBlob = await zip.generateAsync(
        { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
        (metadata) => {
          setExportMessage(`Compressione ZIP ${Math.round(metadata.percent)}%...`)
        },
      )

      const url = URL.createObjectURL(archiveBlob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'dataset_operatori.zip'
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
      URL.revokeObjectURL(url)

      setExportMessage('Download avviato: dataset_operatori.zip')
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? `Errore export: ${error.message}`
          : 'Errore sconosciuto durante export.',
      )
      setExportMessage('')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center gap-3">
        <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
          <PlayCircle className="h-5 w-5" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900">Generator Engine</h3>
      </div>

      <div className="grid gap-4">
        <label className="text-sm font-medium text-slate-700" htmlFor="secret-seed">
          Secret Seed
        </label>
        <input
          id="secret-seed"
          type="text"
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          value={secretSeed}
          onChange={(e) => setSecretSeed(e.target.value)}
          placeholder="es. GaranteTrial2026"
          disabled={isRunning}
        />

        <button
          type="button"
          onClick={handleGenerate}
          disabled={isRunning || isExporting}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
        >
          {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Genera Ground Truth & Referti
        </button>

        <button
          type="button"
          onClick={exportMultimodalDataset}
          disabled={
            isRunning ||
            isExporting ||
            generatedRows.length !== TOTAL_PATIENTS ||
            groundTruthRows.length !== TOTAL_PATIENTS
          }
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Esporta dataset_operatori.zip
        </button>
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
          <span>Progresso</span>
          <span>
            {progressIndex}/{TOTAL_PATIENTS} ({progressPercent}%)
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
        <p>{statusMessage}</p>
        <p className="mt-1 text-slate-500">
          Modello: {OPENROUTER_MODEL} | Corruzioni applicate: {corruptionCount}
        </p>
        <p className="mt-1 text-slate-500">
          Dataset in memoria: {generatedRows.length} referti 3-in-1, {groundTruthRows.length}{' '}
          righe ground truth.
        </p>
        {exportMessage ? <p className="mt-1 text-indigo-700">{exportMessage}</p> : null}
        {resumedFromCheckpoint ? (
          <p className="mt-1 text-indigo-700">Ripresa automatica da checkpoint attiva.</p>
        ) : null}
      </div>

      {errorMessage ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      ) : null}

      {!errorMessage && progressIndex === TOTAL_PATIENTS && TOTAL_PATIENTS > 0 ? (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Ground Truth e referti testuali completati e persistiti in localStorage.</span>
        </div>
      ) : null}
    </section>
  )
}
