import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { isModuleEnabled } from '../utils/modules'
import { getCodeDisplay } from '../utils/codeDisplay'
import PageHeader from '../components/PageHeader'

function Switch({ enabled, onClick, disabled, label }) {
  return (
    <button
      role="switch"
      aria-checked={enabled}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="btn-no-anim pref-switch"
      data-on={enabled ? 'true' : 'false'}
    >
      <span />
    </button>
  )
}

// Esempi disegnati dei tre formati: si sceglie guardando com'è l'etichetta, non leggendo una descrizione.
const QR_ON = [0,1,2,4,5,6,7,13,14,16,18,20,21,24,26,28,30,35,42,43,44,46,47,48,9,11,33,39]
function SampleQr() {
  return (
    <div aria-hidden="true" style={{ display:'grid', gridTemplateColumns:'repeat(7, 6px)', gap:2 }}>
      {Array.from({ length: 49 }, (_, i) => <span key={i} style={{ width:6, height:6, borderRadius:1.5, background:'#1a1a1a', opacity: QR_ON.includes(i) ? 1 : 0.1 }} />)}
    </div>
  )
}
function SampleBarcode() {
  return (
    <div aria-hidden="true" style={{ display:'flex', alignItems:'stretch', gap:2, height:42 }}>
      {[3,1,2,1,3,2,1,1,3,1,2,3,1,2,1,3,2,1].map((w, i) => <span key={i} style={{ width:w, background:'#1a1a1a', opacity: i % 2 === 0 ? 1 : 0 }} />)}
    </div>
  )
}

const FORMATS = ['qr', 'barcode', 'both']

// Sotto-pagina "Preferenze" di Impostazioni — comportamenti dell'app
// configurabili per squadra (moduli attivabili, formato dei codici...).
export default function SettingsModules() {
  const { t } = useTranslation()
  const { team, updateTeamData } = useAuth()
  const [saving, setSaving] = useState(null)
  const [toast, setToast] = useState('')
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 4000) }

  const workHoursEnabled = isModuleEnabled(team, 'workHours')
  const toggleModule = async (key) => {
    const enabled = isModuleEnabled(team, key)
    setSaving(key)
    try {
      await updateTeamData({ modules: { ...(team?.modules || {}), [key]: !enabled } })
      showToast(enabled ? t('adminUsers.moduleDisabledToast') : t('adminUsers.moduleEnabledToast'))
    } finally { setSaving(null) }
  }

  const codeDisplay = getCodeDisplay(team)
  const [savingCode, setSavingCode] = useState(false)
  const setCodeDisplay = async (value) => {
    if (value === codeDisplay) return
    setSavingCode(true)
    try { await updateTeamData({ codeDisplay: value }) } finally { setSavingCode(false) }
  }
  const FORMAT_LABEL = { qr: t('adminUsers.codeDisplayQr'), barcode: t('adminUsers.codeDisplayBarcode'), both: t('adminUsers.codeDisplayBoth') }
  const FORMAT_HINT = { qr: t('adminUsers.prefsHintQr'), barcode: t('adminUsers.prefsHintBarcode'), both: t('adminUsers.prefsHintBoth') }

  return (
    <div className="page">
      {toast && (
        <div role="status" style={{ position:'fixed', top:16, left:'50%', transform:'translateX(-50%)', background:'var(--card)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 20px', zIndex:999, fontSize:14, fontWeight:600, boxShadow:'0 8px 24px rgba(0,0,0,0.12)' }}>
          {toast}
        </div>
      )}

      <PageHeader title={t('adminUsers.modulesTitle')} backTo="/admin/settings" />

      <div className="pref-body">
        <p className="pref-intro">{t('adminUsers.modulesPageDesc')}</p>

        <h2 className="pref-h">{t('adminUsers.prefsFeaturesSection')}</h2>
        <div className="pref-group">
          <div className="pref-row">
            <div style={{ flex:1, minWidth:0 }}>
              <p className="pref-title">{t('workHours.moduleTitle')}</p>
              <p className="pref-desc">{t('workHours.moduleDesc')}</p>
            </div>
            <Switch
              enabled={workHoursEnabled}
              disabled={saving === 'workHours'}
              onClick={() => toggleModule('workHours')}
              label={`${t('workHours.moduleTitle')}: ${workHoursEnabled ? t('adminUsers.statusEnabled') : t('adminUsers.statusDisabled')}`}
            />
          </div>
        </div>

        <h2 className="pref-h">{t('adminUsers.prefsLabelsSection')}</h2>
        <div className="pref-group" style={{ padding:'18px 18px 16px' }}>
          <p className="pref-title" id="pref-code-q">{t('adminUsers.prefsLabelsQuestion')}</p>
          <p className="pref-desc" style={{ marginBottom:14 }}>{t('adminUsers.codeDisplayDesc')}</p>
          <div role="radiogroup" aria-labelledby="pref-code-q" className="pref-choices" style={{ opacity: savingCode ? 0.65 : 1 }}>
            {FORMATS.map(f => {
              const on = codeDisplay === f
              return (
                <button key={f} type="button" role="radio" aria-checked={on} disabled={savingCode} onClick={() => setCodeDisplay(f)}
                  className={`pref-choice btn-no-anim${on ? ' on' : ''}`}>
                  <span className="pref-choice-sample">
                    {(f === 'qr' || f === 'both') && <SampleQr />}
                    {(f === 'barcode' || f === 'both') && <SampleBarcode />}
                  </span>
                  <span className="pref-choice-text">
                    <span className="pref-choice-name">{FORMAT_LABEL[f]}</span>
                    <span className="pref-choice-hint">{FORMAT_HINT[f]}</span>
                  </span>
                  <span className="pref-choice-check" aria-hidden="true">
                    <svg viewBox="0 0 16 16" width="12" height="12"><path d="M3.5 8.5l3 3 6-6.5" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <style>{`
        .pref-body { padding: 0 16px 40px; }
        .pref-intro { color: var(--text2); font-size: 13.5px; line-height: 1.5; margin: 16px 2px 0; }
        .pref-h { margin: 28px 2px 10px; font-size: 15px; font-weight: 800; letter-spacing: -0.2px; color: var(--text); }
        .pref-group { background: var(--card); border: 1px solid var(--border); border-radius: 18px; overflow: hidden; }
        .pref-row { display: flex; align-items: center; gap: 16px; padding: 16px 18px; }
        .pref-title { font-size: 15px; font-weight: 700; color: var(--text); }
        .pref-desc { font-size: 13px; line-height: 1.5; color: var(--text2); margin-top: 3px; max-width: 62ch; }
        .pref-switch {
          width: 52px; height: 32px; border-radius: 16px; flex-shrink: 0; position: relative;
          background: var(--c-fill2, #d9d6cf); transition: background .2s ease;
        }
        .pref-switch[data-on="true"] { background: var(--accent); }
        .pref-switch span {
          position: absolute; top: 3px; left: 3px; width: 26px; height: 26px; border-radius: 50%; background: #fff;
          box-shadow: 0 1px 4px rgba(0,0,0,0.28); transition: transform .2s cubic-bezier(0.34,1.4,0.64,1);
        }
        .pref-switch[data-on="true"] span { transform: translateX(20px); }
        .pref-switch:focus-visible, .pref-choice:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        .pref-choices { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
        .pref-choice {
          position: relative; display: flex; flex-direction: column; gap: 12px; text-align: left; padding: 12px;
          background: var(--c-surface, var(--card)); border: 1.5px solid var(--border); border-radius: 14px; color: var(--text);
          transition: border-color .15s ease, background .15s ease;
        }
        @media (hover: hover) { .pref-choice:not(.on):hover { border-color: var(--c-ink3, var(--text2)); } }
        .pref-choice.on { border-color: var(--accent); background: rgba(230,57,70,0.06); }
        .pref-choice-sample { display: flex; align-items: center; justify-content: center; gap: 12px; min-height: 84px; padding: 10px; border-radius: 10px; background: #fff; border: 1px solid rgba(0,0,0,0.07); }
        .pref-choice-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .pref-choice-name { font-size: 14px; font-weight: 800; }
        .pref-choice-hint { font-size: 12px; line-height: 1.4; color: var(--text2); }
        .pref-choice-check {
          position: absolute; top: 10px; right: 10px; width: 22px; height: 22px; border-radius: 50%; background: var(--accent);
          display: flex; align-items: center; justify-content: center; opacity: 0; transform: scale(.6); transition: opacity .15s ease, transform .2s cubic-bezier(0.34,1.4,0.64,1);
        }
        .pref-choice.on .pref-choice-check { opacity: 1; transform: none; }
        @media (max-width: 620px) {
          .pref-choices { grid-template-columns: 1fr; }
          .pref-choice { flex-direction: row; align-items: center; }
          .pref-choice-sample { flex: 0 0 112px; min-height: 72px; }
          .pref-choice-check { top: 50%; margin-top: -11px; }
          .pref-choice-text { padding-right: 30px; }
        }
        @media (prefers-reduced-motion: reduce) { .pref-switch span, .pref-choice-check, .pref-choice { transition: none; } }
      `}</style>
    </div>
  )
}
