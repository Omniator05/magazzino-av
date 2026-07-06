import ical from 'node-ical'
import admin from 'firebase-admin'

// Finestra di sincronizzazione: eventi passati/futuri fuori da questo range vengono ignorati
// (e rimossi se erano stati sincronizzati in precedenza) per non far crescere la collezione all'infinito.
const WINDOW_PAST_DAYS = 30
const WINDOW_FUTURE_DAYS = 180
const BATCH_CHUNK_SIZE = 400

function getAdminDb() {
  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  }
  return admin.firestore()
}

function toYMD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function sanitizeDocId(uid) {
  return uid.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 400)
}

// Espande un evento (singolo o ricorrente) nelle occorrenze che cadono nella finestra di sync
function expandEvent(ev, windowStart, windowEnd) {
  const allDay = !!ev.start?.dateOnly
  const durationMs = ev.end && ev.start ? ev.end.getTime() - ev.start.getTime() : 0
  const occurrences = []

  if (ev.rrule) {
    const exdateKeys = new Set(Object.keys(ev.exdate || {}).map(k => k.slice(0, 10)))
    const overrides = ev.recurrences || {}
    const dates = ev.rrule.between(windowStart, windowEnd, true)
    for (const d of dates) {
      const isoKey = d.toISOString().slice(0, 10)
      if (exdateKeys.has(isoKey)) continue
      const overrideKey = Object.keys(overrides).find(k => k.startsWith(isoKey))
      const occ = overrideKey ? overrides[overrideKey] : null
      const start = occ?.start || d
      const end = occ?.end || new Date(d.getTime() + durationMs)
      occurrences.push({
        uid: `${ev.uid}_${isoKey}`,
        title: String(occ?.summary || ev.summary || 'Evento'),
        date: toYMD(start),
        dateEnd: allDay && end > start ? toYMD(new Date(end.getTime() - 86400000)) : null,
        allDay,
      })
    }
  } else if (ev.start && ev.start >= windowStart && ev.start <= windowEnd) {
    occurrences.push({
      uid: ev.uid,
      title: String(ev.summary || 'Evento'),
      date: toYMD(ev.start),
      dateEnd: allDay && ev.end && ev.end > ev.start ? toYMD(new Date(ev.end.getTime() - 86400000)) : null,
      allDay,
    })
  }
  return occurrences
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const icalUrl = process.env.GOOGLE_CALENDAR_ICAL_URL
  if (!icalUrl) return res.status(500).json({ error: 'GOOGLE_CALENDAR_ICAL_URL non configurato' })

  let data
  try {
    data = await ical.async.fromURL(icalUrl)
  } catch (e) {
    return res.status(502).json({ error: 'Impossibile scaricare il calendario Google', detail: String(e) })
  }

  const now = new Date()
  const windowStart = new Date(now); windowStart.setDate(windowStart.getDate() - WINDOW_PAST_DAYS)
  const windowEnd = new Date(now); windowEnd.setDate(windowEnd.getDate() + WINDOW_FUTURE_DAYS)

  const occurrences = []
  for (const key in data) {
    const ev = data[key]
    if (ev.type !== 'VEVENT') continue
    occurrences.push(...expandEvent(ev, windowStart, windowEnd))
  }

  const db = getAdminDb()
  const seenIds = new Set()
  const writes = occurrences.map(occ => {
    const docId = sanitizeDocId(occ.uid)
    seenIds.add(docId)
    return { ref: db.collection('googleCalendarEvents').doc(docId), data: {
      googleEventId: occ.uid,
      title: occ.title,
      date: occ.date,
      dateEnd: occ.dateEnd,
      allDay: occ.allDay,
      syncedAt: admin.firestore.FieldValue.serverTimestamp(),
    } }
  })

  const existing = await db.collection('googleCalendarEvents').get()
  const deletes = existing.docs.filter(d => !seenIds.has(d.id)).map(d => d.ref)

  const ops = [
    ...writes.map(w => ({ type: 'set', ref: w.ref, data: w.data })),
    ...deletes.map(ref => ({ type: 'delete', ref })),
  ]
  for (let i = 0; i < ops.length; i += BATCH_CHUNK_SIZE) {
    const batch = db.batch()
    for (const op of ops.slice(i, i + BATCH_CHUNK_SIZE)) {
      if (op.type === 'set') batch.set(op.ref, op.data)
      else batch.delete(op.ref)
    }
    await batch.commit()
  }

  res.status(200).json({ synced: writes.length, removed: deletes.length })
}
