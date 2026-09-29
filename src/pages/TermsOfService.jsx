import { useState } from 'react'
import LegalPageLayout, { LegalH2, LegalP, LegalList, LegalCallout } from '../components/LegalPageLayout'

const SUPPORT_EMAIL = 'info@roadcase.it'

// Bozza: le condizioni economiche (prova 30gg, 35€/mese, nessuna carta
// richiesta per iniziare, disdetta libera dal portale Stripe) sono prese
// pari pari da quanto già promesso pubblicamente in Landing.jsx — vanno
// tenute allineate se cambia il prezzo lì. Dati del Titolare (Mattia
// Cruciotti, ditta individuale, P.IVA 03339290219, Bolzano — solo città,
// non l'indirizzo esatto, su richiesta dell'utente — foro competente)
// forniti dall'utente l'8 settembre 2026. Da far revisionare da un legale
// prima della pubblicazione. Versione inglese: stessa traduzione fedele
// degli stessi fatti — se cambia un fatto in una lingua, va cambiato in
// entrambe.
function ContentIt() {
  return (
    <>
      <LegalP>
        I presenti Termini e Condizioni ("Termini") regolano l'utilizzo di Roadcase (il "Servizio"), il
        gestionale per aziende di noleggio audio/video/luci per magazzino, calendario eventi e liste di
        carico. Creando un account o utilizzando il Servizio accetti integralmente questi Termini.
      </LegalP>

      <LegalH2>1. Chi siamo</LegalH2>
      <LegalP>
        Il Servizio è fornito da Mattia Cruciotti, con sede in Bolzano (BZ),
        P.IVA 03339290219 ("noi", "Roadcase"),
        contattabile all'indirizzo <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color:'var(--accent)', fontWeight:600 }}>{SUPPORT_EMAIL}</a>.
      </LegalP>

      <LegalH2>2. Definizioni</LegalH2>
      <LegalList items={[
        <><strong>Cliente</strong>: l'azienda che crea una Squadra e sottoscrive il Servizio.</>,
        <><strong>Squadra</strong>: lo spazio di lavoro dedicato a un Cliente all'interno del Servizio, con i propri dati (magazzino, eventi, utenti) isolati da quelli di ogni altro Cliente.</>,
        <><strong>Utente</strong>: chiunque acceda al Servizio con un account, sia esso amministratore, magazziniere o organizzatore, creato dal Cliente o tramite registrazione autonoma.</>,
        <><strong>Account amministratore</strong>: l'Utente che crea la Squadra e/o ha pieni poteri di gestione su di essa.</>,
      ]} />

      <LegalH2>3. Registrazione e responsabilità dell'account</LegalH2>
      <LegalP>
        Per usare il Servizio è necessario creare un account fornendo informazioni veritiere e
        aggiornate. Il Cliente è responsabile di mantenere riservate le credenziali dei propri account
        (incluse quelle create per i propri lavoratori) e di ogni attività svolta tramite essi. Il
        Servizio è destinato a un uso professionale/aziendale: creando un account dichiari di avere il
        potere di vincolare contrattualmente l'azienda per conto della quale ti registri e di avere
        almeno 18 anni.
      </LegalP>
      <LegalP>
        Il Cliente resta l'unico responsabile della correttezza e liceità dei dati che inserisce nel
        Servizio riguardo ai propri lavoratori e collaboratori (vedi anche l'<a href="/privacy" style={{ color:'var(--accent)', fontWeight:600 }}>Informativa Privacy</a>,
        sezione "Titolare vs. Responsabile").
      </LegalP>

      <LegalH2>4. Descrizione del Servizio</LegalH2>
      <LegalP>
        Roadcase è un software gestionale in abbonamento (SaaS) che offre, tra le altre, le seguenti
        funzionalità: gestione del magazzino e delle giacenze, calendario eventi, liste di carico e
        scarico con scanner QR/barcode da smartphone, gestione del personale e dei permessi. Ci
        riserviamo il diritto di modificare, aggiungere o rimuovere funzionalità nel tempo, dandone
        ragionevole comunicazione in caso di rimozione di funzionalità sostanziali già disponibili a
        pagamento.
      </LegalP>

      <LegalH2>5. Prova gratuita e piani</LegalH2>
      <LegalP>
        Alla creazione di una nuova Squadra è attivata automaticamente una prova gratuita di 30 giorni,
        senza necessità di inserire una carta di pagamento. Al termine della prova, se non viene attivato
        un abbonamento, la Squadra continua a operare su un <strong>piano gratuito con funzionalità
        limitate</strong>: 1 account amministratore, fino a 3 magazzinieri, fino a 20 oggetti per lista di
        carico e fino a 50 oggetti totali a magazzino. Questi limiti possono essere aggiornati nel tempo;
        la versione in vigore è sempre consultabile all'interno del Servizio.
      </LegalP>

      <LegalH2>6. Fatturazione, pagamento e disdetta</LegalH2>
      <LegalP>
        Il piano a pagamento ha un costo di 35€/mese per azienda (prezzo di lancio, valido finché il
        Servizio è in fase di sviluppo attivo — un eventuale aumento futuro sarà comunicato in anticipo e
        non si applicherà retroattivamente ad abbonamenti già attivi senza preavviso) e si rinnova
        automaticamente su base mensile fino a disdetta. I pagamenti sono elaborati da Stripe, Inc.;
        Roadcase non riceve né conserva mai i dati della carta di pagamento.
      </LegalP>
      <LegalP>
        Puoi disdire l'abbonamento in qualsiasi momento, in piena autonomia, dal portale clienti Stripe
        raggiungibile da Impostazioni &gt; Fatturazione all'interno del Servizio. La disdetta ha effetto
        alla fine del periodo di fatturazione in corso, già pagato: salvo quanto diversamente previsto
        dalla legge applicabile, non sono previsti rimborsi per periodi di abbonamento già iniziati. In
        caso di mancato pagamento, il Servizio può essere sospeso fino alla regolarizzazione; il super
        amministratore del Servizio può comunque garantire assistenza per sbloccare situazioni bloccanti.
      </LegalP>

      <LegalH2>7. Uso consentito</LegalH2>
      <LegalP>Utilizzando il Servizio ti impegni a non:</LegalP>
      <LegalList items={[
        'violare leggi o diritti di terzi tramite il Servizio;',
        'tentare di accedere senza autorizzazione a dati o account di altre Squadre;',
        'compiere attività che possano compromettere la sicurezza, la disponibilità o l\'integrità del Servizio (inclusi tentativi di reverse engineering non consentiti dalla legge);',
        'utilizzare il Servizio per scopi diversi dalla gestione della propria attività di noleggio/produzione audio-video-luci o attività assimilabili.',
      ]} />

      <LegalH2>8. Disponibilità del Servizio</LegalH2>
      <LegalP>
        Ci impegniamo a mantenere il Servizio disponibile e funzionante con la massima cura ragionevole
        ("best effort"), ma non garantiamo un livello di disponibilità (SLA) specifico salvo diverso
        accordo scritto. Potremmo sospendere temporaneamente il Servizio per manutenzione, aggiornamenti
        o cause di forza maggiore, cercando di ridurre al minimo i disagi e di darne preavviso quando
        possibile.
      </LegalP>

      <LegalH2>9. Proprietà intellettuale</LegalH2>
      <LegalP>
        Il software, il marchio Roadcase, il design e i contenuti del Servizio restano di nostra
        proprietà esclusiva (o dei rispettivi licenzianti) e non ti vengono ceduti in alcun modo:
        acquisisci solo un diritto d'uso limitato, non esclusivo e non trasferibile, per la durata
        dell'abbonamento. I dati che inserisci nel Servizio (magazzino, eventi, anagrafiche) restano di
        tua proprietà; su richiesta ti forniamo un'esportazione in caso di chiusura dell'account.
      </LegalP>

      <LegalH2>10. Limitazione di responsabilità</LegalH2>
      <LegalP>
        Nei limiti massimi consentiti dalla legge applicabile, la nostra responsabilità complessiva
        verso di te per qualsiasi pretesa relativa al Servizio è limitata all'importo effettivamente
        pagato per l'abbonamento nei 12 mesi precedenti l'evento che ha dato origine alla pretesa.
        Escludiamo responsabilità per danni indiretti, perdita di profitto o di dati, salvo quanto non
        escludibile per legge (es. dolo o colpa grave). Resta inteso che il Cliente è responsabile
        dell'accuratezza dei dati inseriti (es. giacenze, disponibilità di attrezzatura) e delle decisioni
        operative prese sulla base di essi.
      </LegalP>

      <LegalH2>11. Sospensione e risoluzione</LegalH2>
      <LegalP>
        Puoi cessare di utilizzare il Servizio ed eliminare il tuo account in qualsiasi momento. Ci
        riserviamo il diritto di sospendere o chiudere un account in caso di violazione di questi Termini,
        mancato pagamento non regolarizzato entro un termine ragionevole, o uso del Servizio che esponga
        a rischi legali o di sicurezza altri Clienti o il Servizio stesso.
      </LegalP>

      <LegalH2>12. Modifiche ai Termini</LegalH2>
      <LegalP>
        Possiamo aggiornare questi Termini nel tempo. In caso di modifiche sostanziali te lo
        comunicheremo con un preavviso ragionevole; l'uso continuato del Servizio dopo l'entrata in
        vigore delle modifiche costituisce accettazione dei nuovi Termini.
      </LegalP>

      <LegalH2>13. Legge applicabile e foro competente</LegalH2>
      <LegalP>
        I presenti Termini sono regolati dalla legge italiana. Per qualsiasi controversia non risolta in
        via amichevole è competente in via esclusiva il Foro di Bolzano, salve le norme
        inderogabili a tutela del consumatore eventualmente applicabili.
      </LegalP>

      <LegalCallout>
        <p style={{ fontSize:14, fontWeight:700, marginBottom:6, color:'var(--text)' }}>Contatti</p>
        <p style={{ fontSize:13.5, color:'var(--text2)', lineHeight:1.6 }}>
          Per domande su questi Termini, scrivi a{' '}
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
        These Terms and Conditions ("Terms") govern the use of Roadcase (the "Service"), the management
        software for audio/video/lighting rental companies covering warehouse, event calendar and
        loading lists. By creating an account or using the Service you fully accept these Terms.
      </LegalP>

      <LegalH2>1. Who we are</LegalH2>
      <LegalP>
        The Service is provided by Mattia Cruciotti, based in Bolzano, Italy,
        VAT number (P.IVA) 03339290219 ("we", "Roadcase"),
        reachable at <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color:'var(--accent)', fontWeight:600 }}>{SUPPORT_EMAIL}</a>.
      </LegalP>

      <LegalH2>2. Definitions</LegalH2>
      <LegalList items={[
        <><strong>Customer</strong>: the company that creates a Team and subscribes to the Service.</>,
        <><strong>Team</strong>: the workspace dedicated to a Customer within the Service, with its own data (warehouse, events, users) isolated from every other Customer's.</>,
        <><strong>User</strong>: anyone who accesses the Service with an account, whether admin, warehouse worker or organizer, created by the Customer or through self-registration.</>,
        <><strong>Admin account</strong>: the User who creates the Team and/or has full management powers over it.</>,
      ]} />

      <LegalH2>3. Registration and account responsibility</LegalH2>
      <LegalP>
        To use the Service you must create an account providing truthful and up-to-date information.
        The Customer is responsible for keeping the credentials of its accounts (including those created
        for its workers) confidential, and for all activity carried out through them. The Service is
        intended for professional/business use: by creating an account you represent that you have the
        authority to contractually bind the company you are registering on behalf of, and that you are
        at least 18 years old.
      </LegalP>
      <LegalP>
        The Customer remains solely responsible for the accuracy and lawfulness of the data it enters
        into the Service regarding its workers and collaborators (see also the{' '}
        <a href="/privacy" style={{ color:'var(--accent)', fontWeight:600 }}>Privacy Policy</a>,
        "Controller vs. Processor" section).
      </LegalP>

      <LegalH2>4. Description of the Service</LegalH2>
      <LegalP>
        Roadcase is subscription (SaaS) management software offering, among others, the following
        features: warehouse and stock management, event calendar, loading/unloading lists with
        smartphone QR/barcode scanning, staff and permissions management. We reserve the right to
        change, add or remove features over time, giving reasonable notice if we remove substantial
        features already available to paying customers.
      </LegalP>

      <LegalH2>5. Free trial and plans</LegalH2>
      <LegalP>
        Creating a new Team automatically starts a 30-day free trial, with no payment card required. If
        no subscription is activated by the end of the trial, the Team continues to operate on a{' '}
        <strong>free plan with limited features</strong>: 1 admin account, up to 3 warehouse workers, up
        to 20 items per loading list and up to 50 total items in the warehouse. These limits may be
        updated over time; the version in force can always be checked within the Service.
      </LegalP>

      <LegalH2>6. Billing, payment and cancellation</LegalH2>
      <LegalP>
        The paid plan costs €35/month per company (launch price, valid while the Service is in active
        development — any future increase will be announced in advance and will not apply retroactively
        to already-active subscriptions without notice) and renews automatically on a monthly basis until
        cancelled. Payments are processed by Stripe, Inc.; Roadcase never receives or stores payment
        card data.
      </LegalP>
      <LegalP>
        You can cancel your subscription at any time, fully self-service, from the Stripe customer
        portal reachable from Settings &gt; Billing within the Service. Cancellation takes effect at the
        end of the current, already-paid billing period: unless otherwise required by applicable law, no
        refunds are given for subscription periods already started. In case of non-payment, the Service
        may be suspended until the situation is resolved; the Service's super admin can still provide
        assistance to unblock a stuck situation.
      </LegalP>

      <LegalH2>7. Acceptable use</LegalH2>
      <LegalP>By using the Service you agree not to:</LegalP>
      <LegalList items={[
        'violate any law or third-party right through the Service;',
        'attempt to access data or accounts of other Teams without authorization;',
        'carry out activities that could compromise the security, availability or integrity of the Service (including reverse engineering not permitted by law);',
        'use the Service for purposes other than managing your own audio/video/lighting rental or production business, or similar activities.',
      ]} />

      <LegalH2>8. Service availability</LegalH2>
      <LegalP>
        We work to keep the Service available and functioning with reasonable care ("best effort"), but
        we do not guarantee any specific availability level (SLA) unless otherwise agreed in writing. We
        may temporarily suspend the Service for maintenance, updates or force majeure events, aiming to
        minimize disruption and give notice when possible.
      </LegalP>

      <LegalH2>9. Intellectual property</LegalH2>
      <LegalP>
        The software, the Roadcase trademark, the design and the content of the Service remain our
        exclusive property (or that of our respective licensors) and are not transferred to you in any
        way: you only acquire a limited, non-exclusive, non-transferable right of use for the duration of
        your subscription. Data you enter into the Service (warehouse, events, records) remains your
        property; on request we provide an export if you close your account.
      </LegalP>

      <LegalH2>10. Limitation of liability</LegalH2>
      <LegalP>
        To the maximum extent permitted by applicable law, our total liability to you for any claim
        related to the Service is limited to the amount actually paid for the subscription in the 12
        months preceding the event giving rise to the claim. We exclude liability for indirect damages,
        loss of profit or data, except where this cannot be excluded by law (e.g. wilful misconduct or
        gross negligence). It is understood that the Customer is responsible for the accuracy of the data
        it enters (e.g. stock levels, equipment availability) and for operational decisions made based on
        it.
      </LegalP>

      <LegalH2>11. Suspension and termination</LegalH2>
      <LegalP>
        You can stop using the Service and delete your account at any time. We reserve the right to
        suspend or close an account in case of breach of these Terms, non-payment not resolved within a
        reasonable time, or use of the Service that exposes other Customers or the Service itself to
        legal or security risks.
      </LegalP>

      <LegalH2>12. Changes to the Terms</LegalH2>
      <LegalP>
        We may update these Terms over time. In case of material changes we will notify you with
        reasonable advance notice; continued use of the Service after the changes take effect constitutes
        acceptance of the new Terms.
      </LegalP>

      <LegalH2>13. Governing law and jurisdiction</LegalH2>
      <LegalP>
        These Terms are governed by Italian law. Any dispute not resolved amicably is subject to the
        exclusive jurisdiction of the Court of Bolzano, subject to any mandatory consumer-protection
        rules that may apply.
      </LegalP>

      <LegalCallout>
        <p style={{ fontSize:14, fontWeight:700, marginBottom:6, color:'var(--text)' }}>Contact</p>
        <p style={{ fontSize:13.5, color:'var(--text2)', lineHeight:1.6 }}>
          For questions about these Terms, write to{' '}
          <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color:'var(--accent)', fontWeight:600 }}>{SUPPORT_EMAIL}</a>.
        </p>
      </LegalCallout>
    </>
  )
}

export default function TermsOfService() {
  const [lang, setLang] = useState('it')
  return (
    <LegalPageLayout
      title={lang === 'en' ? 'Terms and Conditions' : 'Termini e Condizioni'}
      updatedAt={lang === 'en' ? 'September 8, 2026' : '8 settembre 2026'}
      lang={lang}
      onLangChange={setLang}
    >
      {lang === 'en' ? <ContentEn /> : <ContentIt />}
    </LegalPageLayout>
  )
}
