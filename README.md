# 🎛️ Magazzino AV - App Gestione Attrezzatura Audio/Luci

PWA (Progressive Web App) per la gestione del magazzino attrezzatura audio/luci eventi.

## 🚀 Setup Rapido

### 1. Installa le dipendenze
```bash
npm install
```

### 2. Configura Firebase

1. Vai su [Firebase Console](https://console.firebase.google.com)
2. **Crea un nuovo progetto** (es. "magazzino-av")
3. **Aggiungi un'app Web** → copia le credenziali
4. Incolla le credenziali in `src/firebase.js`

Nel Firebase Console abilita anche:
- **Firestore Database** → "Avvia in modalità test" (poi configura le regole)
- **Authentication** → Email/Password → Abilita

### 3. Regole Firestore (incolla nella console Firebase)
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

### 4. Avvia in sviluppo
```bash
npm run dev
```
Apri `http://localhost:5173` nel browser.

### 5. Build per produzione (per hostare online)
```bash
npm run build
```
Puoi deployare su **Firebase Hosting**, **Vercel**, o **Netlify** gratuitamente.

---

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
