import LegalPageLayout, { LegalH2, LegalP, LegalList, LegalCallout } from '../components/LegalPageLayout'

const SUPPORT_EMAIL = 'appmagazzinoav@gmail.com'

// Bozza redatta per essere tecnicamente e fattualmente corretta rispetto a
// come funziona davvero l'app (sub-responsabili, dati raccolti, base
// giuridica). Dati del Titolare (Mattia Cruciotti, ditta individuale,
// P.IVA 03339290219, Largo Adolph Kolping 2, Bolzano) forniti dall'utente
// il 8 settembre 2026 — va comunque fatta rivedere da un legale/DPO prima
// della pubblicazione, come da richiesta.
//
// NOTA PER CHI REVISIONA: il campo "motivo" delle assenze segnalate dai
// lavoratori (Calendar.jsx → addAbsence, vedi sezione "Dati che raccogliamo")
// è testo libero — può in teoria contenere dati sulla salute (categoria
// particolare, art. 9 GDPR). Valutare se serve una clausola dedicata o
// un'indicazione al Titolare-Cliente di non richiedere motivazioni mediche.
export default function PrivacyPolicy() {
  return (
    <LegalPageLayout title="Informativa sulla Privacy" updatedAt="8 settembre 2026">
      <LegalP>
        La presente informativa descrive come Roadcase (il "Servizio") raccoglie, utilizza e protegge
        i dati personali di chi lo utilizza, in conformità al Regolamento (UE) 2016/679 ("GDPR") e alla
        normativa italiana applicabile in materia di protezione dei dati personali.
      </LegalP>

      <LegalH2>1. Titolare del trattamento</LegalH2>
      <LegalP>
        Titolare del trattamento è Mattia Cruciotti, con sede in Largo Adolph Kolping, 2 — 39100
        Bolzano (BZ), P.IVA 03339290219, contattabile all'indirizzo{' '}
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
    </LegalPageLayout>
  )
}
