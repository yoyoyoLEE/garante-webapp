CLINICAL DATASET SCHEMA (v1)



Blueprint per la generazione procedurale della Ground Truth e dei referti multimodali



Ambito Clinico: Chirurgia Generale (Perioperatorio)

Numerosità: 330 Pazienti Virtuali (990 Documenti Multimodali)



1\. Profilo di Popolazione e Case Mix (Variability Engine)



Per garantire una simulazione "Real-World" ad alta fedeltà semantica, il generatore pseudo-casuale (PRNG) creerà una coorte con le seguenti distribuzioni forzate:



Setting di Ricovero: 50% Elezione (es. Colecistectomia laparoscopica programmata, Ernioplastica, Resezione colica per K) / 50% Urgenza (es. Appendicite acuta, Peritonite da ulcera perforata, Occlusione intestinale).



Dati Demografici: Età randomizzata (18 - 90 anni). Sesso randomizzato (M/F). BMI randomizzato (18.0 - 45.0+).



Comorbilità: Stratificazione ASA Score da I (Paziente sano) a IV (Paziente con malattia sistemica severa a rischio di vita).



2\. Le 20 Variabili Baseline (Fase 1 - Estrazione Standard)



Queste variabili comporranno la Ground Truth iniziale. I sistemi estrattivi dovranno normalizzare testi discorsivi eterogenei in questi formati rigidi:



|



| ID | Nome Variabile | Tipo Dato | Descrizione / Esempio |

| V01 | Age | Numerico | Età al momento del ricovero. |

| V02 | Biological\_Sex | Categorico | M / F. |

| V03 | BMI | Numerico | Indice di massa corporea (es. 24.5). |

| V04 | Admission\_Setting | Categorico | Elective / Urgent. |

| V05 | Primary\_Diagnosis | Testo | Diagnosi principale (es. "Colecistite acuta litiasica"). |

| V06 | ASA\_Score | Categorico | I, II, III, IV. |

| V07 | Diabetes\_Mellitus | Booleano | Yes / No (da estrarre da anamnesi). |

| V08 | Hypertension | Booleano | Yes / No. |

| V09 | Preop\_Hemoglobin | Numerico | Valore Hb preoperatorio (es. 12.5). |

| V10 | Preop\_WBC | Numerico | Globuli bianchi preoperatori (es. 14000). |

| V11 | Surgical\_Procedure | Testo | Intervento eseguito (es. "Appendicectomia"). |

| V12 | Surgical\_Approach | Categorico | Open / Laparoscopic / Robotic. |

| V13 | Operative\_Time\_Minutes | Numerico | Durata dell'intervento in minuti. |

| V14 | Estimated\_Blood\_Loss\_ml | Numerico | Sanguinamento stimato (es. 150). |

| V15 | Intraoperative\_Complications | Booleano | Yes / No (es. lesione iatrogena, emorragia). |

| V16 | Antibiotic\_Prophylaxis | Booleano | Yes / No. |

| V17 | Postop\_Day1\_Pain\_VAS | Numerico | Punteggio dolore (0-10) in prima giornata. |

| V18 | Postop\_Surgical\_Site\_Infection | Booleano | Yes / No (estratto dal decorso/dimissione). |

| V19 | Length\_Of\_Stay\_Days | Numerico | Giorni totali di degenza. |

| V20 | Discharge\_Destination | Categorico | Home / Rehab / Transfer. |



3\. Le 3 Variabili Nascoste (Fase 2 - Stress Test per lo Schema Mutation Cost)



Rivelate a sorpresa solo per la Fase 2. Sono annidate in profondità nei testi narrativi per massimizzare la penalità di adattamento strutturale (T2) dei sistemi relazionali:



| ID | Nome Variabile | Tipo Dato | Descrizione / Posizione tipica |

| H01 | Surgical\_Energy\_Device\_Brand | Testo | Marca o tipo di bisturi avanzato usato (es. "Harmonic", "LigaSure", "Monopolare"). Nascosto nel corpo del referto chirurgico. |

| H02 | Pathology\_Specimen\_Sent | Booleano | Yes / No. Invio del pezzo operatorio in Anatomia Patologica. Menzionato tipicamente a fine intervento o in lettera di dimissione. |

| H03 | Non\_Pharmacological\_Allergy | Testo | Allergie non da farmaci (es. "Lattice", "Iodio", "Cerotti"). Nascosto nell'anamnesi frammentata del referto di PS. |



4\. Logica di Corruzione e Dynamic Payload (Gestione Uniformità)



Come da Specifiche Web App (v7):



Dynamic Payload Split: Le 23 variabili non saranno uniformemente presenti nei 3 file per ogni paziente, ma distribuite in modo asimmetrico da una maschera casuale per simulare la disorganizzazione documentale clinica.



Controlled File Corruption: Il 5-10% dei file generati sarà reso illeggibile/corrotto (es. referto JPG nero, PDF bianco).



Missing Value (The Hallucination Trap): Le variabili "perse" nei file corrotti o omesse dalla maschera generativa avranno il valore di NOT\_FOUND nella Ground Truth. I sistemi di estrazione devono esplicitare il dato mancante per ottenere il punteggio (Veracity); le allucinazioni comporteranno l'azzeramento del punto.

