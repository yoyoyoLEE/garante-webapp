import { getFirebaseAuth } from './firebase.js'

/**
 * Modalità proxy: nessuna chiave nel bundle (deploy Firebase) oppure forzata con VITE_USE_OPENROUTER_PROXY.
 * Modalità diretta: VITE_OPENROUTER_API_KEY in .env.local (solo sviluppo locale).
 */
export function shouldUseOpenRouterProxy() {
  const key = import.meta.env.VITE_OPENROUTER_API_KEY
  const force = import.meta.env.VITE_USE_OPENROUTER_PROXY === 'true'
  return Boolean(force || !key)
}

/**
 * @param {{ apiKey?: string, referer: string, openRouterBody: Record<string, unknown> }} opts
 * @returns {Promise<Response>}
 */
export async function fetchOpenRouterChatCompletion({ apiKey, referer, openRouterBody }) {
  const useProxy = shouldUseOpenRouterProxy()

  if (useProxy) {
    const auth = getFirebaseAuth()
    const user = auth?.currentUser
    if (!user) {
      throw new Error(
        'Sessione non valida. Effettua l\'accesso per usare il proxy OpenRouter.',
      )
    }
    const idToken = await user.getIdToken()
    return fetch('/api/openrouter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ referer, openRouterBody }),
    })
  }

  if (!apiKey) {
    throw new Error(
      'API key OpenRouter mancante. In locale: VITE_OPENROUTER_API_KEY in .env.local. In produzione: usa il proxy Firebase.',
    )
  }

  return fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': referer,
      'X-Title': 'Garante Web App',
    },
    body: JSON.stringify(openRouterBody),
  })
}
