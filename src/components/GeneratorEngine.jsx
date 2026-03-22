import { useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Loader2,
  PauseCircle,
  PlayCircle,
  Square,
} from 'lucide-react'
import { fetchOpenRouterChatCompletion, shouldUseOpenRouterProxy } from '../lib/openRouterClient.js'

const TOTAL_PATIENTS = 330
const TOTAL_FILES = TOTAL_PATIENTS * 3
const RATE_LIMIT_SLEEP_MS = 500
const RATE_LIMIT_MAX_RETRIES = 8
const RATE_LIMIT_MAX_WAIT_MS = 120000
const CORRUPTION_RATE = 0.1
const MODEL_OPTIONS = [
  { value: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (Premium)' },
  { value: 'openai/gpt-4o-mini', label: 'OpenAI GPT-4o mini (Premium)' },
  { value: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B (Free)' },
]
const LEGACY_CHECKPOINT_KEY = 'garante.generator.checkpoint.v1'
const SESSION_STORAGE_KEY = 'garante.generator.sessions.v2'
const RUN_LOG_STORAGE_KEY = 'garante.generator.runlog.v2'
const APP_VERSION = '0.0.0'
const CORRUPTED_MARKER = '[CORRUPTED_FILE]'
const DOC_KEYS = ['txt_ingresso', 'jpg_operatorio', 'pdf_dimissione']

const BOOLEAN_VARIABLE_KEYS = new Set([
  'diabetesMellitus',
  'hypertension',
  'intraoperativeComplications',
  'antibioticProphylaxis',
  'postopSurgicalSiteInfection',
  'pathologySpecimenSent',
])

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

/** Percorsi coerenti: diagnosi ↔ setting di ricovero ↔ procedura (niente mismatch casuali). */
const CLINICAL_CASE_BUNDLES = [
  {
    admissionSetting: 'Elective',
    primaryDiagnosis: 'Colelitiasi sintomatica sottoposta a Colecistectomia VLS',
    surgicalProcedure: 'Colecistectomia',
    preferredApproaches: ['Laparoscopic', 'Robotic'],
  },
  {
    admissionSetting: 'Elective',
    primaryDiagnosis: 'Ernia inguinale monolaterale sottoposta a Ernioplastica inguinale',
    surgicalProcedure: 'Ernioplastica',
    preferredApproaches: ['Open', 'Laparoscopic'],
  },
  {
    admissionSetting: 'Elective',
    primaryDiagnosis: 'Ernia crurale sottoposta a Ernioplastica crurale',
    surgicalProcedure: 'Ernioplastica',
    preferredApproaches: ['Open', 'Laparoscopic'],
  },
  {
    admissionSetting: 'Elective',
    primaryDiagnosis: 'Neoplasia del colon sottoposta a Resezione colica',
    surgicalProcedure: 'Resezione colica',
    preferredApproaches: ['Laparoscopic', 'Open', 'Robotic'],
  },
  {
    admissionSetting: 'Elective',
    primaryDiagnosis: 'Ernia ombelicale sottoposta a Ernioplastica ombelicale',
    surgicalProcedure: 'Ernioplastica',
    preferredApproaches: ['Open', 'Laparoscopic'],
  },
  {
    admissionSetting: 'Urgent',
    primaryDiagnosis: 'Appendicite acuta sottoposta a Appendicectomia',
    surgicalProcedure: 'Appendicectomia',
    preferredApproaches: ['Laparoscopic', 'Open'],
  },
  {
    admissionSetting: 'Urgent',
    primaryDiagnosis: 'Occlusione intestinale sottoposta a Laparotomia esplorativa',
    surgicalProcedure: 'Laparotomia esplorativa',
    preferredApproaches: ['Open'],
  },
  {
    admissionSetting: 'Urgent',
    primaryDiagnosis: 'Peritonite da ulcera perforata sottoposta a Sutura gastrica',
    surgicalProcedure: 'Laparotomia esplorativa',
    preferredApproaches: ['Open'],
  },
  {
    admissionSetting: 'Urgent',
    primaryDiagnosis: "Colecistite acuta sottoposta a Colecistectomia d'urgenza",
    surgicalProcedure: 'Colecistectomia',
    preferredApproaches: ['Laparoscopic', 'Open'],
  },
  {
    admissionSetting: 'Urgent',
    primaryDiagnosis: "Ernia inguinale incarcerata sottoposta a Ernioplastica d'urgenza",
    surgicalProcedure: 'Ernioplastica',
    preferredApproaches: ['Open', 'Laparoscopic'],
  },
]

function boolToYesNo(v) {
  return v ? 'Yes' : 'No'
}

/** Raggruppa le variabili cliniche per file assegnato dalla maschera. */
function groupVariablesByDocument(variableToDoc) {
  const out = { txt_ingresso: [], jpg_operatorio: [], pdf_dimissione: [] }
  for (const variable of CLINICAL_VARIABLES) {
    const doc = variableToDoc[variable.key]
    if (doc && out[doc]) {
      out[doc].push(variable.key)
    }
  }
  return out
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

function createRunId(seed) {
  return `run_${hashSeed(seed)}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`
}

function loadJsonStorage(key, fallbackValue) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) {
      return fallbackValue
    }
    return JSON.parse(raw)
  } catch {
    return fallbackValue
  }
}

function persistJsonStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function loadAllSessions() {
  return loadJsonStorage(SESSION_STORAGE_KEY, {})
}

function loadSession(seed) {
  const sessions = loadAllSessions()
  return sessions[seed] ?? null
}

function persistSession(seed, payload) {
  const sessions = loadAllSessions()
  sessions[seed] = payload
  persistJsonStorage(SESSION_STORAGE_KEY, sessions)
}

function loadRunLog() {
  return loadJsonStorage(RUN_LOG_STORAGE_KEY, { byId: {}, latestRunIdBySeed: {} })
}

function persistRunLog(runLog) {
  persistJsonStorage(RUN_LOG_STORAGE_KEY, runLog)
}

function upsertRunMetadata(runMetadata) {
  const runLog = loadRunLog()
  runLog.byId[runMetadata.runId] = runMetadata
  runLog.latestRunIdBySeed[runMetadata.seed] = runMetadata.runId
  persistRunLog(runLog)
}

function getLatestRunForSeed(seed) {
  const runLog = loadRunLog()
  const runId = runLog.latestRunIdBySeed[seed]
  if (!runId) {
    return null
  }
  return runLog.byId[runId] ?? null
}

async function computeOutputHash(seed, generatedRows, groundTruthRows) {
  const payload = JSON.stringify({
    seed,
    generatedRows,
    groundTruthRows,
  })
  const bytes = new TextEncoder().encode(payload)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function computeCorruptionCountFromRows(rows) {
  return rows.reduce((acc, row) => {
    const docs = row?.documents ?? {}
    let rowCorruptions = 0
    for (const key of DOC_KEYS) {
      if (docs[key] === CORRUPTED_MARKER) {
        rowCorruptions += 1
      }
    }
    return acc + rowCorruptions
  }, 0)
}

async function writeBlobToDirectory(dirHandle, fileName, blobOrBuffer) {
  const fileHandle = await dirHandle.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(blobOrBuffer)
  await writable.close()
}

async function fileExistsInDirectory(dirHandle, fileName) {
  try {
    await dirHandle.getFileHandle(fileName)
    return true
  } catch {
    return false
  }
}

/** Resume solo se i 3 output per quel paziente esistono davvero su disco (non dalla sessione RAM). */
async function patientOutputsCompleteOnDisk(dirHandle, patientPrefix) {
  const txt = `${patientPrefix}_Ingresso.txt`
  const pdf = `${patientPrefix}_Dimissione.pdf`
  const jpg = `${patientPrefix}_Operatorio.jpg`
  return (
    (await fileExistsInDirectory(dirHandle, txt)) &&
    (await fileExistsInDirectory(dirHandle, pdf)) &&
    (await fileExistsInDirectory(dirHandle, jpg))
  )
}

async function writeGroundTruthCsvLive(dirHandle, rows) {
  const csvColumns = ['patientId', ...CLINICAL_VARIABLES.map((variable) => variable.key)]
  const csvRows = rows.map((row) => {
    const projected = {}
    for (const key of csvColumns) {
      projected[key] = row[key] ?? 'NOT_FOUND'
    }
    return projected
  })
  const csv = Papa.unparse(csvRows, { columns: csvColumns })
  await writeBlobToDirectory(
    dirHandle,
    'ground_truth_secret.csv',
    new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
  )
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
  const bundle = pickFrom(CLINICAL_CASE_BUNDLES, rng)
  const sex = rng() >= 0.5 ? 'M' : 'F'
  const approach = pickFrom(bundle.preferredApproaches, rng)
  const age = 18 + Math.floor(rng() * 73)
  const bmi = (18 + rng() * 27).toFixed(1)
  const asaScore = pickFrom(['I', 'II', 'III', 'IV'], rng)

  return {
    patientId: `PT-${String(patientIndex + 1).padStart(3, '0')}`,
    age,
    biologicalSex: sex,
    bmi: Number(bmi),
    admissionSetting: bundle.admissionSetting,
    primaryDiagnosis: bundle.primaryDiagnosis,
    asaScore,
    diabetesMellitus: boolToYesNo(rng() < 0.24),
    hypertension: boolToYesNo(rng() < 0.31),
    preopHemoglobin: Number((10.2 + rng() * 5.5).toFixed(1)),
    preopWbc: Math.round(4200 + rng() * 16000),
    surgicalProcedure: bundle.surgicalProcedure,
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

const REDACT_PLACEHOLDER = '[omissis]'

function escapeRegExp(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Frasi contestuali per Yes/No (evita di cancellare un "Yes" appartenente ad altra variabile). */
function booleanPhrasesForKey(key, yn) {
  const y = String(yn ?? '').trim()
  const yLower = y.toLowerCase()
  switch (key) {
    case 'diabetesMellitus':
      return [
        `Diabetes mellitus: ${y}`,
        `Diabetes mellitus: ${yLower}`,
        `diabetes mellitus: ${y}`,
        `Diabetes mellitus:${y}`,
        `Diabete mellito: ${y}`,
      ]
    case 'hypertension':
      return [
        `Ipertensione arteriosa: ${y}`,
        `Ipertensione: ${y}`,
        `Hypertension: ${y}`,
        `hypertension: ${yLower}`,
      ]
    case 'intraoperativeComplications':
      return [
        `Complicanze intraoperatorie: ${y}`,
        `Complicanze intraoperatorie:${y}`,
        `Intraoperative complications: ${y}`,
      ]
    case 'antibioticProphylaxis':
      return [`Profilassi antibiotica: ${y}`, `Antibiotic prophylaxis: ${y}`]
    case 'postopSurgicalSiteInfection':
      return [`Infezione sito chirurgico: ${y}`, `Surgical site infection: ${y}`]
    case 'pathologySpecimenSent':
      return [
        `Invio pezzo anatomopatologico: ${y}`,
        `Pathology specimen sent: ${y}`,
        `Pezzo anatomopatologico: ${y}`,
      ]
    default:
      return []
  }
}

function scrubBooleanMisplacedInDoc(text, key) {
  let t = text
  for (const yn of ['Yes', 'No']) {
    for (const p of booleanPhrasesForKey(key, yn)) {
      if (!p) continue
      const re = new RegExp(escapeRegExp(p), 'gi')
      t = t.replace(re, REDACT_PLACEHOLDER)
    }
  }
  return t
}

/** Solo diagnostica: non blocca la generazione. */
function warnIfCorruptionPayloadMismatch(patientId, corruptedDocs, finalDocs) {
  for (const docKey of DOC_KEYS) {
    if (corruptedDocs[docKey] && finalDocs[docKey] !== CORRUPTED_MARKER) {
      console.warn(
        `[Garante] ${patientId}: atteso ${CORRUPTED_MARKER} in ${docKey} per flag corruzione.`,
      )
    }
    if (!corruptedDocs[docKey] && finalDocs[docKey] === CORRUPTED_MARKER) {
      console.warn(`[Garante] ${patientId}: marker di corruzione in ${docKey} senza flag.`)
    }
  }
}

/**
 * Rimuove dai documenti NON assegnati i valori della ground truth, così:
 * - se il documento designato è corrotto → NOT_FOUND nel CSV e il valore non compare altrove nei file;
 * - l'estrazione da tutti i referti resta allineata alla ground truth.
 */
function scrubMisplacedClinicalValues(docPayload, patient, variableToDoc) {
  const out = { ...docPayload }
  for (const variable of CLINICAL_VARIABLES) {
    const key = variable.key
    const assigned = variableToDoc[key]
    if (!assigned || !DOC_KEYS.includes(assigned)) continue
    const raw = patient[key]

    for (const docKey of DOC_KEYS) {
      if (docKey === assigned) continue
      let text = out[docKey]
      if (typeof text !== 'string') continue

      if (key === 'biologicalSex') {
        const ch = String(raw ?? '').trim()
        if (ch === 'M' || ch === 'F') {
          const phrases = [
            `Sesso: ${ch}`,
            `sesso: ${ch}`,
            `Sesso ${ch}`,
            `sesso ${ch}`,
            `Sesso biologico: ${ch}`,
            `sesso biologico: ${ch}`,
            `Sesso biologico ${ch}`,
            `sesso biologico ${ch}`,
          ]
          if (ch === 'M') phrases.push('maschio', 'Maschio', 'MASCHIO')
          if (ch === 'F') phrases.push('femmina', 'Femmina', 'FEMMINA')
          phrases.sort((a, b) => b.length - a.length)
          for (const p of phrases) {
            if (p && text.includes(p)) {
              text = text.split(p).join(REDACT_PLACEHOLDER)
            }
          }
          text = text.replace(new RegExp(`\\b${escapeRegExp(ch)}\\b`, 'g'), REDACT_PLACEHOLDER)
        }
        out[docKey] = text
        continue
      }

      if (key === 'asaScore') {
        const s = String(raw ?? '').trim()
        const phrases = [
          `Classificazione ASA ${s}`,
          `classificazione ASA ${s}`,
          `score ASA ${s}`,
          `ASA: ${s}`,
          `ASA ${s}`,
        ].sort((a, b) => b.length - a.length)
        for (const p of phrases) {
          if (p && text.includes(p)) {
            text = text.split(p).join(REDACT_PLACEHOLDER)
          }
        }
        text = text.replace(new RegExp(`\\b${escapeRegExp(s)}\\b`, 'g'), REDACT_PLACEHOLDER)
        out[docKey] = text
        continue
      }

      if (BOOLEAN_VARIABLE_KEYS.has(key)) {
        out[docKey] = scrubBooleanMisplacedInDoc(text, key)
        continue
      }

      if (typeof raw === 'number') {
        const re = new RegExp(`(?<!\\d)${escapeRegExp(String(raw))}(?!\\d)`, 'g')
        text = text.replace(re, REDACT_PLACEHOLDER)
        if (!Number.isInteger(raw)) {
          const fixed = raw.toFixed(1)
          const re2 = new RegExp(`(?<!\\d)${escapeRegExp(fixed)}(?!\\d)`, 'g')
          text = text.replace(re2, REDACT_PLACEHOLDER)
          const re3 = new RegExp(`(?<!\\d)${escapeRegExp(fixed.replace('.', ','))}(?!\\d)`, 'g')
          text = text.replace(re3, REDACT_PLACEHOLDER)
        }
        out[docKey] = text
        continue
      }

      const literal = String(raw ?? '').trim()
      if (literal.length < 1) continue
      if (literal.length >= 2) {
        text = text.split(literal).join(REDACT_PLACEHOLDER)
      }
      out[docKey] = text
    }
  }
  return out
}

/**
 * Ground truth = sola fonte di verità per valutazione: deterministica da seed (maschera + corruzione).
 * I file sono "best effort" (LLM + scrub); non blocchiamo la generazione se il testo non rispecchia
 * ogni campo al 100%: il valutatore confronta l'estrazione con questa riga.
 */
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

function buildGroundTruthDataset(seed) {
  const rows = []
  for (let i = 0; i < TOTAL_PATIENTS; i += 1) {
    const patient = buildPatient(seed, i)
    const variableToDoc = assignVariableMask(seed, i)
    const corruptedDocs = computeCorruption(seed, i)
    rows.push(buildGroundTruth(patient, variableToDoc, corruptedDocs))
  }
  return rows
}

function buildPromptInput(patient, variableToDoc) {
  return {
    patient,
    distributionMask: variableToDoc,
    variablesByDocument: groupVariablesByDocument(variableToDoc),
    formatRules: {
      language: 'Italiano clinico formale',
      outputShape: ['txt_ingresso', 'jpg_operatorio', 'pdf_dimissione'],
      strictJsonOnly: true,
    },
  }
}

/**
 * Istruzioni lunghe per coerenza clinica, logica temporale dei referti e rumore real-world.
 */
function buildOpenRouterUserContent(patient, variableToDoc) {
  const byDoc = groupVariablesByDocument(variableToDoc)
  const placementLines = DOC_KEYS.map((docKey) => {
    const keys = byDoc[docKey]
    const label =
      keys.length > 0
        ? `Inserire in modo leggibile i valori ESATTI del JSON paziente per: ${keys.join(', ')}.`
        : 'Nessuna variabile assegnata: usare solo testo di riempimento rumoroso (no valori strutturati delle altre sezioni).'
    return `- ${docKey}: ${label}`
  }).join('\n')

  return `Genera tre referti testuali per lo STESSO episodio chirurgico.

COERENZA CLINICA (obbligatoria):
- La diagnosi principale (primaryDiagnosis), l'impostazione di ricovero (admissionSetting) e la procedura (surgicalProcedure) descrivono UN SOLO percorso: non aggiungere altre procedure principali né patologie discordanti.
- Non contraddire i campi numerici/booleani del JSON paziente.

LOGICA TEMPORALE E TIPOLOGIA DOCUMENTALE (obbligatoria — i tre testi devono essere DIVERSI tra loro):
1) txt_ingresso — referto di ingresso / PS / ricovero: motivo del ricovero, anamnesi breve, esami d'ingresso, quadro iniziale. Può menzionare in programma l'intervento coerente con surgicalProcedure.
   VIETATO in questo file: giorni totali di degenza, decorso postoperatorio sui giorni successivi, dolore post-op giorno 1 (VAS), infezione della ferita in fase dimissionale, destinazione alla dimissione, formulazioni da lettera di dimissione ("alla dimissione…", "decorso postoperatorio favorevole con degenza di X giorni").

2) jpg_operatorio — verbale operatorio (contestualmente redatto a fine atto): SOLO sala operatoria e atto chirurgico (tecnica, approccio, tempi operatori, emorragia stimata, complicanze intraoperatorie, profilassi antibiotica, dispositivo energia, invio pezzo anatomopatologico se pertinente).
   VIETATO in questo file: giorni di degenza, decorso postoperatorio, evoluzione clinica nei giorni successivi, dolore VAS a 24h, infezione sito chirurgico nel post-ricovero, destinazione alla dimissione, "il paziente è stato dimesso", durata del ricovero.

3) pdf_dimissione — referto/lettera di dimissione: qui SÌ decorso, parametri post-op, giorni di ricovero, complicanze tardive rilevanti, destinazione.

DISTRIBUZIONE ASIMMETRICA (maschera — rispetta rigorosamente):
${placementLines}

VARIETÀ E "RUMORE" (simulazione cartella clinica reale):
- Differenzia nettamente stile e struttura tra i tre file (es. note frammentate, richiami amministrativi, ordini duplicati, frasi spezzate). Non usare tre modelli copia-incolla.
- Nei file con poche o zero variabili assegnate, riempi con contenuto clinicamente plausibile ma irrilevante per l'estrazione (note infermieristiche, riferimenti a reparti, testo disomogeneo), senza replicare i valori esatti delle variabili che appartengono ad altri documenti secondo la maschera.
- I valori da estrarre, quando presenti in un file, devono restare leggibili e coerenti con il JSON; il rumore non deve alterare quei valori.

Output: un solo oggetto JSON con esattamente le chiavi stringa txt_ingresso, jpg_operatorio, pdf_dimissione.

DATI (JSON):
${JSON.stringify({ patient, distributionMask: variableToDoc, variablesByDocument: byDoc })}`
}

function stripMarkdownCodeFence(text) {
  const trimmed = (text ?? '').trim()
  if (!trimmed.startsWith('```')) {
    return trimmed
  }
  return trimmed
    .replace(/^```[a-zA-Z]*\s*/, '')
    .replace(/\s*```$/, '')
    .trim()
}

function normalizeDocPayloadShape(parsed) {
  if (!parsed || typeof parsed !== 'object') {
    return null
  }

  const direct = {
    txt_ingresso: parsed.txt_ingresso,
    jpg_operatorio: parsed.jpg_operatorio,
    pdf_dimissione: parsed.pdf_dimissione,
  }
  if (
    typeof direct.txt_ingresso === 'string' &&
    typeof direct.jpg_operatorio === 'string' &&
    typeof direct.pdf_dimissione === 'string'
  ) {
    return direct
  }

  const nested =
    parsed.documents ??
    parsed.output ??
    parsed.report ??
    parsed.reports ??
    parsed.payload ??
    null
  if (nested && typeof nested === 'object') {
    const normalizedNested = {
      txt_ingresso: nested.txt_ingresso,
      jpg_operatorio: nested.jpg_operatorio,
      pdf_dimissione: nested.pdf_dimissione,
    }
    if (
      typeof normalizedNested.txt_ingresso === 'string' &&
      typeof normalizedNested.jpg_operatorio === 'string' &&
      typeof normalizedNested.pdf_dimissione === 'string'
    ) {
      return normalizedNested
    }
  }

  return null
}

async function requestOpenRouterCompletion(promptPayload, model) {
  const patient = promptPayload?.patient
  const variableToDoc = promptPayload?.distributionMask
  if (!patient || !variableToDoc) {
    throw new Error('OpenRouter: promptPayload mancante (patient o distributionMask).')
  }
  const userContent = buildOpenRouterUserContent(patient, variableToDoc)

  const referer =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'http://localhost'

  const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY ?? ''
  const openRouterBody = {
    model,
    temperature: 0.48,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'Sei un generatore di referti chirurgici in italiano. Rispondi SOLO con un JSON valido contenente esattamente tre stringhe nelle chiavi: txt_ingresso, jpg_operatorio, pdf_dimissione. Nessun markdown, nessun testo fuori dal JSON, nessuna chiave aggiuntiva.',
      },
      {
        role: 'user',
        content: userContent,
      },
    ],
  }

  const response = await fetchOpenRouterChatCompletion({
    apiKey,
    referer,
    openRouterBody,
  })

  if (response.status === 429) {
    let detail = ''
    try {
      detail = await response.text()
    } catch {
      detail = ''
    }

    const retryAfterHeader = response.headers.get('retry-after')
    const retryAfterSeconds = Number(retryAfterHeader)
    const retryAfterMs = Number.isFinite(retryAfterSeconds) ? retryAfterSeconds * 1000 : null
    const lowerDetail = detail.toLowerCase()
    const hardLimit =
      lowerDetail.includes('insufficient') ||
      lowerDetail.includes('quota') ||
      lowerDetail.includes('credit') ||
      lowerDetail.includes('billing')

    const err = new Error(
      detail
        ? `OpenRouter 429: ${detail}`
        : 'OpenRouter 429: rate limit/quota temporaneamente non disponibile.',
    )
    err.code = 429
    err.retryAfterMs = retryAfterMs
    err.hardLimit = hardLimit
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
    parsed = JSON.parse(stripMarkdownCodeFence(content))
  } catch {
    throw new Error('OpenRouter returned non-JSON content')
  }

  const normalizedPayload = normalizeDocPayloadShape(parsed)
  if (!normalizedPayload) {
    throw new Error(
      `Invalid JSON shape: missing required keys (${DOC_KEYS.join(', ')})`,
    )
  }

  return normalizedPayload
}

function loadLegacyCheckpoint() {
  return loadJsonStorage(LEGACY_CHECKPOINT_KEY, null)
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
  const [isExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState('')
  const [activeRunMetadata, setActiveRunMetadata] = useState(null)
  const [isPaused, setIsPaused] = useState(false)
  const [stopRequested, setStopRequested] = useState(false)
  const [newlyGeneratedCount, setNewlyGeneratedCount] = useState(0)
  const [reusedCount, setReusedCount] = useState(0)
  const [selectedApiModel, setSelectedApiModel] = useState(MODEL_OPTIONS[0].value)
  const [activeApiModel, setActiveApiModel] = useState(MODEL_OPTIONS[0].value)
  const [isTestingApiKey, setIsTestingApiKey] = useState(false)
  const [apiPreflightMessage, setApiPreflightMessage] = useState('')
  const [, setDirectoryHandle] = useState(null)
  const [outputDirectoryName, setOutputDirectoryName] = useState('')
  const pauseRequestedRef = useRef(false)
  const stopRequestedRef = useRef(false)

  const completedFiles = useMemo(() => progressIndex * 3, [progressIndex])
  const progressPercent = useMemo(
    () => Math.round((completedFiles / TOTAL_FILES) * 100),
    [completedFiles],
  )

  const pendingCount = useMemo(() => Math.max(0, TOTAL_FILES - completedFiles), [completedFiles])

  const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }

  const handleTestApiKey = async () => {
    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY ?? ''
    setErrorMessage('')

    if (!shouldUseOpenRouterProxy() && !apiKey) {
      setApiPreflightMessage(
        'API key non configurata. In locale aggiungi VITE_OPENROUTER_API_KEY in .env.local, oppure usa il proxy Firebase (vedi README).',
      )
      return
    }

    setIsTestingApiKey(true)
    setApiPreflightMessage('Test API key in corso...')
    try {
      const referer =
        typeof window !== 'undefined' && window.location?.origin
          ? window.location.origin
          : 'http://localhost'
      let lastFailure = ''

      const openRouterBody = {
        model: selectedApiModel,
        max_tokens: 8,
        temperature: 0,
        messages: [
          { role: 'system', content: 'Return only JSON.' },
          { role: 'user', content: '{"healthcheck":"ok"}' },
        ],
        response_format: { type: 'json_object' },
      }

      const response = await fetchOpenRouterChatCompletion({
        apiKey,
        referer,
        openRouterBody,
      })

      if (response.ok) {
        setActiveApiModel(selectedApiModel)
        setApiPreflightMessage(`API key operativa. Modello disponibile: ${selectedApiModel}`)
        return
      }

      const detail = await response.text()
      lastFailure = `model=${selectedApiModel}, http=${response.status}, detail=${detail || 'n/a'}`
      if (response.status === 429) {
        const low = detail.toLowerCase()
        if (
          low.includes('quota') ||
          low.includes('credit') ||
          low.includes('insufficient') ||
          low.includes('billing')
        ) {
          setApiPreflightMessage(
            `Test fallito: quota/credito API key esaurito. Dettaglio: ${detail || 'n/a'}`,
          )
          return
        }
      }

      setApiPreflightMessage(`Test non operativo sul modello selezionato. Errore: ${lastFailure}`)
    } catch (error) {
      setApiPreflightMessage(
        error instanceof Error
          ? `Test fallito: ${error.message}`
          : 'Test fallito: errore sconosciuto.',
      )
    } finally {
      setIsTestingApiKey(false)
    }
  }

  const handleGenerate = async () => {
    const seed = secretSeed.trim()
    setErrorMessage('')
    setApiPreflightMessage('')

    if (!seed) {
      setErrorMessage('Inserisci il Secret Seed prima di iniziare.')
      return
    }

    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY ?? ''
    if (!shouldUseOpenRouterProxy() && !apiKey) {
      setErrorMessage(
        'OpenRouter non configurato: imposta VITE_OPENROUTER_API_KEY in .env.local (sviluppo) oppure usa il deploy Firebase con proxy (chiave solo lato server).',
      )
      return
    }

    if (typeof window.showDirectoryPicker !== 'function') {
      setErrorMessage(
        'Il browser non supporta File System Access API. Usa Chrome/Edge aggiornato.',
      )
      return
    }

    let selectedDirectoryHandle
    try {
      selectedDirectoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' })
      setDirectoryHandle(selectedDirectoryHandle)
      setOutputDirectoryName(selectedDirectoryHandle.name ?? '')
    } catch {
      setErrorMessage('Selezione cartella annullata. Operazione interrotta.')
      return
    }

    setIsRunning(true)
    setIsPaused(false)
    setStopRequested(false)
    pauseRequestedRef.current = false
    stopRequestedRef.current = false
    setNewlyGeneratedCount(0)
    setReusedCount(0)
    setActiveApiModel(selectedApiModel)

    let startAt = 0
    let workingGeneratedRows = []
    let workingGroundTruthRows = []
    let workingCorruptionCount = 0
    let generatedThisRun = 0
    let reusedThisRun = 0

    const nowIso = new Date().toISOString()
    const existingSession = loadSession(seed)
    const existingRun = getLatestRunForSeed(seed)
    const runId = existingRun?.runId ?? createRunId(seed)

    let runMetadata = {
      runId,
      seed,
      model: selectedApiModel,
      appVersion: APP_VERSION,
      status: existingRun?.status ?? 'running',
      createdAt: existingRun?.createdAt ?? nowIso,
      updatedAt: nowIso,
      startedAt: existingRun?.startedAt ?? nowIso,
      nextIndex: Number(existingRun?.nextIndex ?? 0),
      totalPatients: TOTAL_PATIENTS,
      resumedFromSession: false,
      deterministicReuse: true,
      outputHash: existingRun?.outputHash ?? null,
      completedAt: existingRun?.completedAt ?? null,
      lastError: null,
    }

    if (existingSession?.seed === seed) {
      startAt = Number(existingSession.nextIndex ?? 0)
      workingGeneratedRows = existingSession.generatedRows ?? []
      workingGroundTruthRows = existingSession.groundTruthRows ?? []
      workingCorruptionCount = Number(existingSession.corruptionCount ?? 0)
      setGeneratedRows(workingGeneratedRows)
      setGroundTruthRows(workingGroundTruthRows)
      setCorruptionCount(workingCorruptionCount)
      setProgressIndex(startAt)
      setResumedFromCheckpoint(startAt > 0)
      runMetadata = {
        ...runMetadata,
        status: startAt >= TOTAL_PATIENTS ? 'completed' : 'running',
        nextIndex: startAt,
        resumedFromSession: startAt > 0,
      }
      setActiveRunMetadata(runMetadata)
      setStatusMessage(
        startAt > 0
          ? `Ripresa dal checkpoint: paziente ${startAt + 1}/${TOTAL_PATIENTS}.`
          : 'Generazione avviata.',
      )
    } else {
      const legacyCheckpoint = loadLegacyCheckpoint()
      if (legacyCheckpoint?.seed === seed) {
        startAt = Number(legacyCheckpoint.nextIndex ?? 0)
        workingGeneratedRows = legacyCheckpoint.generatedRows ?? []
        workingGroundTruthRows = legacyCheckpoint.groundTruthRows ?? []
        workingCorruptionCount = Number(legacyCheckpoint.corruptionCount ?? 0)
      }

      persistSession(seed, {
        seed,
        runId,
        nextIndex: startAt,
        generatedRows: workingGeneratedRows,
        groundTruthRows: workingGroundTruthRows,
        corruptionCount: workingCorruptionCount,
        updatedAt: nowIso,
      })
      runMetadata = {
        ...runMetadata,
        nextIndex: startAt,
        resumedFromSession: startAt > 0,
      }
      setActiveRunMetadata(runMetadata)
      setGeneratedRows(workingGeneratedRows)
      setGroundTruthRows(workingGroundTruthRows)
      setCorruptionCount(workingCorruptionCount)
      setProgressIndex(startAt)
      setResumedFromCheckpoint(startAt > 0)
      setStatusMessage(
        startAt > 0
          ? `Ripresa sessione seed ${seed}: paziente ${startAt + 1}/${TOTAL_PATIENTS}.`
          : 'Generazione avviata.',
      )
    }

    const precomputedGroundTruth = buildGroundTruthDataset(seed)
    if (workingGroundTruthRows.length !== TOTAL_PATIENTS) {
      workingGroundTruthRows = precomputedGroundTruth
      setGroundTruthRows(precomputedGroundTruth)
      persistSession(seed, {
        seed,
        runId,
        nextIndex: startAt,
        generatedRows: workingGeneratedRows,
        groundTruthRows: precomputedGroundTruth,
        corruptionCount: workingCorruptionCount,
        updatedAt: new Date().toISOString(),
      })
    }

    upsertRunMetadata(runMetadata)

    const firstPatientPrefix = `Paziente_${String(1).padStart(3, '0')}`
    const diskHasFirstPatient = await patientOutputsCompleteOnDisk(
      selectedDirectoryHandle,
      firstPatientPrefix,
    )

    if (startAt >= TOTAL_PATIENTS && !diskHasFirstPatient) {
      startAt = 0
      workingGeneratedRows = []
      workingCorruptionCount = 0
      setGeneratedRows([])
      setProgressIndex(0)
      setCorruptionCount(0)
      persistSession(seed, {
        seed,
        runId,
        nextIndex: 0,
        generatedRows: [],
        groundTruthRows: precomputedGroundTruth,
        corruptionCount: 0,
        updatedAt: new Date().toISOString(),
      })
      runMetadata = {
        ...runMetadata,
        nextIndex: 0,
        status: 'running',
        updatedAt: new Date().toISOString(),
      }
      setActiveRunMetadata(runMetadata)
      upsertRunMetadata(runMetadata)
      setStatusMessage(
        'Sessione indicava gia 330 pazienti ma la cartella e vuota: ripartenza da zero.',
      )
    }

    if (startAt >= TOTAL_PATIENTS) {
      setIsRunning(false)
      setStatusMessage('Sessione gia completata per questo seed e file presenti in cartella.')
      return
    }

    try {
      for (let i = startAt; i < TOTAL_PATIENTS; i += 1) {
        if (stopRequestedRef.current) {
          throw new Error('Generazione interrotta manualmente dall utente.')
        }

        while (pauseRequestedRef.current) {
          setStatusMessage(
            `Generazione in pausa al paziente ${i + 1}/${TOTAL_PATIENTS}. Premi Riprendi per continuare.`,
          )
          await sleep(300)
          if (stopRequestedRef.current) {
            throw new Error('Generazione interrotta manualmente dall utente.')
          }
        }

        setStatusMessage(`Elaborazione paziente ${i + 1}/${TOTAL_PATIENTS}...`)

        const patient = buildPatient(seed, i)
        const patientNumber = String(i + 1).padStart(3, '0')
        const patientPrefix = `Paziente_${patientNumber}`
        const variableToDoc = assignVariableMask(seed, i)
        const corruptedDocs = computeCorruption(seed, i)
        const promptPayload = buildPromptInput(patient, variableToDoc)

        const outputsAlreadyOnDisk = await patientOutputsCompleteOnDisk(
          selectedDirectoryHandle,
          patientPrefix,
        )

        if (outputsAlreadyOnDisk) {
          setStatusMessage(
            `Skip resume: file gia presenti per paziente ${i + 1}/${TOTAL_PATIENTS}.`,
          )
          reusedThisRun += 1
          setReusedCount(reusedThisRun)
        } else {
          const groundTruth = buildGroundTruth(patient, variableToDoc, corruptedDocs)

          let docPayload
          let attempts = 0
          let waitMs = RATE_LIMIT_SLEEP_MS

          while (attempts < RATE_LIMIT_MAX_RETRIES) {
            attempts += 1
            try {
              docPayload = await requestOpenRouterCompletion(promptPayload, selectedApiModel)
              break
            } catch (error) {
              if (error?.code === 429) {
                if (error?.hardLimit) {
                  throw new Error(
                    'OpenRouter ha rifiutato la richiesta per quota/credito della API key. Verifica hard limit e billing della key.',
                  )
                }
                const suggestedWait =
                  typeof error?.retryAfterMs === 'number' && error.retryAfterMs > 0
                    ? error.retryAfterMs
                    : waitMs
                const boundedWait = Math.min(Math.max(suggestedWait, 500), RATE_LIMIT_MAX_WAIT_MS)
                setStatusMessage(
                  `OpenRouter 429 su ${selectedApiModel}. Retry ${attempts}/${RATE_LIMIT_MAX_RETRIES} in ${Math.round(
                    boundedWait / 1000,
                  )}s...`,
                )
                await sleep(boundedWait)
                waitMs = Math.min(waitMs * 2, RATE_LIMIT_MAX_WAIT_MS)
                continue
              }
              throw error
            }
          }

          if (!docPayload) {
            throw new Error(
              `Impossibile generare i referti per ${patient.patientId}: OpenRouter risponde 429 persistente sul modello selezionato (${selectedApiModel}).`,
            )
          }

          let finalDocs = scrubMisplacedClinicalValues({ ...docPayload }, patient, variableToDoc)
          let patientCorruptedFiles = 0
          for (const key of DOC_KEYS) {
            if (corruptedDocs[key]) {
              finalDocs[key] = CORRUPTED_MARKER
              patientCorruptedFiles += 1
            }
          }

          warnIfCorruptionPayloadMismatch(patient.patientId, corruptedDocs, finalDocs)

          await writeBlobToDirectory(
            selectedDirectoryHandle,
            `${patientPrefix}_Ingresso.txt`,
            new Blob([finalDocs.txt_ingresso], { type: 'text/plain;charset=utf-8;' }),
          )
          const pdfBuffer = createPdfArrayBuffer(patient.patientId, finalDocs.pdf_dimissione)
          await writeBlobToDirectory(
            selectedDirectoryHandle,
            `${patientPrefix}_Dimissione.pdf`,
            pdfBuffer,
          )
          const jpgBlob = await createJpgBlobFromText(patient.patientId, finalDocs.jpg_operatorio)
          await writeBlobToDirectory(
            selectedDirectoryHandle,
            `${patientPrefix}_Operatorio.jpg`,
            jpgBlob,
          )

          const generatedRow = { patientId: patient.patientId, writtenOnDisk: true }

          if (workingGeneratedRows[i]) {
            workingGeneratedRows[i] = generatedRow
          } else {
            workingGeneratedRows.push(generatedRow)
          }

          if (workingGroundTruthRows[i]) {
            workingGroundTruthRows[i] = groundTruth
          } else {
            workingGroundTruthRows.push(groundTruth)
          }

          if (patientCorruptedFiles > 0 || workingGeneratedRows[i]) {
            workingCorruptionCount = computeCorruptionCountFromRows(workingGeneratedRows)
          }
          generatedThisRun += 1
          setNewlyGeneratedCount(generatedThisRun)
        }

        const nextIndex = i + 1
        const generatedSnapshot = [...workingGeneratedRows]
        const groundTruthSnapshot = [...workingGroundTruthRows]

        setGeneratedRows(generatedSnapshot)
        setGroundTruthRows(groundTruthSnapshot)
        setCorruptionCount(workingCorruptionCount)
        setProgressIndex(nextIndex)
        await writeGroundTruthCsvLive(
          selectedDirectoryHandle,
          groundTruthSnapshot.slice(0, nextIndex),
        )

        runMetadata = {
          ...runMetadata,
          status: 'running',
          nextIndex,
          updatedAt: new Date().toISOString(),
        }
        setActiveRunMetadata(runMetadata)
        upsertRunMetadata(runMetadata)

        persistSession(seed, {
          seed,
          runId: runMetadata.runId,
          nextIndex,
          generatedRows: generatedSnapshot,
          groundTruthRows: groundTruthSnapshot,
          corruptionCount: workingCorruptionCount,
          updatedAt: new Date().toISOString(),
        })

        if (nextIndex < TOTAL_PATIENTS) {
          await sleep(RATE_LIMIT_SLEEP_MS)
        }
      }

      const outputHash = await computeOutputHash(seed, workingGeneratedRows, workingGroundTruthRows)
      runMetadata = {
        ...runMetadata,
        status: 'completed',
        nextIndex: TOTAL_PATIENTS,
        outputHash,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      setActiveRunMetadata(runMetadata)
      upsertRunMetadata(runMetadata)
      setStatusMessage('Generazione completata con successo.')
    } catch (error) {
      const interruptedByUser =
        stopRequestedRef.current ||
        (error instanceof Error &&
          error.message.toLowerCase().includes('interrotta manualmente'))
      runMetadata = {
        ...runMetadata,
        status: interruptedByUser ? 'stopped' : 'interrupted',
        lastError: error instanceof Error ? error.message : 'Errore sconosciuto.',
        updatedAt: new Date().toISOString(),
      }
      setActiveRunMetadata(runMetadata)
      upsertRunMetadata(runMetadata)
      setErrorMessage(error instanceof Error ? error.message : 'Errore sconosciuto.')
      setStatusMessage(
        interruptedByUser
          ? 'Generazione fermata. Puoi riprendere dalla sessione salvata.'
          : 'Generazione interrotta. Puoi riprendere dal checkpoint.',
      )
    } finally {
      setIsRunning(false)
      setIsPaused(false)
      setStopRequested(false)
      pauseRequestedRef.current = false
      stopRequestedRef.current = false
    }
  }

  const exportGroundTruthCsv = () => {
    if (groundTruthRows.length === 0) {
      setErrorMessage('Nessuna riga ground truth disponibile da esportare.')
      return
    }

    const csvColumns = ['patientId', ...CLINICAL_VARIABLES.map((variable) => variable.key)]
    const csvRows = groundTruthRows.map((row) => {
      const projected = {}
      for (const key of csvColumns) {
        projected[key] = row[key] ?? 'NOT_FOUND'
      }
      return projected
    })
    const csv = Papa.unparse(csvRows, { columns: csvColumns })
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    downloadBlob(blob, 'ground_truth_secret.csv')
    setExportMessage('Download avviato: ground_truth_secret.csv')
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

        <label className="text-sm font-medium text-slate-700" htmlFor="api-model">
          Modello API
        </label>
        <select
          id="api-model"
          value={selectedApiModel}
          onChange={(event) => {
            setSelectedApiModel(event.target.value)
            setActiveApiModel(event.target.value)
          }}
          disabled={isRunning || isTestingApiKey}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 disabled:cursor-not-allowed disabled:bg-slate-100"
        >
          {MODEL_OPTIONS.map((modelOption) => (
            <option key={modelOption.value} value={modelOption.value}>
              {modelOption.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={handleTestApiKey}
          disabled={isRunning || isExporting || isTestingApiKey}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          {isTestingApiKey ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
          Test API Key
        </button>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={isRunning || isExporting || isTestingApiKey}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
        >
          {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Genera Ground Truth & Referti
        </button>

        <button
          type="button"
          onClick={exportGroundTruthCsv}
          disabled={isExporting || groundTruthRows.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          {isExporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Esporta ground_truth_secret.csv
        </button>

        <button
          type="button"
          disabled
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-500 shadow-sm"
        >
          Salvataggio live su disco attivo (ZIP disabilitato)
        </button>

        {isRunning ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => {
                const nextPauseState = !isPaused
                setIsPaused(nextPauseState)
                pauseRequestedRef.current = nextPauseState
              }}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-700 shadow-sm transition hover:bg-amber-100"
            >
              <PauseCircle className="h-4 w-4" />
              {isPaused ? 'Riprendi' : 'Pausa'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStopRequested(true)
                stopRequestedRef.current = true
              }}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-rose-300 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-700 shadow-sm transition hover:bg-rose-100"
            >
              <Square className="h-4 w-4" />
              Interrompi
            </button>
          </div>
        ) : null}
      </div>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between text-sm text-slate-600">
          <span>Progresso</span>
          <span>
            {completedFiles}/{TOTAL_FILES} file ({progressPercent}%)
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
          Modello API attivo: {activeApiModel} | Corruzioni applicate: {corruptionCount}
        </p>
        {outputDirectoryName ? (
          <p className="mt-1 text-slate-500">
            Cartella output live: {outputDirectoryName}
          </p>
        ) : null}
        <p className="mt-1 text-slate-500">
          Dataset in memoria: {generatedRows.length} referti 3-in-1, {groundTruthRows.length}{' '}
          righe ground truth.
        </p>
        <p className="mt-1 text-slate-500">
          Progress dettaglio: nuovi pazienti {newlyGeneratedCount}, riusati pazienti {reusedCount}, pendenti file{' '}
          {pendingCount}
        </p>
        {isPaused ? (
          <p className="mt-1 text-amber-700">Stato: in pausa.</p>
        ) : null}
        {stopRequested ? (
          <p className="mt-1 text-rose-700">Arresto richiesto: in chiusura sicura della sessione...</p>
        ) : null}
        {activeRunMetadata ? (
          <>
            <p className="mt-1 text-slate-500">
              Run ID: {activeRunMetadata.runId} | Stato: {activeRunMetadata.status}
            </p>
            <p className="mt-1 text-slate-500">
              Seed tracciato: {activeRunMetadata.seed} | Versione app: {activeRunMetadata.appVersion}
            </p>
            {activeRunMetadata.outputHash ? (
              <p className="mt-1 break-all text-slate-500">
                Output hash (SHA-256): {activeRunMetadata.outputHash}
              </p>
            ) : null}
          </>
        ) : null}
        <p className="mt-1 text-slate-500">
          Note audit: `run_manifest.json` non e piu nel ZIP multimodale; tracciabilita run mantenuta in
          localStorage.
        </p>
        {exportMessage ? <p className="mt-1 text-indigo-700">{exportMessage}</p> : null}
        {apiPreflightMessage ? (
          <p className="mt-1 text-slate-600">Preflight API: {apiPreflightMessage}</p>
        ) : null}
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
