import { useState } from 'react'
import { Check } from './Icon'

// Bottone elimina: bidone con coperchio che si apre in hover (invariato,
// vedi .delete-btn in index.css). Due modalità:
//  - `onClick` (sincrono, storico): cancella e basta, nessun riscontro —
//    ancora supportato per non dover aggiornare ogni chiamante in un colpo solo.
//  - `onDelete` (nuovo, asincrono): stesso linguaggio di SaveButton — spinner
//    mentre si aspetta la conferma del server, spunta verde alla riuscita,
//    poi `onDone` (di solito il chiamante avvia lì la dissolvenza della riga,
//    invece di farla sparire di scatto). Contratto di `onDelete` identico a
//    `onSave` di SaveButton: risolve a `true` se ha davvero cancellato,
//    a qualunque altra cosa se si è fermato prima (conferma rifiutata),
//    lancia se il server ha rifiutato per davvero.
export default function DeleteButton({ onClick, onDelete, onDone, onError, size = 36, ariaLabel }) {
  const [state, setState] = useState('idle') // idle | deleting | done

  const handleClick = async (e) => {
    if (!onDelete) { onClick?.(e); return }
    if (state !== 'idle') return
    setState('deleting')
    try {
      const ok = await onDelete(e)
      if (ok !== true) { setState('idle'); return }
      setState('done')
      setTimeout(() => onDone?.(), 550)
    } catch {
      setState('idle')
      onError?.()
    }
  }

  return (
    <button
      onClick={handleClick}
      className="delete-btn"
      aria-label={ariaLabel}
      disabled={onDelete ? state !== 'idle' : false}
      style={{ width: size, height: size }}
    >
      {state === 'deleting' ? (
        <span className="delete-btn-spinner" />
      ) : state === 'done' ? (
        <span className="delete-btn-check"><Check size={Math.round(size * 0.44)} /></span>
      ) : (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 69 14" className="delete-bin-top">
            <g clipPath="url(#dbt)">
              <path fill="currentColor" d="M20.8232 2.62734L19.9948 4.21304C19.8224 4.54309 19.4808 4.75 19.1085 4.75H4.92857C2.20246 4.75 0 6.87266 0 9.5C0 12.1273 2.20246 14.25 4.92857 14.25H64.0714C66.7975 14.25 69 12.1273 69 9.5C69 6.87266 66.7975 4.75 64.0714 4.75H49.8915C49.5192 4.75 49.1776 4.54309 49.0052 4.21305L48.1768 2.62734C47.3451 1.00938 45.6355 0 43.7719 0H25.2281C23.3645 0 21.6549 1.00938 20.8232 2.62734ZM64.0023 20.0648C64.0397 19.4882 63.5822 19 63.0044 19H5.99556C5.4178 19 4.96025 19.4882 4.99766 20.0648L8.19375 69.3203C8.44018 73.0758 11.6746 76 15.5712 76H53.4288C57.3254 76 60.5598 73.0758 60.8062 69.3203L64.0023 20.0648Z"/>
            </g>
            <defs><clipPath id="dbt"><rect fill="white" height="14" width="69"/></clipPath></defs>
          </svg>
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 69 57" className="delete-bin-bottom">
            <g clipPath="url(#dbb)">
              <path fill="currentColor" d="M20.8232 -16.3727L19.9948 -14.787C19.8224 -14.4569 19.4808 -14.25 19.1085 -14.25H4.92857C2.20246 -14.25 0 -12.1273 0 -9.5C0 -6.8727 2.20246 -4.75 4.92857 -4.75H64.0714C66.7975 -4.75 69 -6.8727 69 -9.5C69 -12.1273 66.7975 -14.25 64.0714 -14.25H49.8915C49.5192 -14.25 49.1776 -14.4569 49.0052 -14.787L48.1768 -16.3727C47.3451 -17.9906 45.6355 -19 43.7719 -19H25.2281C23.3645 -19 21.6549 -17.9906 20.8232 -16.3727ZM64.0023 1.0648C64.0397 0.4882 63.5822 0 63.0044 0H5.99556C5.4178 0 4.96025 0.4882 4.99766 1.0648L8.19375 50.3203C8.44018 54.0758 11.6746 57 15.5712 57H53.4288C57.3254 57 60.5598 54.0758 60.8062 50.3203L64.0023 1.0648Z"/>
            </g>
            <defs><clipPath id="dbb"><rect fill="white" height="57" width="69"/></clipPath></defs>
          </svg>
        </>
      )}
    </button>
  )
}
