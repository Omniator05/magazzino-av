# 🎛️ Magazzino AV - App Gestione Attrezzatura Audio/Luci

PWA (Progressive Web App) per la gestione del magazzino attrezzatura audio/luci eventi.

## 📱 Funzionalità

### 🏠 Dashboard
- Panoramica istantanea: articoli totali, fuori magazzino, prossimi eventi
- Alert automatici per articoli mancanti
- Accesso rapido alle funzioni principali

### 📦 Magazzino
- Aggiunta articoli con categoria, marca, modello, quantità
- Stato disponibilità in tempo reale (disponibile / parziale / fuori)
- **Generazione automatica QR Code + Barcode** per ogni articolo
- Stampa etichette direttamente dal telefono
- Ricerca istantanea

### 🎪 Eventi
- Creazione eventi con data e location
- **Lista di carico** personalizzata per evento
- Spunta articoli rientrati (aggiorna automaticamente il magazzino)
- Barra di progresso visuale (quanti pezzi sono rientrati)

### 📷 Scanner
- **Scansione QR/Barcode** con fotocamera del telefono
- Identificazione istantanea dell'articolo e disponibilità
- Inserimento manuale del codice come alternativa

---

## 📲 Installazione su telefono

1. Apri l'app nel browser del telefono
2. **iOS Safari**: tocca "Condividi" → "Aggiungi a schermata Home"
3. **Android Chrome**: tocca i tre puntini → "Aggiungi a schermata Home"

L'app si comporterà come un'app nativa!

---

## 🗂️ Struttura progetto

```
src/
├── context/
│   └── AuthContext.jsx      # Login/logout Firebase Auth
├── hooks/
│   └── useFirestore.js      # Hook Firestore (items, events)
├── pages/
│   ├── Login.jsx            # Schermata login/registrazione
│   ├── Dashboard.jsx        # Home con statistiche
│   ├── Inventory.jsx        # Gestione magazzino + QR
│   ├── Events.jsx           # Lista eventi
│   ├── EventDetail.jsx      # Lista carico evento
│   └── Scanner.jsx          # Scanner QR/barcode
├── components/
│   └── TabBar.jsx           # Navigazione inferiore
├── utils/
│   └── generateCode.js      # Generazione QR e barcode
├── firebase.js              # ⚠️ CONFIGURA QUI
└── index.css                # Stili globali
```
