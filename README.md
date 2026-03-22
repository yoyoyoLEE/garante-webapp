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

1. **Collega il repository** a GitHub (se non l’hai già fatto): crea il repo su GitHub, poi nella cartella del progetto:
   ```bash
   git remote add origin https://github.com/TUO_UTENTE/garante-webapp.git
   git push -u origin main
   ```
   Se il branch predefinito su GitHub è `master`, rinominalo in `main` oppure modifica il file [`.github/workflows/deploy-firebase.yml`](.github/workflows/deploy-firebase.yml) sostituendo `main` con `master`.

2. **Crea un token CI per Firebase** (sul tuo PC, una tantum):
   ```bash
   firebase login:ci
   ```
   Si apre il browser; al termine il terminale mostra un **token** lungo. **Non** condividerlo e **non** committarlo.

3. **Aggiungi il secret su GitHub**: repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**  
   - Nome: `FIREBASE_TOKEN`  
   - Valore: incolla il token ottenuto al passo 2.

4. **Committa e pusha** il workflow (`.github/workflows/deploy-firebase.yml`) e [`.firebaserc`](.firebaserc) con il **project ID** corretto (`default` deve essere il tuo progetto Firebase, es. `garante-webapp`).

5. Ogni **push su `main`** parte il workflow **Deploy Firebase** (scheda **Actions** del repo). Puoi anche lanciarlo a mano: **Actions** → **Deploy Firebase** → **Run workflow**.

Il token `FIREBASE_TOKEN` ha gli stessi permessi del tuo account Firebase: trattalo come una password e ruotalo se compromesso (`firebase login:ci` di nuovo e aggiorna il secret).

### Errore CI: `Failed to authenticate, have you run firebase login?`

Significa che **GitHub non sta passando un token valido** a `firebase deploy`. Controlla:

1. **Secret creato nel repo giusto**: apri **Settings** del **repository** del progetto (non le impostazioni globali del profilo GitHub), poi **Secrets and variables** → **Actions**.
2. **Nome esatto**: `FIREBASE_TOKEN` (maiuscole/minuscole come scritto; niente spazi).
3. **Valore**: sul PC esegui `firebase login:ci`, copia **tutto** il token che stampa il terminale e incollalo nel secret (una sola riga).
4. **Account**: l’account Google usato in `firebase login:ci` deve avere accesso al progetto Firebase (`garante-webapp`) come Owner/Editor.
5. Dopo aver salvato il secret, rilancia il workflow (**Actions** → workflow fallito → **Re-run all jobs**) o fai un commit vuoto e push.

Il warning su Node.js 20 nelle Actions è solo informativo per ora; non è la causa dell’errore di autenticazione.

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
