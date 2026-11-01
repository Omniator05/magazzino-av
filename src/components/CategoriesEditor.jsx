import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { collection, query, where, onSnapshot, writeBatch, doc } from 'firebase/firestore'
import { db } from '../firebase'
import { useAuth } from '../context/AuthContext'
import { useConfirm } from '../context/ConfirmProvider'
import {
  DEFAULT_CATEGORIES, FALLBACK_CATEGORY, FALLBACK_ICON, CONSUMABLE_CATEGORY, ICON_CHOICES,
  MAX_CATEGORY_NAME, MAX_CATEGORIES, getTeamCategories, isCustomized, isNameTaken,
} from '../utils/categories'

const Chevron = ({ up }) => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" style={{ transform: up ? 'none' : 'rotate(180deg)' }}>
    <path d="M3.5 10.5 8 6l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const Cross = () => (
  <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
    <path d="m4 4 8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
)

// Sposta su "Altro" gli oggetti delle categorie tolte (a gruppi, un batch ne regge 500).
async function moveItemsToFallback(items, removedNames) {
  const ids = items.filter(i => removedNames.includes(i.category)).map(i => i.id)
  for (let n = 0; n < ids.length; n += 400) {
    const batch = writeBatch(db)
    ids.slice(n, n + 400).forEach(id => batch.update(doc(db, 'items', id), { category: FALLBACK_CATEGORY }))
    await batch.commit()
  }
}

// Gestione delle categorie del magazzino, per squadra (sezione di Preferenze).
// Si aggiungono, si riordinano, si cambia l'icona, si tolgono; "Altro" resta sempre in fondo e
// "Consumabili" non si toglie perché guida scorta minima e unità di misura.
export default function CategoriesEditor({ onNotify }) {
  const { t } = useTranslation()
  const { team, teamId, updateTeamData } = useAuth()
  const confirm = useConfirm()
  const list = useMemo(() => getTeamCategories(team), [team?.categories])
  const customized = isCustomized(team)

  const [items, setItems] = useState([])
  useEffect(() => {
    if (!teamId) return
    return onSnapshot(query(collection(db, 'items'), where('teamId', '==', teamId)), snap => {
      setItems(snap.docs.map(d => ({ id: d.id, category: d.data().category })))
    }, () => {})
  }, [teamId])
  const counts = useMemo(() => {
    const known = new Set(list.map(c => c.name))
    const map = {}
    items.forEach(i => {
      const key = known.has(i.category) ? i.category : FALLBACK_CATEGORY
      map[key] = (map[key] || 0) + 1
    })
    return map
  }, [items, list])

  const [busy, setBusy] = useState(false)
  const [pickerFor, setPickerFor] = useState(null)   // indice della riga con le icone aperte, 'new' per la nuova
  const [newName, setNewName] = useState('')
  const [newIcon, setNewIcon] = useState(FALLBACK_ICON)
  const [error, setError] = useState('')

  const persist = async (next, message) => {
    setBusy(true)
    try {
      await updateTeamData({ categories: next })
      if (message) onNotify?.(message)
      return true
    } catch {
      onNotify?.(t('categoriesEditor.saveError'))
      return false
    } finally { setBusy(false) }
  }

  const move = (i, dir) => {
    const j = i + dir
    if (j < 0 || j >= list.length) return
    const next = list.slice()
    ;[next[i], next[j]] = [next[j], next[i]]
    persist(next)
  }
  const setIcon = (i, icon) => {
    setPickerFor(null)
    if (list[i].icon === icon) return
    persist(list.map((c, k) => (k === i ? { ...c, icon } : c)))
  }

  const add = async () => {
    const name = newName.trim().replace(/\s+/g, ' ')
    if (!name) return
    if (isNameTaken(list, name)) { setError(t('categoriesEditor.errTaken')); return }
    if (list.length >= MAX_CATEGORIES) { setError(t('categoriesEditor.errMax', { max: MAX_CATEGORIES })); return }
    setError('')
    const saved = await persist([...list, { name, icon: newIcon }], t('categoriesEditor.addedToast', { name }))
    if (saved) { setNewName(''); setNewIcon(FALLBACK_ICON); setPickerFor(null) }
  }

  const remove = async (i) => {
    const cat = list[i]
    const count = counts[cat.name] || 0
    const ok = await confirm({
      title: t('categoriesEditor.removeTitle', { name: cat.name }),
      message: count > 0 ? t('categoriesEditor.removeItems', { count }) : t('categoriesEditor.removeNone'),
      confirmLabel: t('categoriesEditor.remove'),
      danger: true,
    })
    if (!ok) return
    setBusy(true)
    try {
      await moveItemsToFallback(items, [cat.name])
      await updateTeamData({ categories: list.filter((_, k) => k !== i) })
      onNotify?.(t('categoriesEditor.removedToast', { name: cat.name }))
    } catch {
      onNotify?.(t('categoriesEditor.saveError'))
    } finally { setBusy(false) }
  }

  const reset = async () => {
    const defaults = DEFAULT_CATEGORIES.map(c => c.name)
    const dropped = list.map(c => c.name).filter(n => !defaults.includes(n))
    const moved = items.filter(i => dropped.includes(i.category)).length
    const ok = await confirm({
      title: t('categoriesEditor.resetTitle'),
      message: moved > 0 ? t('categoriesEditor.resetItems', { count: moved }) : t('categoriesEditor.resetNone'),
      confirmLabel: t('categoriesEditor.resetConfirm'),
      danger: moved > 0,
    })
    if (!ok) return
    setBusy(true)
    try {
      await moveItemsToFallback(items, dropped)
      await updateTeamData({ categories: [] })
      onNotify?.(t('categoriesEditor.resetToast'))
    } catch {
      onNotify?.(t('categoriesEditor.saveError'))
    } finally { setBusy(false) }
  }

  const picker = (current, onPick) => (
    <div className="cat-picker" role="listbox" aria-label={t('categoriesEditor.pickIcon')}>
      {ICON_CHOICES.map(ic => (
        <button key={ic} type="button" role="option" aria-selected={ic === current} onClick={() => onPick(ic)}
          className={`cat-emoji btn-no-anim${ic === current ? ' on' : ''}`}>{ic}</button>
      ))}
    </div>
  )

  return (
    <>
      <h2 className="pref-h">{t('categoriesEditor.title')}</h2>
      <p className="pref-intro" style={{ margin: '0 2px 12px' }}>{t('categoriesEditor.intro')}</p>

      <div className="pref-group" style={{ opacity: busy ? 0.7 : 1, transition: 'opacity .15s ease' }}>
        {list.map((c, i) => {
          const locked = c.name === CONSUMABLE_CATEGORY
          const n = counts[c.name] || 0
          return (
            <div key={c.name} className="cat-block">
              <div className="cat-row">
                <button type="button" className="cat-icon btn-no-anim" disabled={busy} aria-expanded={pickerFor === i}
                  aria-label={t('categoriesEditor.changeIcon', { name: c.name })}
                  onClick={() => setPickerFor(p => (p === i ? null : i))}>{c.icon}</button>
                <div className="cat-main">
                  <p className="pref-title">{c.name}</p>
                  <p className="pref-desc">
                    {t('categoriesEditor.count', { count: n })}{locked ? ` · ${t('categoriesEditor.consumableHint')}` : ''}
                  </p>
                </div>
                <div className="cat-actions">
                  <button type="button" className="cat-btn btn-no-anim" disabled={busy || i === 0} onClick={() => move(i, -1)}
                    aria-label={t('categoriesEditor.moveUp', { name: c.name })}><Chevron up /></button>
                  <button type="button" className="cat-btn btn-no-anim" disabled={busy || i === list.length - 1} onClick={() => move(i, 1)}
                    aria-label={t('categoriesEditor.moveDown', { name: c.name })}><Chevron /></button>
                  <button type="button" className="cat-btn danger btn-no-anim" disabled={busy || locked} onClick={() => remove(i)}
                    aria-label={t('categoriesEditor.removeAria', { name: c.name })} style={{ visibility: locked ? 'hidden' : 'visible' }}><Cross /></button>
                </div>
              </div>
              {pickerFor === i && picker(c.icon, ic => setIcon(i, ic))}
            </div>
          )
        })}

        <div className="cat-block">
          <div className="cat-row">
            <span className="cat-icon static" aria-hidden="true">{FALLBACK_ICON}</span>
            <div className="cat-main">
              <p className="pref-title">{FALLBACK_CATEGORY}</p>
              <p className="pref-desc">{t('categoriesEditor.count', { count: counts[FALLBACK_CATEGORY] || 0 })} · {t('categoriesEditor.fallbackHint')}</p>
            </div>
          </div>
        </div>

        <form className="cat-add" onSubmit={e => { e.preventDefault(); add() }}>
          <button type="button" className="cat-icon btn-no-anim" disabled={busy} aria-expanded={pickerFor === 'new'}
            aria-label={t('categoriesEditor.pickIcon')} onClick={() => setPickerFor(p => (p === 'new' ? null : 'new'))}>{newIcon}</button>
          <input value={newName} maxLength={MAX_CATEGORY_NAME} disabled={busy}
            onChange={e => { setNewName(e.target.value); if (error) setError('') }}
            placeholder={t('categoriesEditor.newPlaceholder')} aria-label={t('categoriesEditor.newPlaceholder')}
            aria-invalid={!!error} className="cat-input" />
          <button type="submit" className="rc-pill-btn" disabled={busy || !newName.trim()}
            style={{ padding: '10px 16px', fontSize: 14, fontWeight: 700, flexShrink: 0, opacity: newName.trim() ? 1 : 0.45 }}>
            {t('categoriesEditor.add')}
          </button>
        </form>
        {pickerFor === 'new' && picker(newIcon, ic => { setNewIcon(ic); setPickerFor(null) })}
        {error && <p role="alert" className="cat-error">{error}</p>}
      </div>

      <div className="cat-foot">
        <span className="pref-desc" style={{ margin: 0 }}>{customized ? t('categoriesEditor.statusCustom') : t('categoriesEditor.statusDefault')}</span>
        {customized && (
          <button type="button" className="cat-reset btn-no-anim" disabled={busy} onClick={reset}>{t('categoriesEditor.reset')}</button>
        )}
      </div>

      <style>{`
        .cat-block + .cat-block, .cat-block + .cat-add { border-top: 1px solid var(--border); }
        .cat-row { display: flex; align-items: center; gap: 12px; padding: 10px 12px 10px 14px; }
        .cat-main { flex: 1; min-width: 0; }
        .cat-main .pref-title { font-size: 14.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .cat-main .pref-desc { font-size: 12.5px; margin-top: 1px; }
        .cat-icon {
          width: 44px; height: 44px; flex-shrink: 0; border-radius: 12px; font-size: 22px; line-height: 1;
          display: flex; align-items: center; justify-content: center;
          background: var(--card2, var(--bg)); border: 1px solid var(--border);
        }
        .cat-icon.static { opacity: .7; }
        .cat-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
        .cat-btn {
          width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center;
          background: transparent; color: var(--text2); transition: background .15s ease, color .15s ease, opacity .15s ease;
        }
        .cat-btn:disabled { opacity: .3; }
        @media (hover: hover) {
          .cat-btn:not(:disabled):hover { background: var(--card2, var(--bg)); color: var(--text); }
          .cat-btn.danger:not(:disabled):hover { color: var(--accent); }
        }
        .cat-picker { display: grid; grid-template-columns: repeat(auto-fill, minmax(44px, 1fr)); gap: 6px; padding: 4px 14px 14px; }
        .cat-emoji { height: 44px; border-radius: 10px; font-size: 22px; background: transparent; border: 1px solid transparent; }
        .cat-emoji.on { background: rgba(230,57,70,0.08); border-color: var(--accent); }
        @media (hover: hover) { .cat-emoji:not(.on):hover { background: var(--card2, var(--bg)); } }
        .cat-add { display: flex; align-items: center; gap: 10px; padding: 12px 12px 12px 14px; }
        .cat-input {
          flex: 1; min-width: 0; height: 44px; padding: 0 14px; font-size: 15px; border-radius: 12px;
          background: var(--card2, var(--bg)); border: 1px solid var(--border); color: var(--text);
        }
        .cat-input[aria-invalid="true"] { border-color: var(--accent); }
        .cat-error { color: var(--accent); font-size: 13px; font-weight: 600; padding: 0 16px 12px; }
        .cat-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin: 12px 4px 0; }
        .cat-reset { background: transparent; color: var(--accent); font-size: 13.5px; font-weight: 700; padding: 8px 4px; min-height: 40px; }
        .cat-icon:focus-visible, .cat-btn:focus-visible, .cat-emoji:focus-visible, .cat-reset:focus-visible, .cat-input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { .cat-btn { transition: none; } }
      `}</style>
    </>
  )
}
