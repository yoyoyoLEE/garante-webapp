# Garante Web App

Applicazione React (Vite) per il **Generator Engine** e il **Motore di valutazione** del protocollo Garante.

## OpenRouter: chiave API

- **Produzione (Firebase Hosting):** la chiave **non** va nel frontend. È memorizzata come **Secret** `OPENROUTER_API_KEY` sulle Cloud Functions; il browser chiama solo `POST /api/openrouter` (stesso dominio).
- **Sviluppo locale:** opzionale `VITE_OPENROUTER_API_KEY` in `.env.local` per chiamate dirette a OpenRouter, **oppure** nessuna chiave nel client + **emulator** Firebase (vedi sotto).

Vedi [`.env.example`](.env.example) per i nomi delle variabili (senza valori segreti).

## Prerequisiti

- Node 20+
- Account Firebase e [Firebase CLI](https://firebase.google.com/docs/cli): `npm i -g firebase-tools`
- Piano **Blaze** (pay-as-you-go) spesso richiesto per Cloud Functions che chiamano API esterne (OpenRouter). Imposta **budget alert** nella console Google Cloud.

## Configurazione Firebase

1. Copia [`.firebaserc`](.firebaserc) e imposta il **project ID** reale, oppure nella root del repo:
   ```bash
   firebase login
   firebase use --add
   ```
2. Allinea `VITE_FIREBASE_PROJECT_ID` in `.env.local` allo stesso project ID (per il proxy Vite → emulator).

## Secret OpenRouter (solo server)

```bash
cd functions
npm install
cd ..
firebase functions:secrets:set OPENROUTER_API_KEY
```

Incolla la chiave quando richiesto. Non committare mai la chiave.

## Sviluppo locale (frontend)

```bash
npm install
npm run dev
```

- Con **`.env.local`** contenente `VITE_OPENROUTER_API_KEY`: chiamata diretta a OpenRouter (comportamento classico).
- **Senza** chiave nel client: avvia l’emulator e usa il proxy verso la function `openrouter`:

```bash
# terminale 1 — dalla root del repo
firebase emulators:start --only functions
```

```bash
# terminale 2
npm run dev
```

Assicurati che `VITE_FIREBASE_PROJECT_ID` in `.env.local` corrisponda al project in `.firebaserc`.

## Build e deploy (manuale dal PC)

```bash
npm run build
firebase deploy --only "hosting,functions"
```

Su **PowerShell** usa le virgolette attorno a `hosting,functions`. Oppure:

```bash
firebase deploy
```

Dopo il deploy, l’app su `https://<project>.web.app` userà `POST /api/openrouter` con rewrite definito in [`firebase.json`](firebase.json).

## Deploy automatico da GitHub (CI)

Flusso: lavori in Cursor → `git push` sul branch **`main`** → GitHub Actions esegue build e `firebase deploy`.

L’autenticazione usa un **account di servizio Google** (JSON), come raccomandato da `firebase-tools` al posto di `FIREBASE_TOKEN` (deprecato).

### 1. Crea l’account di servizio (Google Cloud Console)

1. Apri [Google Cloud Console](https://console.cloud.google.com/) e seleziona il progetto **stesso** del tuo Firebase (es. `garante-webapp`).
2. **IAM e amministrazione** → **Account di servizio** → **Crea account di servizio**.
3. Nome es. `github-actions-firebase-deploy` → **Crea e continua**.
4. **Concedi a questo account di servizio l’accesso al progetto**: aggiungi il ruolo **Editor** (`Editor`) sul progetto.  
   (In ambienti più restrittivi si possono usare ruoli più granulari; per un repo personale è il modo più semplice per far funzionare Hosting + Functions Gen2 + Build.)
5. **Fine** → apri l’account creato → scheda **Chiavi** → **Aggiungi chiave** → **Crea nuova chiave** → formato **JSON** → scarica il file **una sola volta**.

### 2. Cosa mettere in `FIREBASE_SERVICE_ACCOUNT_JSON` (spiegazione dettagliata)

**Non è un testo che inventi tu.** È **l’intero contenuto del file `.json`** che Google scarica quando crei la chiave (passo 1, punto 5).

1. Sul PC trovi un file con nome tipo `garante-webapp-xxxxx.json` (il nome può variare).
2. Aprilo con **Blocco note** / VS Code / qualsiasi editor di testo.
3. Seleziona **tutto** (`Ctrl+A`), **copia** (`Ctrl+C`).
4. Su GitHub: **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:
   - **Name:** esattamente `FIREBASE_SERVICE_ACCOUNT_JSON` (maiuscole/minuscole come scritto).
   - **Secret:** incolla **tutto** quello che hai copiato. Deve iniziare con `{` e finire con `}`.

**Come capisci che è il file giusto:** dentro ci sono campi come `"type": "service_account"`, `"project_id": "garante-webapp"` (o il tuo ID progetto), `"private_key": "-----BEGIN PRIVATE KEY-----\n...`, `"client_email": "qualcosa@....iam.gserviceaccount.com"`.  
Se vedi queste cose, è il JSON corretto.

**Cosa non va messo nel secret:**

- Il vecchio **token** da `firebase login:ci` (stringa corta, non è un JSON).
- Solo il **project ID** o solo l’email dell’account di servizio.
- Un JSON **tagliato** a metà o modificato a mano.
- **Mai** committare questo file nel repository: solo nel secret GitHub.

- **(Opzionale)** Se avevi ancora il secret `FIREBASE_TOKEN`, puoi eliminarlo: il workflow non lo usa più.

### 3. Push su `main`

Il file [`.github/workflows/deploy-firebase.yml`](.github/workflows/deploy-firebase.yml) esegue `google-github-actions/auth` e poi `firebase deploy`. Ogni push su **`main`** avvia il deploy; puoi anche usare **Actions** → **Deploy Firebase** → **Run workflow**.

### Errori CI comuni

- **`Failed to list functions` / errori IAM**: l’account di servizio non ha ruoli sufficienti sul progetto; verifica il ruolo **Editor** (o equivalenti per Cloud Functions / Cloud Build).
- **Secret mancante o nome sbagliato**: il nome deve essere esattamente `FIREBASE_SERVICE_ACCOUNT_JSON`.
- **JSON troncato o modificato**: incolla l’intero JSON valido, senza virgolette extra attorno.

Il warning su **Node.js 20** nelle Actions è informativo; separato dai problemi di deploy.

## Emulator completo (opzionale)

```bash
firebase emulators:start
```

Include hosting (porta 5000) e functions (5001) secondo [`firebase.json`](firebase.json).

## Pubblicazione codice (rivista / repository)

- Non includere `.env`, `.env.local`, né secret.
- Ruotare/revocare la chiave OpenRouter usata in fase studio dopo la pubblicazione, se era esposta in ambienti non più controllati.

## Stack

- React 18, Vite 5, Tailwind 4, jsPDF, html2canvas, OpenRouter (via proxy in produzione).
