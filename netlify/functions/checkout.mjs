import { confirmPaymentAndDeliver, createCheckout, isFolio, json, orderStore, publicOrder, replyError } from './lib/checkout.mjs';

export default async function checkout(request, context) {
  const url = new URL(request.url);
  try {
    if (request.method === 'GET') {
      const order = await publicOrder(orderStore(), url.searchParams.get('folio'));
      return order ? json(order) : json({ error: 'No encontramos ese pedido.' }, 404);
    }
    if (request.method !== 'POST') return json({ error: 'Método no permitido.' }, 405);
    if (!request.headers.get('content-type')?.startsWith('application/json')) {
      return json({ error: 'Solicitud inválida.' }, 415);
    }
    const raw = await request.text();
    if (raw.length > 40000) return json({ error: 'El pedido supera el tamaño permitido.' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: 'Solicitud inválida.' }, 400); }
    if (!isFolio(body?.folio)) return json({ error: 'Folio inválido.' }, 400);

    const store = orderStore();
    if (body.action === 'confirm') {
      const order = await publicOrder(store, body.folio);
      if (!order) return json({ error: 'No encontramos ese pedido.' }, 404);
      try {
        await confirmPaymentAndDeliver(store, body.paymentId, body.folio);
      } catch (error) {
        // Un fallo del correo no cambia el pago ya aprobado por Mercado Pago.
        const current = await publicOrder(store, body.folio);
        if (current?.status !== 'approved') throw error;
        console.error('Envío pendiente al regresar del pago:', body.folio, error.name);
        return json(current);
      }
      return json(await publicOrder(store, body.folio));
    }
    return json(await createCheckout(store, body, url.origin, context?.deploy?.context));
  } catch (error) {
    return replyError(error);
  }
}
