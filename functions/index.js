/**
 * Proxy HTTPS verso OpenRouter: la chiave API esiste solo come Secret (mai nel client).
 * Richiede Firebase Authentication: header Authorization: Bearer <ID token>.
 */
const admin = require('firebase-admin')
const { onRequest } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')

if (!admin.apps.length) {
  admin.initializeApp()
}

const openRouterApiKey = defineSecret('OPENROUTER_API_KEY')

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

/**
 * @param {string|undefined} origin
 * @returns {boolean}
 */
function isAllowedOrigin(origin) {
  if (!origin) return true
  return (
    /^https:\/\/[a-z0-9-]+\.web\.app$/i.test(origin) ||
    /^https:\/\/[a-z0-9-]+\.firebaseapp\.com$/i.test(origin) ||
    /^http:\/\/localhost:\d+$/i.test(origin) ||
    /^http:\/\/127\.0\.0\.1:\d+$/i.test(origin)
  )
}

/**
 * @param {import('firebase-functions').https.Request} req
 * @param {import('firebase-functions').https.Response} res
 */
function setCors(req, res) {
  const origin = req.headers.origin
  if (origin && isAllowedOrigin(origin)) {
    res.set('Access-Control-Allow-Origin', origin)
    res.set('Vary', 'Origin')
  } else if (!origin) {
    res.set('Access-Control-Allow-Origin', '*')
  }
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.set('Access-Control-Max-Age', '3600')
}

exports.openrouter = onRequest(
  {
    region: 'us-central1',
    secrets: [openRouterApiKey],
    memory: '256MiB',
    timeoutSeconds: 120,
    invoker: 'public',
  },
  async (req, res) => {
    setCors(req, res)

    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' })
      return
    }

    const authHeader = req.headers.authorization
    if (!authHeader || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized: token mancante' })
      return
    }
    const idToken = authHeader.slice(7)
    try {
      await admin.auth().verifyIdToken(idToken)
    } catch (e) {
      console.warn('verifyIdToken failed', e?.message || e)
      res.status(401).json({ error: 'Unauthorized: token non valido' })
      return
    }

    let body = req.body
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body)
      } catch {
        res.status(400).json({ error: 'Invalid JSON body' })
        return
      }
    }

    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Missing body' })
      return
    }

    const referer =
      typeof body.referer === 'string' && body.referer.length > 0
        ? body.referer
        : 'https://garante.web.app'

    const openRouterBody = body.openRouterBody
    if (!openRouterBody || typeof openRouterBody !== 'object') {
      res.status(400).json({ error: 'Missing openRouterBody' })
      return
    }

    const key = openRouterApiKey.value()
    if (!key) {
      res.status(500).json({ error: 'Server misconfiguration: OPENROUTER_API_KEY' })
      return
    }

    try {
      const orRes = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': referer,
          'X-Title': 'Garante Web App',
        },
        body: JSON.stringify(openRouterBody),
      })

      const text = await orRes.text()
      const ct = orRes.headers.get('content-type') || 'application/json'
      res.status(orRes.status)
      res.set('Content-Type', ct)
      if (orRes.status === 429 && orRes.headers.get('retry-after')) {
        res.set('retry-after', orRes.headers.get('retry-after'))
      }
      res.send(text)
    } catch (err) {
      console.error('openrouter proxy error', err)
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Upstream fetch failed',
      })
    }
  },
)
