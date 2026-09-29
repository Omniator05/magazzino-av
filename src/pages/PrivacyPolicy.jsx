import { useState } from 'react'
import LegalPageLayout, { LegalH2, LegalP, LegalList, LegalCallout } from '../components/LegalPageLayout'

const SUPPORT_EMAIL = 'info@roadcase.it'

// Bozza redatta per essere tecnicamente e fattualmente corretta rispetto a
// come funziona davvero l'app (sub-responsabili, dati raccolti, base
// giuridica). Dati del Titolare (Mattia Cruciotti, ditta individuale,
// P.IVA 03339290219, Bolzano — solo città, non l'indirizzo esatto, su
// richiesta dell'utente) forniti dall'utente l'8 settembre 2026 — va
// comunque fatta rivedere da un legale/DPO prima della pubblicazione, come
// da richiesta. Versione inglese: stessa traduzione fedele degli stessi
// fatti (date, riferimenti normativi, sub-responsabili) — se cambia un
// fatto in una lingua, va cambiato in entrambe.
//
// NOTA PER CHI REVISIONA: il campo "motivo" delle assenze segnalate dai
// lavoratori (Calendar.jsx → addAbsence, vedi sezione "Dati che raccogliamo")
// è testo libero — può in teoria contenere dati sulla salute (categoria
// particolare, art. 9 GDPR). Valutare se serve una clausola dedicata o
// un'indicazione al Titolare-Cliente di non richiedere motivazioni mediche.
function ContentIt() {
  return (
    <>
      <LegalP>
        La presente informativa descrive come Roadcase (il "Servizio") raccoglie, utilizza e protegge
        i dati personali di chi lo utilizza, in conformità al Regolamento (UE) 2016/679 ("GDPR") e alla
        normativa italiana applicabile in materia di protezione dei dati personali.
      </LegalP>

      <LegalH2>1. Titolare del trattamento</LegalH2>
      <LegalP>
        Titolare del trattamento è Mattia Cruciotti, con sede in Bolzano (BZ),
        P.IVA 03339290219, contattabile all'indirizzo{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color:'var(--accent)', fontWeight:600 }}>{SUPPORT_EMAIL}</a>.
      </LegalP>

      <LegalH2>2. Titolare vs. Responsabile: come si dividono i ruoli</LegalH2>
      <LegalP>
        Roadcase è un software gestionale che ogni azienda cliente ("Cliente", "Squadra") usa per
        gestire il proprio magazzino, i propri eventi e il proprio personale. Questo comporta due ruoli
        distinti, previsti dagli artt. 4 e 28 del GDPR:
      </LegalP>
      <LegalList items={[
        <>Per i <strong>dati dell'account del Cliente e della fatturazione</strong> (chi si registra, email di contatto, stato dell'abbonamento), Roadcase agisce come <strong>Titolare autonomo del trattamento</strong>.</>,
        <>Per i <strong>dati che il Cliente inserisce riguardo ai propri dipendenti/collaboratori</strong> (nome, ruolo, turni, indisponibilità, attività di magazzino svolte), il Cliente è <strong>Titolare del trattamento</strong> e Roadcase agisce come <strong>Responsabile del trattamento</strong> ai sensi dell'art. 28 GDPR, trattando questi dati solo su istruzione del Cliente e per le finalità di erogazione del Servizio.</>,
      ]} />
      <LegalP>
        In pratica: se sei il titolare/amministratore di un'azienda cliente, questa informativa descrive
        anche come devi trattare correttamente i dati dei tuoi lavoratori quando li inserisci in Roadcase —
        in particolare, raccogli solo i dati necessari a gestire magazzino ed eventi ed evita di inserire
        dati non pertinenti (es. dati sanitari) nei campi liberi come le note o il motivo di un'assenza.
      </LegalP>

      <LegalH2>3. Dati che raccogliamo</LegalH2>
      <LegalP>Raccogliamo solo i dati necessari a far funzionare il Servizio:</LegalP>
      <LegalList items={[
        <><strong>Dati di registrazione</strong>: nome, email (dell'amministratore che crea la Squadra; facoltativa per gli altri utenti), nome utente, ruolo (amministratore/magazziniere/organizzatore), password (mai salvata in chiaro: gestita da Firebase Authentication con hashing sicuro).</>,
        <><strong>Dati sull'attività lavorativa nell'app</strong>: oggetti di magazzino, eventi, liste di carico/scarico, scansioni QR/barcode, note su oggetti o eventi, indisponibilità e assenze segnalate (incluso un motivo facoltativo in testo libero) — tutti inseriti dal Cliente o dai suoi utenti.</>,
        <><strong>Dati di fatturazione</strong>: gestiti direttamente da Stripe, Inc. — Roadcase non riceve né conserva mai il numero di carta di pagamento; riceve solo lo stato dell'abbonamento (attivo, in prova, scaduto).</>,
        <><strong>Dati tecnici</strong>: indirizzo IP, tipo di dispositivo/browser, log di accesso, raccolti automaticamente dall'infrastruttura di hosting (Vercel) per motivi di sicurezza e diagnostica.</>,
      ]} />
      <LegalP>
        Non raccogliamo dati tramite cookie di profilazione o pubblicitari, e non vendiamo né cediamo
        dati personali a terzi per finalità di marketing. Per il dettaglio delle tecnologie di
        tracciamento usate vedi la <a href="/cookie-policy" style={{ color:'var(--accent)', fontWeight:600 }}>Cookie Policy</a>.
      </LegalP>

      <LegalH2>4. Finalità e base giuridica del trattamento</LegalH2>
      <LegalList items={[
        <><strong>Erogazione del Servizio</strong> (creazione account, gestione magazzino/eventi/personale) — base giuridica: esecuzione di un contratto (art. 6.1.b GDPR).</>,
        <><strong>Fatturazione e gestione dell'abbonamento</strong> — base giuridica: esecuzione di un contratto e obblighi contabili/fiscali (art. 6.1.b e 6.1.c GDPR).</>,
        <><strong>Comunicazioni di servizio</strong> via email (invito account, benvenuto, avvisi di assenza, reset password) — base giuridica: esecuzione del contratto.</>,
        <><strong>Sicurezza, prevenzione di abusi e risoluzione di problemi tecnici</strong> — base giuridica: legittimo interesse del Titolare (art. 6.1.f GDPR).</>,
      ]} />

      <LegalH2>5. Con chi condividiamo i dati</LegalH2>
      <LegalP>
        I dati sono trattati con strumenti elettronici e condivisi solo con i fornitori tecnici
        strettamente necessari a far funzionare il Servizio, che agiscono come Responsabili del
        trattamento (o, per i dati dell'account Cliente, come sub-responsabili):
      </LegalP>
      <LegalList items={[
        <><strong>Google Ireland Limited / Google LLC</strong> — infrastruttura Firebase (autenticazione, database, storage dei file) che ospita tutti i dati dell'applicazione.</>,
        <><strong>Vercel Inc.</strong> — hosting del sito e delle funzioni server.</>,
        <><strong>Stripe, Inc.</strong> — elaborazione dei pagamenti dell'abbonamento.</>,
        <><strong>Resend</strong> — invio delle email transazionali (inviti, notifiche, reset password).</>,
      ]} />
      <LegalP>
        Alcuni di questi fornitori hanno sede o trattano dati anche fuori dall'Unione Europea (in
        particolare negli Stati Uniti). In questi casi il trasferimento avviene sulla base delle
        Clausole Contrattuali Standard approvate dalla Commissione Europea o di altro meccanismo di
        trasferimento adeguato previsto dal GDPR.
      </LegalP>

      <LegalH2>6. Per quanto tempo conserviamo i dati</LegalH2>
      <LegalP>
        I dati sono conservati per tutta la durata del rapporto contrattuale con il Cliente. Alla
        cessazione dell'account (disdetta o eliminazione), i dati vengono cancellati entro un tempo
        ragionevole, salvo quanto sia necessario conservare più a lungo per obblighi di legge (es.
        normativa fiscale/contabile) o per la gestione di contestazioni. Un Cliente può richiedere in
        qualsiasi momento l'esportazione o la cancellazione anticipata dei propri dati scrivendo a{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color:'var(--accent)', fontWeight:600 }}>{SUPPORT_EMAIL}</a>.
      </LegalP>

      <LegalH2>7. I tuoi diritti</LegalH2>
      <LegalP>
        In qualità di interessato, hai diritto di chiedere in qualsiasi momento, secondo le modalità e
        nei limiti previsti dagli artt. 15-22 del GDPR:
      </LegalP>
      <LegalList items={[
        'Accesso ai tuoi dati personali e a una copia degli stessi',
        'Rettifica di dati inesatti o incompleti',
        'Cancellazione dei dati ("diritto all\'oblio"), nei casi previsti dalla legge',
        'Limitazione del trattamento',
        'Portabilità dei dati in un formato strutturato e leggibile',
        'Opposizione al trattamento basato sul legittimo interesse',
      ]} />
      <LegalP>
        Se sei un lavoratore/utente invitato da un'azienda cliente, per esercitare questi diritti puoi
        rivolgerti direttamente al tuo datore di lavoro (Titolare del trattamento per i tuoi dati) oppure
        a noi, che lo inoltreremo. Hai inoltre sempre diritto di proporre reclamo al Garante per la
        protezione dei dati personali (<a href="https://www.garanteprivacy.it" target="_blank" rel="noreferrer" style={{ color:'var(--accent)', fontWeight:600 }}>www.garanteprivacy.it</a>).
      </LegalP>

      <LegalH2>8. Sicurezza</LegalH2>
      <LegalP>
        Adottiamo misure tecniche e organizzative adeguate a proteggere i dati da accessi non
        autorizzati, perdita o divulgazione: connessioni cifrate (HTTPS/TLS), password non conservate in
        chiaro, accesso ai dati di ogni azienda cliente isolato e limitato ai soli utenti autorizzati di
        quella stessa azienda.
      </LegalP>

      <LegalH2>9. Minori</LegalH2>
      <LegalP>
        Il Servizio è rivolto ad aziende e professionisti ed è utilizzabile solo da persone maggiorenni.
        Non raccogliamo consapevolmente dati di minori di 18 anni.
      </LegalP>

      <LegalH2>10. Modifiche alla presente informativa</LegalH2>
      <LegalP>
        Possiamo aggiornare questa informativa nel tempo, ad esempio per riflettere nuove funzionalità
        del Servizio o modifiche normative. La data di "ultimo aggiornamento" in cima alla pagina indica
        la versione in vigore; in caso di modifiche sostanziali te lo comunicheremo con un preavviso
        ragionevole.
      </LegalP>

      <LegalCallout>
        <p style={{ fontSize:14, fontWeight:700, marginBottom:6, color:'var(--text)' }}>Contatti</p>
        <p style={{ fontSize:13.5, color:'var(--text2)', lineHeight:1.6 }}>
          Per qualsiasi domanda su questa informativa o per esercitare i tuoi diritti, scrivi a{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color:'var(--accent)', fontWeight:600 }}>{SUPPORT_EMAIL}</a>.
        </p>
      </LegalCallout>
    </>
  )
}

function ContentEn() {
  return (
    <>
      <LegalP>
        This notice describes how Roadcase (the "Service") collects, uses and protects the personal
        data of people who use it, in accordance with Regulation (EU) 2016/679 ("GDPR") and applicable
        Italian data protection law.
      </LegalP>

      <LegalH2>1. Data Controller</LegalH2>
      <LegalP>
        The Data Controller is Mattia Cruciotti, based in Bolzano, Italy,
        VAT number (P.IVA) 03339290219, reachable at{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color:'var(--accent)', fontWeight:600 }}>{SUPPORT_EMAIL}</a>.
      </LegalP>

      <LegalH2>2. Controller vs. Processor: how the roles split</LegalH2>
      <LegalP>
        Roadcase is management software that each customer company ("Customer", "Team") uses to manage
        its own warehouse, events and staff. This creates two distinct roles under Articles 4 and 28 GDPR:
      </LegalP>
      <LegalList items={[
        <>For <strong>the Customer's account and billing data</strong> (who signs up, contact email, subscription status), Roadcase acts as an <strong>independent Data Controller</strong>.</>,
        <>For <strong>data the Customer enters about its own employees/collaborators</strong> (name, role, shifts, unavailability, warehouse activity performed), the Customer is the <strong>Data Controller</strong> and Roadcase acts as a <strong>Data Processor</strong> under Article 28 GDPR, processing this data only on the Customer's instructions and for the purpose of providing the Service.</>,
      ]} />
      <LegalP>
        In practice: if you are the owner/admin of a customer company, this notice also describes how
        you need to correctly handle your workers' data when you enter it into Roadcase — in particular,
        collect only the data needed to manage warehouse and events, and avoid entering irrelevant data
        (e.g. health data) into free-text fields such as notes or the reason for an absence.
      </LegalP>

      <LegalH2>3. Data we collect</LegalH2>
      <LegalP>We only collect the data needed to make the Service work:</LegalP>
      <LegalList items={[
        <><strong>Registration data</strong>: name, email (of the admin who creates the Team; optional for other users), username, role (admin/warehouse worker/organizer), password (never stored in plain text: handled by Firebase Authentication with secure hashing).</>,
        <><strong>Work-activity data inside the app</strong>: warehouse items, events, loading/unloading lists, QR/barcode scans, notes on items or events, reported unavailability and absences (including an optional free-text reason) — all entered by the Customer or its users.</>,
        <><strong>Billing data</strong>: handled directly by Stripe, Inc. — Roadcase never receives or stores card numbers; it only receives the subscription status (active, trialing, expired).</>,
        <><strong>Technical data</strong>: IP address, device/browser type, access logs, collected automatically by the hosting infrastructure (Vercel) for security and diagnostic purposes.</>,
      ]} />
      <LegalP>
        We do not collect data through profiling or advertising cookies, and we do not sell or share
        personal data with third parties for marketing purposes. For details on the tracking technologies
        used, see the <a href="/cookie-policy" style={{ color:'var(--accent)', fontWeight:600 }}>Cookie Policy</a>.
      </LegalP>

      <LegalH2>4. Purposes and legal basis for processing</LegalH2>
      <LegalList items={[
        <><strong>Providing the Service</strong> (account creation, warehouse/event/staff management) — legal basis: performance of a contract (Art. 6.1.b GDPR).</>,
        <><strong>Billing and subscription management</strong> — legal basis: performance of a contract and accounting/tax obligations (Art. 6.1.b and 6.1.c GDPR).</>,
        <><strong>Service communications</strong> by email (account invite, welcome, absence notifications, password reset) — legal basis: performance of the contract.</>,
        <><strong>Security, abuse prevention and troubleshooting</strong> — legal basis: the Controller's legitimate interest (Art. 6.1.f GDPR).</>,
      ]} />

      <LegalH2>5. Who we share data with</LegalH2>
      <LegalP>
        Data is processed with electronic tools and shared only with the technical providers strictly
        necessary to run the Service, who act as Data Processors (or, for Customer account data, as
        sub-processors):
      </LegalP>
      <LegalList items={[
        <><strong>Google Ireland Limited / Google LLC</strong> — Firebase infrastructure (authentication, database, file storage) hosting all application data.</>,
        <><strong>Vercel Inc.</strong> — hosting of the website and server functions.</>,
        <><strong>Stripe, Inc.</strong> — processing of subscription payments.</>,
        <><strong>Resend</strong> — sending of transactional emails (invites, notifications, password resets).</>,
      ]} />
      <LegalP>
        Some of these providers are based, or process data, outside the European Union (in particular in
        the United States). In these cases the transfer relies on the Standard Contractual Clauses
        approved by the European Commission or another adequate transfer mechanism provided for by the
        GDPR.
      </LegalP>

      <LegalH2>6. How long we keep data</LegalH2>
      <LegalP>
        Data is kept for the entire duration of the contractual relationship with the Customer. When an
        account ends (cancellation or deletion), data is deleted within a reasonable time, except where
        it must be kept longer for legal obligations (e.g. tax/accounting rules) or to handle disputes.
        A Customer may request the export or early deletion of its data at any time by writing to{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color:'var(--accent)', fontWeight:600 }}>{SUPPORT_EMAIL}</a>.
      </LegalP>

      <LegalH2>7. Your rights</LegalH2>
      <LegalP>
        As a data subject, you have the right to request at any time, in the manner and within the
        limits set out in Articles 15-22 GDPR:
      </LegalP>
      <LegalList items={[
        'Access to your personal data and a copy of it',
        'Rectification of inaccurate or incomplete data',
        'Erasure of data ("right to be forgotten"), in the cases provided for by law',
        'Restriction of processing',
        'Data portability in a structured, machine-readable format',
        'Objection to processing based on legitimate interest',
      ]} />
      <LegalP>
        If you are a worker/user invited by a customer company, to exercise these rights you can contact
        your employer directly (the Data Controller for your data) or contact us, and we will forward
        your request. You also always have the right to lodge a complaint with the Italian data
        protection authority, the Garante per la protezione dei dati personali
        (<a href="https://www.garanteprivacy.it" target="_blank" rel="noreferrer" style={{ color:'var(--accent)', fontWeight:600 }}>www.garanteprivacy.it</a>).
      </LegalP>

      <LegalH2>8. Security</LegalH2>
      <LegalP>
        We adopt appropriate technical and organizational measures to protect data from unauthorized
        access, loss or disclosure: encrypted connections (HTTPS/TLS), passwords never stored in plain
        text, and each customer company's data kept isolated and accessible only to that company's own
        authorized users.
      </LegalP>

      <LegalH2>9. Minors</LegalH2>
      <LegalP>
        The Service is aimed at businesses and professionals and may only be used by adults. We do not
        knowingly collect data from anyone under 18.
      </LegalP>

      <LegalH2>10. Changes to this notice</LegalH2>
      <LegalP>
        We may update this notice over time, for example to reflect new Service features or regulatory
        changes. The "last updated" date at the top of the page indicates the version in force; in case
        of material changes we will notify you with reasonable advance notice.
      </LegalP>

      <LegalCallout>
        <p style={{ fontSize:14, fontWeight:700, marginBottom:6, color:'var(--text)' }}>Contact</p>
        <p style={{ fontSize:13.5, color:'var(--text2)', lineHeight:1.6 }}>
          For any question about this notice or to exercise your rights, write to{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color:'var(--accent)', fontWeight:600 }}>{SUPPORT_EMAIL}</a>.
        </p>
      </LegalCallout>
    </>
  )
}

export default function PrivacyPolicy() {
  const [lang, setLang] = useState('it')
  return (
    <LegalPageLayout
      title={lang === 'en' ? 'Privacy Policy' : 'Informativa sulla Privacy'}
      updatedAt={lang === 'en' ? 'September 8, 2026' : '8 settembre 2026'}
      lang={lang}
      onLangChange={setLang}
    >
      {lang === 'en' ? <ContentEn /> : <ContentIt />}
    </LegalPageLayout>
  )
}
