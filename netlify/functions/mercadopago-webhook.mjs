import { createHmac, timingSafeEqual } from 'node:crypto';
import { isPaymentId, json, orderStore, reconcilePayment, replyError } from './lib/checkout.mjs';
import { deliverPaidOrder } from './lib/delivery.mjs';

function signedPaymentId(request, secret) {
  const query = new URL(request.url).searchParams;
  const id = query.get('data.id');
  const requestId = request.headers.get('x-request-id');
  const signature = request.headers.get('x-signature') ?? '';
  const ts = signature.match(/(?:^|,)\s*ts=(\d+)(?:,|$)/)?.[1];
  const v1 = signature.match(/(?:^|,)\s*v1=([a-f0-9]{64})(?:,|$)/i)?.[1];
  if (!isPaymentId(id) || !requestId || !ts || !v1) return null;
  const manifest = `id:${id};request-id:${requestId};ts:${ts};`;
  const expected = createHmac('sha256', secret).update(manifest).digest();
  return timingSafeEqual(expected, Buffer.from(v1, 'hex')) ? id : null;
}

export default async function webhook(request) {
  if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);

  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return json({ error: 'Webhook sin configurar.' }, 503);
  const id = signedPaymentId(request, secret);
  if (!id) return json({ error: 'Firma inválida.' }, 401);

  try {
    const store = orderStore();
    const folio = await reconcilePayment(store, id);
    if (folio) await deliverPaidOrder(store, folio);
    return json({ received: true });
  } catch (error) {
    return replyError(error);
  }
}
