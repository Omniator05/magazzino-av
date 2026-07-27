// Wrapper minimo per l'API REST di Resend (niente SDK, una sola chiamata
// fetch — coerente con come già parliamo con Stripe in questo progetto).
// Richiede RESEND_API_KEY su Vercel. RESEND_FROM_EMAIL è opzionale: finché
// non si verifica un dominio proprio su Resend, il mittente di default
// "onboarding@resend.dev" funziona ma può mandare solo alla propria email
// di test — per email vere ai clienti serve verificare un dominio vero.
export async function sendEmail({ to, subject, html }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || 'Roadcase <onboarding@resend.dev>',
      to: [to],
      subject,
      html,
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Resend ${res.status}: ${detail}`)
  }
  return res.json()
}

const BRAND_RED = '#e63946'

// Guscio HTML condiviso dalle email transazionali — email client non
// supportano <style>/CSS esterno in modo affidabile, quindi tutto inline.
function emailShell({ title, bodyHtml, ctaLabel, ctaUrl }) {
  return `
  <div style="background:#f5f5f3;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:440px;margin:0 auto;background:#ffffff;border-radius:20px;overflow:hidden;">
      <div style="background:${BRAND_RED};padding:22px 28px;">
        <p style="margin:0;color:#ffffff;font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">Roadcase</p>
      </div>
      <div style="padding:28px;">
        <h1 style="margin:0 0 14px;font-size:20px;font-weight:800;color:#1a1a1a;">${title}</h1>
        ${bodyHtml}
        ${ctaUrl ? `
        <div style="margin-top:24px;">
          <a href="${ctaUrl}" style="display:inline-block;background:${BRAND_RED};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:13px 24px;border-radius:12px;">${ctaLabel}</a>
        </div>` : ''}
      </div>
    </div>
  </div>`
}

export function inviteEmailHtml({ workerName, teamName, username, password, loginUrl }) {
  return emailShell({
    title: `Ciao ${workerName},`,
    bodyHtml: `
      <p style="margin:0 0 14px;color:#4b5563;font-size:14.5px;line-height:1.6;">
        Sei stato aggiunto alla squadra <strong>${teamName}</strong> su Roadcase, il gestionale per il magazzino e gli eventi.
      </p>
      <div style="background:#f5f5f3;border-radius:12px;padding:14px 16px;margin:0 0 6px;">
        <p style="margin:0 0 4px;color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;">Le tue credenziali</p>
        <p style="margin:0;color:#1a1a1a;font-size:14px;font-family:monospace;">Utente: ${username}</p>
        <p style="margin:2px 0 0;color:#1a1a1a;font-size:14px;font-family:monospace;">Password: ${password}</p>
      </div>
      <p style="margin:10px 0 0;color:#9ca3af;font-size:12.5px;">Ti consigliamo di cambiare la password al primo accesso.</p>
    `,
    ctaLabel: 'Accedi ora',
    ctaUrl: loginUrl,
  })
}

export function welcomeEmailHtml({ adminName, teamName, appUrl }) {
  return emailShell({
    title: `Benvenuto, ${adminName}!`,
    bodyHtml: `
      <p style="margin:0;color:#4b5563;font-size:14.5px;line-height:1.6;">
        Il tuo account e la squadra <strong>${teamName}</strong> sono pronti. Hai 30 giorni di prova gratuita per iniziare a organizzare magazzino ed eventi con Roadcase.
      </p>
    `,
    ctaLabel: 'Vai alla dashboard',
    ctaUrl: appUrl,
  })
}
