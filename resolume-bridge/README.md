# Resolume Bridge — Brasserie

Cartella separata dalla webapp (non entra nella build Vite). Gira sul PC collegato
al ledwall della Brasserie, in due modalità:

- **Sync** (`node sync.js`, con internet, prima dell'evento): legge da Firestore la
  config pubblicata per la settimana, scarica i PNG necessari in `media/`, e genera
  `config.json` risolvendo già i clip-id reali di Resolume.
- **Live** (`node live.js`, durante l'evento, offline): legge solo `config.json` +
  `media/` e fa ripuntare ogni clip alla REST API di Resolume in `localhost`.

## Mappatura Resolume (verificata il 03/07/2026)

Vedi [resolume-map.js](resolume-map.js) per i dettagli. Riassunto (indici 0-based,
Resolume in UI li mostra +1):

| Layer | Colonna (0-based) | Contenuto |
|---|---|---|
| ARTISTI | 0, 1, 2... | slot nell'ordine inserito sulla pagina web |
| SPONSOR | 16 | bancarella cibo |
| SPONSOR | 17 | DJ pre-serata |
| NEXT | 1 | grafica "Next" della settimana |

Se in futuro le colonne cambiano, modifica solo `resolume-map.js`.

## Setup iniziale (una tantum)

1. **Node.js 18+** installato sul PC (verifica con `node -v`).
2. `npm install` in questa cartella.
3. **Chiave account di servizio Firebase**: Firebase Console → ⚙️ Impostazioni
   progetto → tab "Account di servizio" → "Genera nuova chiave privata". Salva il
   file JSON scaricato esattamente come `serviceAccountKey.json` in questa cartella
   (è già escluso da git, non va mai committato).
4. In Resolume: Preferences → tab **Webserver** → attiva il webserver (porta 8080).

## Uso settimanale

**Quando c'è internet, prima dell'evento:** fai doppio click su **`Sincronizza.command`**
(Mac) o **`Sincronizza.bat`** (Windows) — si apre una finestra, mostra l'esito, e resta
aperta finché non premi INVIO. In alternativa da terminale:
```bash
npm run sync
```
Sincronizza automaticamente la prossima settimana con stato "Pubblicata" (data
odierna o futura). Per forzare una data specifica:
```bash
node sync.js --date 2026-07-10
```

**Durante l'evento (anche senza internet):** doppio click su **`Avvia-Live.command`**
(Mac) o **`Avvia-Live.bat`** (Windows). Da terminale:
```bash
npm run live
```
Applica subito tutte le clip lette da `config.json`. Logga chiaramente cosa fa
(quale file va in quale clip) e segnala eventuali file mancanti senza bloccarsi
sugli altri.

## Script di esplorazione/test

### test-connection.js

Verifica che Resolume risponda e stampa la struttura reale della composizione
(layer, colonne, clip con i loro id) — utile se la struttura cambia in futuro.

```bash
node test-connection.js
```

Salva tutto anche in `composition-dump.json` (ignorato da git).

### Test sperimentale di riassegnazione file

```bash
node test-connection.js --open-clip <clipId> "/percorso/assoluto/logo.png"
```

Confermato funzionante il 03/07/2026 su una colonna di test del layer ARTISTI.
Usalo solo su clip di test, mai durante un evento live.
