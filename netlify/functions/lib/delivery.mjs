import { randomUUID } from 'node:crypto';
import { buildOrderPdf } from './map-pdf.mjs';

const LEASE_MS = 60000;
// Resend conserva la clave de idempotencia durante 24 horas.
const RETRY_WINDOW_MS = 23 * 60 * 60 * 1000;
const DEFAULT_FROM = 'StellarVertex <pedidos@stellarvertex.com>';

export function emailDeliveryConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

async function sendOrder(order) {
  const pdf = await buildOrderPdf(order);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `mapa-estelar/${order.folio}`,
    },
    body: JSON.stringify({
      from: process.env.STELLAR_EMAIL_FROM?.trim() || DEFAULT_FROM,
      to: [order.email],
      subject: 'Tu mapa estelar de StellarVertex',
      text: [
        'Gracias por tu compra. Adjuntamos tu mapa estelar en PDF para imprimir a 30 × 40 cm.',
        `Folio del pedido: ${order.folio}`,
        'Si necesitas ayuda, escríbenos a contacto@stellarvertex.mx e incluye tu folio.',
      ].join('\n\n'),
      attachments: [{ filename: 'mapa-estelar-stellarvertex.pdf', content: pdf.toString('base64') }],
    }),
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) {
    console.error('Resend:', response.status, order.folio);
    throw new Error('No se pudo enviar el mapa.');
  }
  const { id } = await response.json();
  if (typeof id !== 'string' || !id) throw new Error('Resend no devolvió el identificador del correo.');
  return id;
}

async function recordDelivery(store, folio, attemptId, delivery) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const saved = await store.getWithMetadata(folio, { type: 'json' });
    if (saved?.data.delivery?.attemptId !== attemptId) return;
    const result = await store.setJSON(folio, { ...saved.data, delivery }, { onlyIfMatch: saved.etag });
    if (result.modified) return;
  }
  throw new Error('El estado de entrega cambió durante el envío.');
}

export async function deliverPaidOrder(store, folio) {
  const saved = await store.getWithMetadata(folio, { type: 'json' });
  const order = saved?.data;
  const delivery = order?.delivery;
  if (order?.payment?.status !== 'approved' || !delivery || ['sent', 'review'].includes(delivery.status)) return;

  const now = Date.now();
  if (delivery.leaseUntil > now) throw new Error('Ya hay un envío en curso.');
  if (delivery.firstAttemptAt && now - delivery.firstAttemptAt >= RETRY_WINDOW_MS) {
    const result = await store.setJSON(folio, {
      ...order, delivery: { status: 'review', firstAttemptAt: delivery.firstAttemptAt },
    }, { onlyIfMatch: saved.etag });
    if (!result.modified) throw new Error('El estado de entrega cambió.');
    console.error('Entrega requiere revisión:', folio);
    return;
  }
  if (!emailDeliveryConfigured()) throw new Error('Falta la configuración de correo.');

  const attemptId = randomUUID();
  const firstAttemptAt = delivery.firstAttemptAt ?? now;
  const lock = await store.setJSON(folio, {
    ...order, delivery: { status: 'pending', firstAttemptAt, attemptId, leaseUntil: now + LEASE_MS },
  }, { onlyIfMatch: saved.etag });
  if (!lock.modified) throw new Error('El estado de entrega cambió.');

  let providerId;
  try {
    providerId = await sendOrder(order);
  } catch (error) {
    await recordDelivery(store, folio, attemptId, { status: 'pending', firstAttemptAt });
    throw error;
  }
  await recordDelivery(store, folio, attemptId, { status: 'sent', providerId, sentAt: new Date().toISOString() });
}
