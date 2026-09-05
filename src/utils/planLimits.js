import { isBillingValid } from './billing'

// Versione gratuita: non più un blocco totale dell'app dopo la prova (quello
// resta solo per pagamento fallito, vedi isProPlan sotto + App.jsx), ma un
// piano limitato e utilizzabile a tempo indeterminato. Numeri decisi col
// cliente (2026-08-31).
export const FREE_LIMITS = {
  itemsPerList: 20,   // oggetti per lista di carico
  itemsInWarehouse: 50, // oggetti totali in magazzino (kit inclusi, sono anche loro un doc 'items')
  admins: 1,
  workers: 3,
}

// "Pro" = abbonamento valido (prova in corso, attivo, o esente). Qualunque
// altro stato — prova scaduta, cancellato — opera nella versione gratuita
// con i limiti sopra invece di bloccare tutto: il blocco totale (BillingGate)
// resta riservato al solo pagamento fallito (past_due), vedi App.jsx.
export function isProPlan(team) {
  return isBillingValid(team)
}

// Popup mostrato ovunque si tocchi un limite del piano gratuito — stesso
// dialog di conferma già usato in tutta l'app (useConfirm), riusato come
// avviso: solo l'admin vede il bottone "Passa a Pro" (naviga alla
// fatturazione), un magazziniere/organizzatore vede solo un avviso da
// chiudere — non ha senso mandarlo su una pagina admin a cui non accede.
export async function promptLimitReached({ confirm, navigate, isAdmin, t, message }) {
  if (!isAdmin) {
    await confirm({ title: t('planLimits.limitTitle'), message, confirmLabel: t('common.gotIt') })
    return
  }
  const proceed = await confirm({
    title: t('planLimits.limitTitle'), message,
    confirmLabel: t('planLimits.upgradeButton'), cancelLabel: t('common.gotIt'),
  })
  if (proceed) navigate('/admin/settings/billing')
}
