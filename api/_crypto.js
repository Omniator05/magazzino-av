// Cifratura a riposo per il refresh token Google (teamSecrets/{teamId}) —
// difesa in più oltre alle regole Firestore (che già negano l'accesso a
// qualunque client, vedi firestore.rules): anche in caso di regole
// configurate male in futuro, o di credenziali del service account finite
// nelle mani sbagliate, il token resta illeggibile senza questa chiave, che
// vive solo come env var su Vercel — mai in Firestore, mai nel bundle client.
//
// AES-256-GCM col modulo crypto nativo di Node: nessuna nuova dipendenza.
// GOOGLE_TOKEN_ENC_KEY è una stringa base64 di 32 byte (es. generata con
// `openssl rand -base64 32`).
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey() {
  const raw = process.env.GOOGLE_TOKEN_ENC_KEY
  if (!raw) throw new Error('GOOGLE_TOKEN_ENC_KEY non configurata')
  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) throw new Error('GOOGLE_TOKEN_ENC_KEY deve essere 32 byte in base64')
  return key
}

// Ritorna una stringa singola "iv:tag:ciphertext" (tutto base64) — comoda da
// salvare in un solo campo Firestore invece di tre.
export function encrypt(plainText) {
  const key = getKey()
  const iv = crypto.randomBytes(12) // 96 bit, raccomandato per GCM
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${ciphertext.toString('base64')}`
}

export function decrypt(payload) {
  const key = getKey()
  const [ivB64, tagB64, dataB64] = String(payload).split(':')
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Payload cifrato malformato')
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  const plainText = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()])
  return plainText.toString('utf8')
}

// "state" firmato per il giro di redirect OAuth: google-oauth-start.js lo
// genera (autenticato, sa già chi è l'admin/la squadra), il browser lo porta
// a Google e poi a google-oauth-callback.js — che NON riceve nessun header
// di autenticazione (è un semplice redirect GET), quindi deve poter
// verificare "questo state è davvero il nostro, non manomesso" solo dalla
// firma. Riusa la stessa chiave della cifratura: un solo segreto da
// configurare, scopo diverso (qui firma HMAC, non cifratura).
const STATE_MAX_AGE_MS = 10 * 60 * 1000 // 10 minuti: oltre, il codice va rifatto da capo

export function signState(payloadObj) {
  const key = getKey()
  const json = JSON.stringify({ ...payloadObj, ts: Date.now() })
  const body = Buffer.from(json, 'utf8').toString('base64url')
  const sig = crypto.createHmac('sha256', key).update(body).digest('base64url')
  return `${body}.${sig}`
}

// Torna il payload originale se la firma è valida e non scaduta, altrimenti null.
export function verifyState(state) {
  try {
    const key = getKey()
    const [body, sig] = String(state).split('.')
    if (!body || !sig) return null
    const expected = crypto.createHmac('sha256', key).update(body).digest('base64url')
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!payload.ts || Date.now() - payload.ts > STATE_MAX_AGE_MS) return null
    return payload
  } catch {
    return null
  }
}
