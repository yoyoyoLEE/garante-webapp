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

## Build e deploy

```bash
npm run build
firebase deploy --only hosting,functions
```

Oppure deploy completo:

```bash
firebase deploy
```

Dopo il deploy, l’app su `https://<project>.web.app` userà `POST /api/openrouter` con rewrite definito in [`firebase.json`](firebase.json).

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
