import { useState } from 'react'
import LegalPageLayout, { LegalH2, LegalP, LegalList, LegalCallout } from '../components/LegalPageLayout'

const SUPPORT_EMAIL = 'info@roadcase.it'

// Questa pagina descrive lo stato REALE del codice, non un obiettivo: nessun
// analytics/tracking (verificato: nessuna dipendenza del genere in
// package.json), sessione via Firebase Auth (IndexedDB/localStorage, non
// cookie), e lo script Google Identity ora caricato solo on-demand da
// utils/googleCalendar.js quando un admin collega davvero Google Calendar
// (vedi loadGoogleIdentityScript) — non più in ogni pagina come prima. Se in
// futuro si aggiunge un vero tracciamento/analytics, questa pagina E la
// mancanza di un banner cookie vanno riviste insieme. Versione inglese:
// stessa traduzione fedele degli stessi fatti — se cambia un fatto in una
// lingua, va cambiato in entrambe.
function ContentIt() {
  return (
    <>
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
    </>
  )
}

function ContentEn() {
  return (
    <>
      <LegalP>
        This page explains which cookies and similar technologies (e.g. localStorage, IndexedDB)
        Roadcase (the "Service") uses, and why.
      </LegalP>

      <LegalH2>1. What we use directly</LegalH2>
      <LegalP>
        Roadcase does not install profiling, advertising or third-party analytics cookies. To make login
        work we use Firebase Authentication, which stores the login session in the browser via{' '}
        <strong>IndexedDB/localStorage</strong> (not cookies in the strict sense) — data that is
        technically necessary for the Service itself to work (staying logged in from one page to the
        next), and therefore does not require consent under Article 122 of the Italian Privacy Code (the
        "strictly necessary" category of cookies/technologies).
      </LegalP>

      <LegalH2>2. Third-party services that may set their own</LegalH2>
      <LegalList items={[
        <><strong>Google (Google Calendar sign-in and sync)</strong> — the Google sign-in script is only loaded if and when an admin voluntarily starts the Google Calendar connection from Settings &gt; Integrations; from that point on Google may set its own cookies under its own{' '}
          <a href="https://policies.google.com/technologies/cookies" target="_blank" rel="noreferrer" style={{ color:'var(--accent)', fontWeight:600 }}>cookie policy</a>. Anyone who doesn't use this feature never loads that script or its cookies.</>,
        <><strong>Stripe (subscription payment)</strong> — when you activate or manage your subscription you are redirected to a page hosted on the stripe.com domain, which may set its own cookies under{' '}
          <a href="https://stripe.com/en/privacy" target="_blank" rel="noreferrer" style={{ color:'var(--accent)', fontWeight:600 }}>Stripe's cookie policy</a>. This only happens for someone who actually starts a payment.</>,
      ]} />

      <LegalH2>3. Why there's no cookie banner</LegalH2>
      <LegalP>
        We don't directly set any cookie that isn't necessary for the Service to work, so no consent
        banner is shown: the only exceptions (Google, Stripe) are loaded only following a deliberate,
        conscious action by the user (connecting Google Calendar, starting a payment), not simply by
        loading the site.
      </LegalP>

      <LegalH2>4. How to manage cookies from your browser</LegalH2>
      <LegalP>
        You can still control, block or delete cookies at any time from your browser's settings. Keep in
        mind that blocking Google's cookies may prevent the Google Calendar integration from working, and
        blocking Stripe's may prevent you from completing a payment.
      </LegalP>

      <LegalH2>5. Changes to this page</LegalH2>
      <LegalP>
        If the Service introduces statistical analysis tools or other non-strictly-necessary technologies
        in the future, we will update this page and, if required by law, introduce a dedicated consent
        banner.
      </LegalP>

      <LegalCallout>
        <p style={{ fontSize:14, fontWeight:700, marginBottom:6, color:'var(--text)' }}>Contact</p>
        <p style={{ fontSize:13.5, color:'var(--text2)', lineHeight:1.6 }}>
          For questions about this page, write to{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color:'var(--accent)', fontWeight:600 }}>{SUPPORT_EMAIL}</a>.
          For full details on how we handle personal data see the{' '}
          <a href="/privacy" style={{ color:'var(--accent)', fontWeight:600 }}>Privacy Policy</a>.
        </p>
      </LegalCallout>
    </>
  )
}

export default function CookiePolicy() {
  const [lang, setLang] = useState('it')
  return (
    <LegalPageLayout
      title={lang === 'en' ? 'Cookie Policy' : 'Cookie Policy'}
      updatedAt={lang === 'en' ? 'September 8, 2026' : '8 settembre 2026'}
      lang={lang}
      onLangChange={setLang}
    >
      {lang === 'en' ? <ContentEn /> : <ContentIt />}
    </LegalPageLayout>
  )
}
