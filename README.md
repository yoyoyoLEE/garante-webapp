# Garante Web App

Applicazione web per supportare la **generazione** e la **valutazione** di materiali nel contesto del protocollo Garante (dataset multimodale, referti sintetici, confronto tra bracci e indicatori FAIR-V). Questo documento descrive come **configurare un ambiente indipendente** e **ripetere le procedure** su una propria infrastruttura.

---

## 1. Cosa contiene il repository

| Modulo | Funzione |
|--------|----------|
| **Generatore multimodale** | Orchestrazione della generazione procedurale (testo / allegati) tramite modelli accessibili via [OpenRouter](https://openrouter.ai/). |
| **Motore di valutazione** | Caricamento output sperimentali, confronto statistico tra bracci, calcolo DES e metriche di efficienza. |
| **Report FAIR-V** | Esportazione e visualizzazione strutturata dei risultati. |

Il frontend è **React 18** (Vite 5) con **Tailwind CSS**. Le chiamate ai modelli in produzione passano da una **Cloud Function** che funge da proxy (chiave OpenRouter solo lato server). L’accesso all’app richiede **Firebase Authentication** (e-mail/password e/o Google).

---

## 2. Architettura di riferimento

```
Browser (Hosting Firebase)
  → login Firebase Auth (ID token)
  → POST /api/openrouter + Authorization: Bearer <token>
       → Cloud Function `openrouter` (verifica token, Secret OPENROUTER_API_KEY)
       → API OpenRouter
```

In sviluppo è possibile usare l’**emulator** delle Functions e/o chiamate **dirette** a OpenRouter con chiave solo in `.env.local` (non committata).

File rilevanti: [`firebase.json`](firebase.json), [`functions/index.js`](functions/index.js), [`vite.config.js`](vite.config.js).

---

## 3. Prerequisiti

- **Node.js** 20+
- Account **Firebase** (progetto dedicato alla propria replica) e [Firebase CLI](https://firebase.google.com/docs/cli) (`npm i -g firebase-tools`)
- Account **OpenRouter** e chiave API per i modelli scelti
- Piano **Blaze** (Google Cloud) se si usano Cloud Functions che effettuano richieste HTTP esterne; si consiglia di impostare **alert di budget** nella console Google Cloud

---

## 4. Installazione locale

```bash
git clone <URL-del-repository>
cd garante-webapp
npm install
cd functions && npm install && cd ..
```

Copiare [`.env.example`](.env.example) in **`.env.local`** nella root e compilare le variabili (vedi §5). Il file `.env.local` non va incluso in pubblicazioni né committato.

Impostare il proprio proget Firebase in [`.firebaserc`](.firebaserc) oppure:

```bash
firebase login
firebase use --add
```

---

## 5. Variabili d’ambiente (frontend)

Tutti i nomi con prefisso `VITE_` sono incorporati nel bundle al **momento del build**; non sono adatti a segreti ad alta sensibilità (la “Web API key” di Firebase è pubblica per design, con restrizioni lato Google Cloud / domini autorizzati).

| Variabile | Ruolo |
|-----------|--------|
| `VITE_FIREBASE_API_KEY` | Config SDK Firebase (Console → Impostazioni progetto → App Web) |
| `VITE_FIREBASE_AUTH_DOMAIN` | Dominio Auth |
| `VITE_FIREBASE_PROJECT_ID` | ID progetto (coerente con `.firebaserc`; usato dal proxy Vite verso l’emulator) |
| `VITE_FIREBASE_STORAGE_BUCKET` | Bucket Storage indicato in console |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Sender ID |
| `VITE_FIREBASE_APP_ID` | App ID |
| `VITE_OPENROUTER_API_KEY` | *(Opzionale)* Solo sviluppo: chiamata diretta al provider, senza proxy |
| `VITE_USE_OPENROUTER_PROXY` | `true` forza l’uso del proxy anche se è presente la chiave locale |

---

## 6. Firebase: Authentication e Hosting

1. Nella **Firebase Console**, abilitare i metodi desiderati (es. **E-mail/Password**, **Google**).
2. In **Authentication → Settings → Authorized domains** includere `localhost` (sviluppo) e i domini Hosting (`<project-id>.web.app`, `<project-id>.firebaseapp.com`).
3. Opzionale ma consigliato: in **Google Cloud Console → API e servizi → Credenziali**, applicare **restrizioni** alla chiave API browser (referrer HTTP, API consentite) coerenti con i domini di deploy.

Senza autenticazione valida, la function `openrouter` risponde **401** (token Firebase obbligatorio).

---

## 7. Segreto OpenRouter (solo server)

```bash
firebase functions:secrets:set OPENROUTER_API_KEY
```

Incollare la chiave quando richiesto. Non versionare mai chiavi in repository o in issue pubbliche.

---

## 8. Esecuzione in sviluppo

**Solo frontend** (senza proxy Functions):

```bash
npm run dev
```

Se in `.env.local` è assente `VITE_OPENROUTER_API_KEY`, avviare l’emulator e usare il proxy (stesso `VITE_FIREBASE_PROJECT_ID` di `.firebaserc`):

```bash
# Terminale 1
firebase emulators:start --only functions

# Terminale 2
npm run dev
```

Emulator completo (hosting + functions): `firebase emulators:start` (porte in [`firebase.json`](firebase.json)).

---

## 9. Build e deploy manuale

```bash
npm run build
firebase deploy --only "hosting,functions"
```

Su **Windows PowerShell** mantenere le virgolette attorno a `hosting,functions`. Dopo il deploy, l’app risponde su `https://<project-id>.web.app`; il rewrite `/api/openrouter` è definito in `firebase.json`.

---

## 10. Deploy continuo con GitHub Actions (opzionale)

Il workflow [`.github/workflows/deploy-firebase.yml`](.github/workflows/deploy-firebase.yml) esegue build e `firebase deploy` al push su `main`.

### 10.1 Autenticazione del workflow (account di servizio)

1. **Google Cloud Console** (progetto collegato a Firebase) → **IAM** → **Account di servizio** → creare un account dedicato al CI.
2. Assegnare al progetto un ruolo sufficiente per Hosting, Cloud Functions (Gen 2), Cloud Build e Artifact Registry (in ambienti controllati si possono usare ruoli più granulari del generico **Editor**).
3. Creare una **chiave JSON** (una tantum), scaricarla in modo sicuro.
4. Nel repository GitHub: **Settings → Secrets and variables → Actions → New repository secret**
   - Nome: `FIREBASE_SERVICE_ACCOUNT_JSON`
   - Valore: **intero contenuto** del file JSON (da `{` a `}`), senza committare il file nel repo.

Riferimento ufficiale: [Autenticazione Google Cloud](https://cloud.google.com/docs/authentication/getting-started).

### 10.2 Variabili per il build Vite su GitHub

Le stesse chiavi del §5 devono essere definite come **Repository variables** (scheda **Variables**, non come corpo di un unico secret): **Name** = nome variabile, **Value** = **solo il valore** come dopo `=` in `.env.local` — **non** anteporre `VITE_FIREBASE_API_KEY=` nel campo valore (causerebbe errore `auth/api-key-not-valid` in produzione).

Nomi attesi: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`.

---

## 11. Riproduttibilità e dati

- Non pubblicare file `.env`, `.env.local`, chiavi API né export di dati identificabili senza autorizzazione etica/legale del contesto di studio.
- Documentare nel proprio articolo o allegato: **versione del commit**, **modelli OpenRouter** e parametri usati, **seed** o checkpoint se applicabili (il codice può evolvere: il commit fissa lo stato del software).
- Dopo studi condivisi, valutare **rotazione** delle chiavi esposte in ambienti non più controllati.

---

## 12. Stack tecnico

React 18.3, Vite 5, Tailwind 4, Firebase (Auth, Hosting, Functions v2), OpenRouter (proxy server-side), jsPDF, html2canvas, Papa Parse, SheetJS (xlsx), Lucide React.

Per segnalazioni tecniche sul codice, usare le issue del repository mantenendo fuori credenziali e dati sensibili.
