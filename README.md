# Garante Web App

**Garante Web App** è uno strumento software per la **simulazione controllata** e la **valutazione comparativa** di flussi clinico-documentali nel contesto del **protocollo Garante**. Non sostituisce il giudizio clinico né costituisce dispositivo medico: mette a disposizione un laboratorio digitale in cui generare **dataset sintetici multimodali** e misurare quanto bene diversi “operatori” (umani o automatici) **estraggano** le stesse informazioni strutturate da materiali coerenti con un episodio chirurgico fittizio.

---

## Perché esiste

Il protocollo mira a confrontare, in modo **ripetibile** e **quantificabile**, più modalità di produzione o di lettura della documentazione (per esempio diversi **bracci sperimentali** o diversi **modelli linguistici**) sullo **stesso** insieme di variabili cliniche. L’app supporta due momenti: **generare** i materiali secondo regole note, e **valutare** l’estrazione dati confrontandola con un **riferimento** (ground truth) definito a monte.

---

## Generatore multimodale

Questa sezione produce un **dataset** di casi sintetici impostato su **330 pazienti** e, per ciascuno, **tre documenti** che rappresentano canali informativi diversi:

- testo di **ingresso** (`txt_ingresso`);
- **quadro operatorio** in forma testuale descrittiva (`jpg_operatorio` — contenuto testuale strutturato come referto di sala, non un file immagine binario);
- **lettera di dimissione** (`pdf_dimissione` — ancora come testo strutturato nel flusso di generazione).

Le variabili cliniche seguono uno schema codificato (**V01–V20** per i dati demografici e di percorso, **H01–H03** per aspetti aggiuntivi come dispositivo energetico in sala, invio pezzi istologici, allergie). I casi sono costruiti a partire da **percorsi coerenti** (diagnosi di ricovero, setting di ammissione, tipo di intervento e approccio chirurgico collegati tra loro), così da evitare combinazioni incoerenti pur restando in ambito simulato.

La parte testuale “ricca” dei tre documenti può essere **generata da modelli linguistici** (accessibili tramite provider compatibile con **OpenRouter**), con istruzioni vincolate a restituire un **unico oggetto JSON** con esattamente le tre stringhe previste. È possibile introdurre, a fini di stress test del motore di valutazione, **alterazioni controllate** del contenuto (simulazione di referti corrotti o incompleti) e gestire **sessioni**, **checkpoint** ed **export** (ad esempio archivi compressi e report in PDF) per documentare le run sperimentali.

In sintesi, il generatore non “inventa un paziente reale”: produce **cartelle cliniche fittizie** utilizzabili per confrontare metodi di estrazione o di generazione in condizioni **note** e **riproducibili** (inclusa la scelta del modello e dei parametri di generazione).

---

## Motore di valutazione e report FAIR-V

Il motore di valutazione confronta, per ogni paziente e per un insieme fissato di **variabili di estrazione**, il valore **di riferimento** con il valore **osservato** (per esempio output di un sistema automatico o di una trascrizione cieca), variabile per variabile. Il confronto alimenta il calcolo del **DES (Data Extraction Score)**: punteggio **0–20** per paziente, sintesi della corrispondenza rispetto al ground truth sulle variabili definite per lo studio.

I casi sono organizzati in **tre bracci** denominati **A1**, **A2** e **B**, così da poter confrontare parallelamente tre condizioni sperimentali sullo stesso disegno. Dalle serie di DES derivano indicatori operativi quali:

- **EE (Extraction Efficiency)** — rapporto tra DES medio e un tempo totale associato alla run (efficienza dell’estrazione nel tempo);
- **DLC (Data Loss / Leakage Coefficient)** — coefficiente percentuale legato a perdita o dispersione di informazione, utilizzabile come parametro di studio quando definito nel protocollo.

La sezione **report FAIR-V** sintetizza i risultati aggregati: include un test **non parametrico di Friedman** sulle serie di DES tra i tre bracci (con correzione tipo **Bonferroni** per confronti multipli dove applicato nel codice) e offre una lettura **divulgativa** delle differenze tra bracci, con possibilità di esportazione per documentazione o pubblicazione.

---

## Accesso e uso responsabile

L’accesso all’applicazione è **riservato** (autenticazione con credenziali o account terzi configurati dall’amministratore del servizio). I dati prodotti negli esperimenti sono **sintetici** rispetto al disegno del generatore; resta comunque opportuno trattare export, log e eventuali annotazioni secondo le **norme etiche e privacy** del proprio istituto e del protocollo di ricerca approvato.

---

## Nota

Questo documento descrive **cosa fa** l’applicazione dal punto di vista scientifico-operativo. I dettagli di installazione, configurazione e manutenzione restano nel **codice sorgente** e negli eventuali materiali tecnici allegati al repository, senza duplicarli qui.
