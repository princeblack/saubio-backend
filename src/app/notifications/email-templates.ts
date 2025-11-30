interface RenderedEmailTemplate {
  subject: string;
  text: string;
  html: string;
}

type TemplateRenderer = (payload: Record<string, unknown>) => RenderedEmailTemplate | null;

const templateRenderers: Record<string, TemplateRenderer> = {
  'payments.sepa.succeeded': (payload) => buildSepaEmail(payload, 'success'),
  'payments.sepa.processing': (payload) => buildSepaEmail(payload, 'processing'),
  'payments.sepa.failed': (payload) => buildSepaEmail(payload, 'failed'),
  'client.welcome': renderClientWelcome,
  'booking.short_notice.accepted': renderShortNoticeAccepted,
  'ops.short_notice.accepted': renderOpsShortNoticeAccepted,
  'booking.short_notice.confirmed': renderShortNoticeConfirmed,
  'billing.invoice.generated': renderInvoiceGenerated,
  'booking.payment.confirmed': renderPaymentConfirmed,
};

export function renderEmailTemplate(template: string, payload: Record<string, unknown>) {
  const renderer = templateRenderers[template];
  return renderer ? renderer(payload) : null;
}

function buildSepaEmail(
  payload: Record<string, unknown>,
  status: 'success' | 'processing' | 'failed'
): RenderedEmailTemplate | null {
  const bookingId = stringValue(payload.bookingId);
  const paymentId = stringValue(payload.paymentId);
  const amount = formatMoney(payload);
  const statusMessage = stringValue(payload.message);

  const bookingSentence = bookingId ? ` pour la reservation ${bookingId}` : '';
  const paymentSentence = paymentId ? ` (paiement ${paymentId})` : '';
  const amountSentence = amount ? ` de ${amount}` : '';

  const intro = 'Bonjour,';
  let body: string;
  let subject: string;

  switch (status) {
    case 'success': {
      subject = 'Confirmation paiement SEPA';
      body = `Nous confirmons la reception de votre paiement SEPA${amountSentence}${bookingSentence}${paymentSentence}.`;
      break;
    }
    case 'processing': {
      subject = 'Paiement SEPA en cours';
      body = `Votre paiement SEPA${amountSentence}${bookingSentence}${paymentSentence} est en cours de traitement.`;
      break;
    }
    case 'failed': {
      subject = 'Action requise - Paiement SEPA';
      body = `Nous n'avons pas pu finaliser votre paiement SEPA${amountSentence}${bookingSentence}${paymentSentence}.`;
      break;
    }
    default:
      return null;
  }

  const outro =
    status === 'failed'
      ? 'Merci de verifier vos informations bancaires ou de nous contacter si le probleme persiste.'
      : 'Nous vous informerons lors de la prochaine mise a jour.';
  const signature = 'Equipe Saubio';

  const paragraphs = [intro, body];
  if (statusMessage) {
    paragraphs.push(statusMessage);
  }
  paragraphs.push(outro, signature);

  const text = paragraphs.join('\n\n');
  const html = paragraphsToHtml(text);

  return { subject, text, html };
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length ? value : null;
}

function formatMoney(payload: Record<string, unknown>) {
  if (typeof payload.amountCents !== 'number') {
    return null;
  }
  const currency = stringValue(payload.currency) ?? 'EUR';
  const amount = payload.amountCents / 100;
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function paragraphsToHtml(text: string) {
  return text
    .split('\n\n')
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, '<br />')}</p>`)
    .join('');
}

function renderClientWelcome(payload: Record<string, unknown>): RenderedEmailTemplate {
  const firstName = stringValue(payload.firstName) ?? 'Client Saubio';
  const dashboardUrl = stringValue(payload.dashboardUrl) ?? stringValue(payload.appUrl) ?? 'http://localhost:4200';

  const subject = 'Bienvenue sur Saubio';
  const paragraphs = [
    `Bonjour ${firstName},`,
    "Merci d'avoir rejoint Saubio. Votre espace client est prêt et vous pouvez suivre vos missions, télécharger vos factures et discuter avec l’équipe Ops à tout moment.",
    `Accédez dès maintenant à votre tableau de bord : ${dashboardUrl}`,
    'Besoin d’aide ? Répondez simplement à cet e-mail, notre équipe vous répond sous 24 h.',
    '— Équipe Saubio',
  ];

  const text = paragraphs.join('\n\n');
  const html = paragraphsToHtml(text);
  return { subject, text, html };
}

function renderShortNoticeAccepted(payload: Record<string, unknown>): RenderedEmailTemplate {
  const clientName = stringValue(payload.clientName) ?? 'Client';
  const providerName = stringValue(payload.providerName) ?? 'Votre prestataire';
  const bookingId = stringValue(payload.bookingId) ?? '';
  const amount = formatMoney(payload);
  const dateText = stringValue(payload.startAt)
    ? `le ${new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'full',
        timeStyle: 'short',
      }).format(new Date(payload.startAt as string))}`
    : '';

  const subject = `Confirmation Saubio – ${providerName} arrive bientôt`;
  const paragraphs = [
    `Bonjour ${clientName},`,
    `${providerName} a accepté votre demande urgente${bookingId ? ` (#${bookingId})` : ''} ${dateText}.`,
    amount
      ? `Un blocage temporaire de ${amount} est confirmé; le montant final sera débité après la mission.`
      : 'Le montant sera débité après la mission.',
    'Vous recevrez un rappel et une facture une fois la prestation terminée.',
    '— Équipe Saubio',
  ];

  const text = paragraphs.join('\n\n');
  const html = paragraphsToHtml(text);
  return { subject, text, html };
}

function renderOpsShortNoticeAccepted(payload: Record<string, unknown>): RenderedEmailTemplate {
  const bookingId = stringValue(payload.bookingId) ?? '';
  const clientName = stringValue(payload.clientName) ?? 'Client';
  const providerName = stringValue(payload.providerName) ?? 'Prestataire';
  const amount = formatMoney(payload);
  const postalCode = stringValue(payload.postalCode) ?? '—';
  const startAt = stringValue(payload.startAt);

  const subject = `[Ops] Acceptation short notice ${bookingId ? `– ${bookingId}` : ''}`;
  const paragraphs = [
    'Bonjour équipe Ops,',
    `${providerName} a accepté une mission short notice pour ${clientName} (code postal ${postalCode}).`,
    startAt ? `Créneau confirmé : ${new Date(startAt).toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' })}.` : '',
    amount ? `Montant retenu : ${amount}.` : '',
    'Merci de vérifier la disponibilité finale et mettre à jour le dossier si nécessaire.',
  ].filter(Boolean);

  const text = paragraphs.join('\n\n');
  const html = paragraphsToHtml(text);
  return { subject, text, html };
}

function renderShortNoticeConfirmed(payload: Record<string, unknown>): RenderedEmailTemplate {
  const clientName = stringValue(payload.clientName) ?? 'Client';
  const bookingId = stringValue(payload.bookingId) ?? '';
  const service = stringValue(payload.service) ?? 'Votre mission';
  const city = stringValue(payload.city) ?? '';
  const startAt = stringValue(payload.startAt)
    ? `le ${new Intl.DateTimeFormat('fr-FR', {
        dateStyle: 'full',
        timeStyle: 'short',
      }).format(new Date(payload.startAt as string))}`
    : '';
  const amount = formatMoney(payload);
  const invoiceUrl = stringValue(payload.invoiceUrl);
  const invoiceNumber = stringValue(payload.invoiceNumber);

  const subject = 'Confirmation finale de votre mission Saubio';
  const paragraphs = [
    `Bonjour ${clientName},`,
    `Votre mission short notice ${bookingId ? `(#${bookingId}) ` : ''}${startAt} est confirmée avec votre prestataire ${service}${city ? ` à ${city}` : ''}.`,
    amount
      ? `Le montant final de ${amount} va être débité automatiquement et sécurisé jusqu’à la fin de la prestation.`
      : 'Le montant final va être débité automatiquement et sécurisé jusqu’à la fin de la prestation.',
    invoiceNumber
      ? `Votre facture ${invoiceNumber} est disponible immédiatement.`
      : 'Votre facture est disponible immédiatement.',
    invoiceUrl ? `Téléchargez-la ici : ${invoiceUrl}` : '',
    'Merci pour votre confiance et à très vite sur Saubio.',
    '— Équipe Saubio',
  ].filter(Boolean) as string[];

  const text = paragraphs.join('\n\n');
  const html = paragraphsToHtml(text);
  return { subject, text, html };
}

function renderInvoiceGenerated(payload: Record<string, unknown>): RenderedEmailTemplate {
  const firstName = stringValue(payload.firstName) ?? 'Client';
  const bookingId = stringValue(payload.bookingId);
  const invoiceNumber = stringValue(payload.invoiceNumber);
  const invoiceUrl = stringValue(payload.documentUrl) ?? stringValue(payload.invoiceUrl);
  const amount = formatMoney(payload);

  const subject = invoiceNumber ? `Votre facture ${invoiceNumber}` : 'Votre facture Saubio';
  const bookingSegment = bookingId ? ` pour la réservation ${bookingId}` : '';
  const amountSentence = amount ? `Nous avons finalisé votre paiement de ${amount}${bookingSegment}.` : `Nous avons finalisé votre paiement${bookingSegment}.`;
  const downloadSentence = invoiceUrl
    ? `Téléchargez votre facture ici : ${invoiceUrl}`
    : 'Votre facture est disponible depuis votre espace client.';

  const paragraphs = [
    `Bonjour ${firstName},`,
    amountSentence,
    downloadSentence,
    'Merci pour votre confiance et à bientôt sur Saubio.',
    '— Équipe Saubio',
  ];

  const text = paragraphs.join('\n\n');
  const html = paragraphsToHtml(text);
  return { subject, text, html };
}

function renderPaymentConfirmed(payload: Record<string, unknown>): RenderedEmailTemplate {
  const clientName = stringValue(payload.clientName) ?? 'Client';
  const bookingId = stringValue(payload.bookingId) ?? '';
  const amount = formatMoney(payload);
  const shortNotice = Boolean(payload.shortNotice);

  const subject = shortNotice
    ? `Blocage confirmé${bookingId ? ` – ${bookingId}` : ''}`
    : `Paiement confirmé${bookingId ? ` – ${bookingId}` : ''}`;

  const paragraphs = [
    `Bonjour ${clientName},`,
    shortNotice
      ? `Nous confirmons le blocage temporaire de votre acompte${amount ? ` de ${amount}` : ''}${bookingId ? ` pour la réservation ${bookingId}` : ''}.`
      : `Votre paiement${amount ? ` de ${amount}` : ''}${bookingId ? ` pour la réservation ${bookingId}` : ''} est confirmé.`,
    stringValue(payload.nextSteps) ??
      'Notre équipe Ops finalise les derniers détails et vous tiendra informé.',
    '— Équipe Saubio',
  ];

  const text = paragraphs.join('\n\n');
  const html = paragraphsToHtml(text);
  return { subject, text, html };
}
