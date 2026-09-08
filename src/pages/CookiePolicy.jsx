import LegalPageLayout, { LegalH2, LegalP, LegalList, LegalCallout } from '../components/LegalPageLayout'

const SUPPORT_EMAIL = 'appmagazzinoav@gmail.com'

// Questa pagina descrive lo stato REALE del codice, non un obiettivo: nessun
// analytics/tracking (verificato: nessuna dipendenza del genere in
// package.json), sessione via Firebase Auth (IndexedDB/localStorage, non
// cookie), e lo script Google Identity ora caricato solo on-demand da
// utils/googleCalendar.js quando un admin collega davvero Google Calendar
// (vedi loadGoogleIdentityScript) — non più in ogni pagina come prima. Se in
// futuro si aggiunge un vero tracciamento/analytics, questa pagina E la
// mancanza di un banner cookie vanno riviste insieme.
export default function CookiePolicy() {
  return (
    <LegalPageLayout title="Cookie Policy" updatedAt="8 settembre 2026">
      <LegalP>
        Questa pagina spiega quali cookie e tecnologie simili (es. localStorage, IndexedDB) utilizza
        Roadcase (il "Servizio") e perché.
      </LegalP>

      <LegalH2>1. Cosa usiamo direttamente</LegalH2>
      <LegalP>
        Roadcase non installa cookie di profilazione, pubblicitari o di analisi statistica di terze
        parti. Per far funzionare l'accesso utilizziamo Firebase Authentication, che salva la sessione
        di login nel browser tramite <strong>IndexedDB/localStorage</strong> (non cookie in senso stretto)
        — dati tecnicamente necessari al funzionamento stesso del Servizio (rimanere collegati tra una
        pagina e l'altra), per cui non richiedono consenso ai sensi dell'art. 122 del Codice Privacy
        (categoria dei cookie/tecnologie "strettamente necessari").
      </LegalP>

      <LegalH2>2. Servizi di terze parti che potrebbero impostarne</LegalH2>
      <LegalList items={[
        <><strong>Google (accesso e sincronizzazione Google Calendar)</strong> — lo script di accesso Google viene caricato solo se e quando un amministratore attiva volontariamente il collegamento a Google Calendar da Impostazioni &gt; Integrazioni; da quel momento Google può impostare i propri cookie secondo la sua <a href="https://policies.google.com/technologies/cookies" target="_blank" rel="noreferrer" style={{ color:'var(--accent)', fontWeight:600 }}>informativa cookie</a>. Chi non usa questa funzione non carica mai lo script né i relativi cookie.</>,
        <><strong>Stripe (pagamento dell'abbonamento)</strong> — al momento di attivare o gestire l'abbonamento vieni reindirizzato a una pagina ospitata sul dominio stripe.com, che può impostare propri cookie secondo la <a href="https://stripe.com/it/privacy" target="_blank" rel="noreferrer" style={{ color:'var(--accent)', fontWeight:600 }}>cookie policy di Stripe</a>. Questo avviene solo per chi avvia effettivamente un pagamento.</>,
      ]} />

      <LegalH2>3. Perché non trovi un banner dei cookie</LegalH2>
      <LegalP>
        Non impostiamo direttamente alcun cookie non necessario al funzionamento del Servizio, quindi non
        è previsto un banner di consenso: le uniche eccezioni (Google, Stripe) sono caricate solo in
        seguito a un'azione volontaria e consapevole dell'utente (collegare Google Calendar, avviare un
        pagamento), non al semplice caricamento del sito.
      </LegalP>

      <LegalH2>4. Come gestire i cookie dal tuo browser</LegalH2>
      <LegalP>
        Puoi comunque controllare, bloccare o eliminare i cookie in qualsiasi momento dalle impostazioni
        del tuo browser. Tieni presente che bloccare i cookie di Google potrebbe impedire il
        funzionamento dell'integrazione con Google Calendar, e bloccare quelli di Stripe potrebbe
        impedire di completare un pagamento.
      </LegalP>

      <LegalH2>5. Modifiche a questa pagina</LegalH2>
      <LegalP>
        Se in futuro il Servizio dovesse introdurre strumenti di analisi statistica o altre tecnologie
        non strettamente necessarie, aggiorneremo questa pagina e, se richiesto dalla legge, introdurremo
        un apposito banner di consenso.
      </LegalP>

      <LegalCallout>
        <p style={{ fontSize:14, fontWeight:700, marginBottom:6, color:'var(--text)' }}>Contatti</p>
        <p style={{ fontSize:13.5, color:'var(--text2)', lineHeight:1.6 }}>
          Per domande su questa pagina, scrivi a{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color:'var(--accent)', fontWeight:600 }}>{SUPPORT_EMAIL}</a>.
          Per le informazioni complete su come trattiamo i dati personali vedi l'<a href="/privacy" style={{ color:'var(--accent)', fontWeight:600 }}>Informativa Privacy</a>.
        </p>
      </LegalCallout>
    </LegalPageLayout>
  )
}
