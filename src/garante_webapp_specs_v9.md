SPECIFICHE TECNICHE: Garante Web App (v9)



Documento di progettazione per l'In-Silico Generator \& Evaluator



1\. Obiettivo dell'Applicazione



La "Garante Web App" è un'applicazione React standalone, progettata per essere utilizzata esclusivamente dal Biostatistico Indipendente. Deve assolvere a due funzioni fondamentali per garantire il protocollo Zero-Knowledge:



Generazione Procedurale e Multimodale (Variety \& Real-World Simulation): Creare la Ground Truth e i 990 referti nei tre formati richiesti (TXT, PDF, JPG) simulando il caos dei dati reali (asimmetria e corruzione), mantenendo l'esperienza utente "chiavi in mano" e un costo API pari a zero.



Motore di Valutazione Statistica (Veracity, Velocity \& FAIR-V): Incrociare i CSV estratti dai tre bracci (A1, A2, B) per calcolare il Data Extraction Score (DES), registrare i tempi operativi, calcolare gli indici di efficienza e generare la Compliance Matrix.



2\. Modulo 1: Data Generation Engine (Zero-Cost \& Bias Prevention)



A. Il "Deterministic Random Seed" e Sicurezza API



Per garantire un'esperienza fluida al Garante, l'API Key non verrà richiesta all'utente.



Input UI: 1. Secret Seed: (es. GaranteTrial2026) per il generatore pseudo-casuale (PRNG), garantendo la riproducibilità.

2\. Model Selector (Opzionale): Dropdown per selezionare modelli a costo zero tramite OpenRouter (es. meta-llama/llama-3-8b-instruct:free, deepseek/deepseek-chat:free).



Gestione Secrets (API Key): La chiave di OpenRouter sarà fornita dallo sviluppatore tramite Variabili d'Ambiente (.env) iniettate a tempo di build (es. VITE\_OPENROUTER\_API\_KEY). Per prevenire abusi (essendo un'app client-side), la chiave dovrà essere generata con un Hard Credit Limit prossimo allo zero e restrizioni sui referer HTTP.



B. Generazione Strutturata Base (Ground Truth Temporanea)



Generazione in memoria di una matrice di 330 righe (Pazienti Virtuali) in ambito Chirurgia Generale.



Assegnazione di 20 variabili note e 3 variabili nascoste.



C. Real-World EHR Simulation Engine (Logica Architetturale)



Per simulare la caotica realtà clinica ed evitare un'estrazione banale, il generatore applicherà tre regole durante la creazione dei documenti:



Dynamic Payload Split (Distribuzione Asimmetrica): Le 23 variabili non saranno divise equamente. Per ogni paziente, il PRNG genererà una maschera di distribuzione. L'LLM riceverà istruzioni per concentrare i dati medici solo nei file designati, riempiendo gli altri con testo descrittivo irrilevante.



Controlled File Corruption (Tasso di Corruzione): Un tasso prefissato (es. 5-10%) di documenti verrà deliberatamente corrotto durante la renderizzazione (TXT con encoding rotto, PDF bianco, JPG oscurato).



La Trappola delle Allucinazioni (Ground Truth Definitiva): Se una variabile cade in un file designato come "corrotto", il sistema aggiornerà automaticamente la Ground Truth sovrascrivendo il valore con NOT\_FOUND. Le allucinazioni comporteranno l'azzeramento del punto.



D. Resilient Generation Engine (Token Optimization \& Rate Limiting)



Per evitare blocchi dovuti ai limiti delle API gratuite (RPM/TPM) e gestire \~1 milione di token in modo sicuro, il motore di generazione implementerà:



Ottimizzazione del Payload (3-in-1): Invece di 990 chiamate API, l'app ne effettuerà solo 330 (una per paziente). Il prompt richiederà un singolo oggetto JSON contenente i tre referti testuali uniti ({ "txt\_ingresso": "...", "jpg\_operatorio": "...", "pdf\_dimissione": "..." }).



Coda Asincrona con Exponential Backoff: I pazienti verranno processati strettamente in sequenza. Se OpenRouter restituisce un errore 429 Too Many Requests, il sistema andrà in pausa automatica (es. 30 secondi), raddoppiando l'attesa in caso di fallimenti successivi, senza far crashare l'app.



Resumability (Caching in LocalStorage): L'avanzamento verrà salvato nella cache del browser riga per riga. In caso di interruzione (es. tab chiuso per sbaglio, limite giornaliero raggiunto), l'app permetterà di riprendere la generazione dal punto esatto di arresto o di cambiare modello API in corsa.



Rendering Massivo Client-Side: Una volta completata (o ripresa) la matrice testuale in memoria, l'app genererà i formati fisici finali (jsPDF, html2canvas con filtri) e scaricherà lo ZIP finale (dataset\_operatori.zip) unitamente a ground\_truth\_secret.csv.



3\. Modulo 2: Evaluation \& Statistics Engine



A. Upload Dati e Inserimento Metriche (Velocity \& FAIR)



Input File: 4 aree di Dropzone (Ground Truth + i 3 CSV degli operatori).



Input Tempi (Velocity): Campi manuali per T1\_minutes e T2\_minutes per ogni braccio.



Input Qualitativi (FAIR-V): Campi per inserire il MOS, e le percentuali per ONR e DLC.



B. Calcolo del Data Extraction Score (DES - Veracity)



Confronto riga per riga. 1 punto per matching esatto (incluso il corretto riconoscimento dei NOT\_FOUND). Punteggio continuo massimo: 20.



C. Motore di Efficienza Relativa (Exploratory Indices)



Calcolo automatico in background:



Ttotal: T1 + T2.



ABR (Adaptation Burden Ratio): T2 / T1.



EE (Extraction Efficiency): Media DES / Ttotal.



D. Motore Statistico e Report (Export)



Test di Friedman globale sul DES, seguito da Wilcoxon Signed-Rank post-hoc con correzione di Bonferroni (p < 0.016).



Export di un Report PDF che include: P-value, Dashboard dei Tempi, Indici ABR/EE e la FAIR-aligned Compliance Matrix impaginata.



4\. Stack Tecnologico Previsto



Framework: React + Tailwind CSS.



Integrazione AI Generativa: Fetch HTTP nativo verso l'API Gateway di OpenRouter. Utilizzo di Variabili d'Ambiente (import.meta.env.VITE\_OPENROUTER\_API\_KEY) per l'autenticazione.



Librerie di Utility: papaparse (CSV), jszip (ZIP), jspdf, html2canvas.



Statistica: Logica custom JS client-side per Friedman/Wilcoxon.

