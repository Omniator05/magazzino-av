import { useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useConfirm } from '../context/ConfirmProvider'

// Guardia per le colonne/fogli con un modulo (Inventory): se non è stato toccato nulla si chiude subito (anche
// con un clic fuori); se c'è qualcosa di modificato compare "Salvare le modifiche?" con tre strade — Salva (preme
// il pulsante principale della colonna, quindi con le sue stesse regole e controlli), Non salvare (chiude) e,
// toccando fuori dal popup o con Esc, si resta a modificare.
//
//   const g = useUnsavedGuard(() => showModal && JSON.stringify(form) !== baseline.current)
//   const drag = useModalDrag(() => setShowModal(false), g.guard)
//   g.attach(drag)
//   <SaveButton onDone={() => { g.skip(); drag.close() }} />   // dopo un salvataggio non si richiede
//
// `isDirty` si legge al momento del tentativo di chiudere, non a ogni render.
const SAVE_BUTTON = '.rc-drawer .rc-drawer-foot .btn-primary'

export function useUnsavedGuard(isDirty) {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const dirtyRef = useRef(isDirty)
  dirtyRef.current = isDirty
  const dragRef = useRef(null)
  const skipRef = useRef(false)
  const askingRef = useRef(false)

  const ask = useCallback(async () => {
    if (askingRef.current) return
    askingRef.current = true
    const r = await confirm({
      title: t('drawer.unsavedTitle'),
      message: t('drawer.unsavedMessage'),
      confirmLabel: t('drawer.save'),
      cancelLabel: t('drawer.discard'),
      cancelValue: 'discard',
    })
    askingRef.current = false
    if (r === true) document.querySelector(SAVE_BUTTON)?.click()      // salva (e se va a buon fine chiude da sé)
    else if (r === 'discard') { skipRef.current = true; dragRef.current?.close() }
  }, [confirm, t])

  const guard = useCallback(() => {
    if (skipRef.current) { skipRef.current = false; return true }
    if (!dirtyRef.current()) return true
    ask()
    return false
  }, [ask])

  return {
    guard,
    attach: drag => { dragRef.current = drag },
    skip: () => { skipRef.current = true },        // il prossimo tentativo di chiusura passa senza chiedere
  }
}
