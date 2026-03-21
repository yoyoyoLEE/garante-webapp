import { useMemo, useRef, useState } from 'react'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { Download, FileText } from 'lucide-react'

const ARM_KEYS = ['A1', 'A2', 'B']
const BONFERRONI_ALPHA = 0.05 / 3

function rankValuesWithTies(values) {
  const indexed = values
    .map((value, index) => ({ value, index }))
    .sort((a, b) => a.value - b.value)

  const ranks = Array(values.length).fill(0)
  let cursor = 0
  while (cursor < indexed.length) {
    let end = cursor
    while (end + 1 < indexed.length && indexed[end + 1].value === indexed[cursor].value) {
      end += 1
    }
    const avgRank = (cursor + 1 + end + 1) / 2
    for (let i = cursor; i <= end; i += 1) {
      ranks[indexed[i].index] = avgRank
    }
    cursor = end + 1
  }

  return ranks
}

function computeApproxFriedman(arms) {
  if (!arms?.A1 || !arms?.A2 || !arms?.B) {
    return { n: 0, q: 0, pValue: 1, significant: false }
  }

  const maps = ARM_KEYS.map((key) => {
    const map = new Map()
    arms[key].desByPatient?.forEach((row) => map.set(row.patientId, row.score))
    return map
  })

  const commonIds = [...maps[0].keys()].filter((id) => maps.every((m) => m.has(id)))
  const n = commonIds.length
  const k = 3

  if (n === 0) {
    return { n: 0, q: 0, pValue: 1, significant: false }
  }

  const rankSums = [0, 0, 0]
  for (const id of commonIds) {
    const scores = maps.map((m) => m.get(id))
    const ranks = rankValuesWithTies(scores)
    for (let i = 0; i < k; i += 1) {
      rankSums[i] += ranks[i]
    }
  }

  const q =
    (12 / (n * k * (k + 1))) * rankSums.reduce((acc, value) => acc + value ** 2, 0) -
    3 * n * (k + 1)
  const pValue = Math.exp(-q / 2)

  return {
    n,
    q,
    pValue,
    significant: pValue < 0.05,
  }
}

function erfApprox(x) {
  const sign = x < 0 ? -1 : 1
  const absX = Math.abs(x)
  const a1 = 0.254829592
  const a2 = -0.284496736
  const a3 = 1.421413741
  const a4 = -1.453152027
  const a5 = 1.061405429
  const p = 0.3275911
  const t = 1 / (1 + p * absX)
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-(absX * absX)))
  return sign * y
}

function normalCdf(z) {
  return 0.5 * (1 + erfApprox(z / Math.sqrt(2)))
}

function computeApproxWilcoxonPair(arms, leftKey, rightKey) {
  const left = arms?.[leftKey]?.desByPatient ?? []
  const right = arms?.[rightKey]?.desByPatient ?? []

  const leftMap = new Map(left.map((row) => [row.patientId, row.score]))
  const rightMap = new Map(right.map((row) => [row.patientId, row.score]))
  const commonIds = [...leftMap.keys()].filter((id) => rightMap.has(id))

  const pairs = []
  for (const id of commonIds) {
    const diff = leftMap.get(id) - rightMap.get(id)
    if (diff !== 0) {
      pairs.push({ id, diff, absDiff: Math.abs(diff) })
    }
  }

  const n = pairs.length
  if (n === 0) {
    return {
      pairLabel: `${leftKey} vs ${rightKey}`,
      n: 0,
      wStatistic: 0,
      z: 0,
      pValue: 1,
      pBonferroni: 1,
      significant: false,
    }
  }

  const ranked = [...pairs].sort((a, b) => a.absDiff - b.absDiff)
  let cursor = 0
  while (cursor < ranked.length) {
    let end = cursor
    while (end + 1 < ranked.length && ranked[end + 1].absDiff === ranked[cursor].absDiff) {
      end += 1
    }
    const avgRank = (cursor + 1 + end + 1) / 2
    for (let i = cursor; i <= end; i += 1) {
      ranked[i].rank = avgRank
    }
    cursor = end + 1
  }

  let wPlus = 0
  let wMinus = 0
  for (const item of ranked) {
    if (item.diff > 0) {
      wPlus += item.rank
    } else {
      wMinus += item.rank
    }
  }

  const wStatistic = Math.min(wPlus, wMinus)
  const meanW = (n * (n + 1)) / 4
  const varW = (n * (n + 1) * (2 * n + 1)) / 24
  const cc = wStatistic > meanW ? 0.5 : -0.5
  const z = varW > 0 ? (wStatistic - meanW - cc) / Math.sqrt(varW) : 0
  const pValue = Math.min(1, Math.max(0, 2 * (1 - normalCdf(Math.abs(z)))))
  const pBonferroni = Math.min(1, pValue * 3)

  return {
    pairLabel: `${leftKey} vs ${rightKey}`,
    n,
    wStatistic,
    z,
    pValue,
    pBonferroni,
    significant: pBonferroni < 0.05,
  }
}

export default function ReportFairV({ evaluatorResults }) {
  const [isExporting, setIsExporting] = useState(false)
  const containerRef = useRef(null)

  const friedman = useMemo(
    () => computeApproxFriedman(evaluatorResults?.arms),
    [evaluatorResults?.arms],
  )
  const wilcoxonPairs = useMemo(
    () => [
      computeApproxWilcoxonPair(evaluatorResults?.arms, 'A1', 'A2'),
      computeApproxWilcoxonPair(evaluatorResults?.arms, 'A1', 'B'),
      computeApproxWilcoxonPair(evaluatorResults?.arms, 'A2', 'B'),
    ],
    [evaluatorResults?.arms],
  )

  const exportPdf = async () => {
    if (!containerRef.current) {
      return
    }

    setIsExporting(true)
    try {
      const canvas = await html2canvas(containerRef.current, {
        scale: 2,
        backgroundColor: '#f8fafc',
        useCORS: true,
      })
      const imageData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pdfWidth = 210
      const margin = 10
      const contentWidth = pdfWidth - margin * 2
      const contentHeight = (canvas.height * contentWidth) / canvas.width
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(13)
      pdf.text('Garante Web App - Report FAIR-V', 10, 10)
      pdf.addImage(imageData, 'PNG', margin, 16, contentWidth, contentHeight)
      pdf.save('report_fair_v.pdf')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <section className="grid gap-4">
      <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-indigo-600" />
          <p className="text-sm font-semibold text-slate-900">Compliance Matrix FAIR-V</p>
        </div>
        <button
          type="button"
          onClick={exportPdf}
          disabled={isExporting}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300"
        >
          <Download className="h-4 w-4" />
          {isExporting ? 'Export in corso...' : 'Esporta PDF'}
        </button>
      </div>

      <div ref={containerRef} className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">Test di Friedman (approssimato)</p>
          <p className="mt-2 text-sm text-slate-700">Pazienti comuni valutati: {friedman.n}</p>
          <p className="mt-1 text-sm text-slate-700">Statistica Q: {friedman.q.toFixed(4)}</p>
          <p className="mt-1 text-sm text-slate-700">p-value approssimato: {friedman.pValue.toFixed(6)}</p>
          <p
            className={`mt-2 text-sm font-medium ${
              friedman.significant ? 'text-emerald-700' : 'text-slate-700'
            }`}
          >
            {friedman.significant
              ? 'Esito: differenza statisticamente significativa (p < 0.05).'
              : 'Esito: differenza non significativa (p >= 0.05).'}
          </p>
        </div>

        <div className="mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-900">
            Wilcoxon post-hoc (approssimato) con correzione Bonferroni
          </p>
          <p className="mt-1 text-xs text-slate-600">
            Soglia Bonferroni per confronto singolo: p &lt; {BONFERRONI_ALPHA.toFixed(4)}
          </p>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {wilcoxonPairs.map((pair) => (
              <article key={pair.pairLabel} className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-800">{pair.pairLabel}</p>
                <p className="mt-1 text-xs text-slate-600">n coppie utili: {pair.n}</p>
                <p className="mt-1 text-xs text-slate-700">W: {pair.wStatistic.toFixed(3)}</p>
                <p className="mt-1 text-xs text-slate-700">z: {pair.z.toFixed(4)}</p>
                <p className="mt-1 text-xs text-slate-700">p grezzo: {pair.pValue.toFixed(6)}</p>
                <p className="mt-1 text-xs text-slate-700">
                  p Bonferroni: {pair.pBonferroni.toFixed(6)}
                </p>
                <p
                  className={`mt-2 text-xs font-medium ${
                    pair.pBonferroni < BONFERRONI_ALPHA ? 'text-emerald-700' : 'text-slate-700'
                  }`}
                >
                  {pair.pBonferroni < BONFERRONI_ALPHA
                    ? 'Significativo dopo Bonferroni'
                    : 'Non significativo dopo Bonferroni'}
                </p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
