import { useTranslation } from 'react-i18next'

// Tipo di un'assenza (unavailability.type) — scelto esplicitamente da chi la
// segnala (worker o admin, stesso form), non dedotto da chi la crea: un
// worker può segnalare anche una malattia, un admin può segnalare ferie per
// conto di qualcuno. Solo "ferie" conta nel monte giorni annuale (vedi
// SettingsUsers.jsx). Le assenze create prima dell'introduzione di questo
// campo non hanno `type`: le trattiamo come "altro" ovunque — non contano
// come ferie, nessuna migrazione necessaria.
export const ABSENCE_TYPES = {
  ferie:    { color: 'var(--green)', bg: 'rgba(52,211,153,0.12)',  labelKey: 'calendar.absenceTypeFerie' },
  malattia: { color: 'var(--red)',   bg: 'rgba(248,113,113,0.12)', labelKey: 'calendar.absenceTypeMalattia' },
  altro:    { color: 'var(--text2)', bg: 'var(--card2)',           labelKey: 'calendar.absenceTypeAltro' },
}

// Opzioni per il SegmentedControl nel form di segnalazione assenza.
export function absenceTypeOptions(t) {
  return Object.entries(ABSENCE_TYPES).map(([value, cfg]) => ({ value, label: t(cfg.labelKey) }))
}

export default function AbsenceTypeBadge({ type }) {
  const { t } = useTranslation()
  const cfg = ABSENCE_TYPES[type] || ABSENCE_TYPES.altro
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', flexShrink:0,
      background:cfg.bg, color:cfg.color, borderRadius:6, padding:'2px 7px',
      fontSize:10.5, fontWeight:800, textTransform:'uppercase', letterSpacing:'0.3px',
    }}>
      {t(cfg.labelKey)}
    </span>
  )
}
