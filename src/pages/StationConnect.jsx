import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { detectDeviceLanguage } from '../i18n'
import { fetchStationInfo, connectStation } from '../utils/stationLink'
import { applyTheme, watchSystemTheme } from '../utils/theme'

// Pagina di collegamento della Postazione magazzino (/postazione/<chiave>, vedi api/_station.js): si apre
// dal foglio stampato (QR o link). Chiede conferma prima di collegare, così una scansione fatta per caso
// non butta fuori nessuno. Montata da main.jsx fuori da App, come la pagina ospite.
export default function StationConnect({ token }) {
  const { t, i18n } = useTranslation()
  const [state, setState] = useState({ loading: true })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    applyTheme('auto')
    const stop = watchSystemTheme()
    const dl = detectDeviceLanguage()
    if (dl !== 'it') i18n.changeLanguage(dl)
    return stop
  }, [i18n])

  useEffect(() => {
    let live = true
    fetchStationInfo(token)
      .then(r => { if (live) setState({ teamName: r.teamName }) })
      .catch(e => { if (live) setState({ error: e.code === 'paid-only' ? 'paid-only' : e.code === 'invalid' ? 'invalid' : 'error' }) })
    return () => { live = false }
  }, [token])

  const connect = async () => {
    setBusy(true); setError('')
    try {
      await connectStation(token)
      window.location.replace('/')
    } catch (e) {
      setError(e.code === 'invalid' ? t('station.connectInvalid') : t('station.connectError'))
      setBusy(false)
    }
  }

  const card = { width: '100%', maxWidth: 400, background: 'var(--c-surface)', border: '1px solid var(--c-line)', borderRadius: 20, padding: '28px 24px', textAlign: 'center', boxShadow: '0 10px 34px rgba(0,0,0,0.08)' }
  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--c-sheet, var(--bg))', color: 'var(--c-ink)' }}>
      <div style={card}>
        {state.loading ? (
          <p style={{ margin: 0, color: 'var(--c-ink3)' }}>{t('station.connectLoading')}</p>
        ) : state.error ? (
          <>
            <h1 style={{ margin: '0 0 8px', fontSize: 20 }}>{t('station.connectBadTitle')}</h1>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--c-ink2)' }}>
              {state.error === 'paid-only' ? t('station.paidOnly') : state.error === 'invalid' ? t('station.connectInvalid') : t('station.connectError')}
            </p>
          </>
        ) : (
          <>
            <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--c-ink3)' }}>{t('station.title')}</p>
            <h1 style={{ margin: '0 0 10px', fontSize: 24, letterSpacing: '-0.4px' }}>{state.teamName || t('station.title')}</h1>
            <p style={{ margin: '0 0 22px', fontSize: 14, lineHeight: 1.55, color: 'var(--c-ink2)' }}>{t('station.connectText')}</p>
            {error && <p role="alert" style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#e63946' }}>{error}</p>}
            <button type="button" onClick={connect} disabled={busy} className="btn btn-primary btn-full" style={{ minHeight: 52, fontSize: 16 }}>
              {busy ? t('station.connecting') : t('station.connectButton')}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
