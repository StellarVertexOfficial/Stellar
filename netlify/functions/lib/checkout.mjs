import { getStore } from '@netlify/blobs';
import { deliverPaidOrder, emailDeliveryConfigured } from './delivery.mjs';
import { canRenderMap } from './map-pdf.mjs';

const PRICE_MXN = 99;
const LABEL = 'Mapa estelar en PDF';
const PREFERENCE_LIFETIME = 30 * 60 * 1000;
const SHOP_ORIGIN = 'https://stellarvertex.com';
export const isFolio = value => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
export const isPaymentId = value => typeof value === 'string' && /^\d{1,24}$/.test(value);

export class CheckoutError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function json(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export function replyError(error) {
  if (error instanceof CheckoutError) return json({ error: error.message }, error.status);
  console.error('Checkout:', error.name);
  return json({ error: 'El servicio de pago no está disponible por el momento.' }, 502);
}

export function production() {
  return process.env.MERCADOPAGO_MODE === 'production';
}

export function orderStore() {
  return getStore({ name: production() ? 'stellar-orders' : 'stellar-orders-test', consistency: 'strong' });
}

export async function mercadoPago(path, body, idempotencyKey) {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN?.trim();
  if (!token) throw new CheckoutError(503, 'El pago con tarjeta aún no está disponible.');
  const headers = { Authorization: `Bearer ${token}` };
  if (body) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey;

  const response = await fetch(`https://api.mercadopago.com${path}`, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    console.error('Mercado Pago API:', response.status);
    throw new CheckoutError(502, 'Mercado Pago no pudo procesar la solicitud. Intenta de nuevo.');
  }
  return response.json();
}

function invalidOrder() {
  return new CheckoutError(400, 'Revisa el correo y la personalización de los mapas en tu carrito.');
}

function normalizeMap(map) {
  if (map == null) return null; // Carritos guardados antes de la integración.
  if (typeof map !== 'object' || Array.isArray(map)) throw invalidOrder();
  for (const [name, limit] of Object.entries({ fecha: 10, hora: 5, lugar: 50, titulo: 40, msg: 60, estilo: 8 })) {
    if (typeof map[name] !== 'string' || map[name].length > limit) throw invalidOrder();
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(map.fecha) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(map.hora)
    || !map.lugar.trim() || !['noche', 'tinta', 'papel'].includes(map.estilo)) throw invalidOrder();

  const { fecha, hora, lugar, titulo, msg, estilo } = map;
  const result = { fecha, hora, lugar, titulo, msg, estilo };
  if (map.coordenadas != null) {
    const { lat, lon, tz } = map.coordenadas;
    if (![lat, lon, tz].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lon) > 180
      || tz < -12 || tz > 14) throw invalidOrder();
    result.coordenadas = { lat, lon, tz };
  }
  if (typeof map.lineas === 'boolean') result.lineas = map.lineas;
  if (typeof map.horaVisible === 'boolean') result.horaVisible = map.horaVisible;
  return result;
}

function normalizeOrder(body) {
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  if (!isFolio(body?.folio) || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) throw invalidOrder();

  const items = body.items.map(item => {
    if (item?.product !== 'mapa-pdf' || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 30
      || typeof item.detail !== 'string' || item.detail.length > 600 || !item.detail.trim()) throw invalidOrder();
    return { product: item.product, qty: item.qty, detail: item.detail, map: normalizeMap(item.map) };
  });
  const quantity = items.reduce((total, item) => total + item.qty, 0);
  if (quantity > 30) throw new CheckoutError(400, 'El máximo es de 30 mapas por pedido.');
  return { folio: body.folio, email, items, quantity, amount: quantity * PRICE_MXN };
}

function requireCheckoutConfiguration(live, origin, deployContext) {
  const publicShop = deployContext === 'production' || origin === SHOP_ORIGIN || origin === 'https://www.stellarvertex.com';
  if ((publicShop && !live) || !process.env.MERCADOPAGO_ACCESS_TOKEN?.trim()
    || (live && !process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim())) {
    throw new CheckoutError(503, 'El pago con tarjeta aún no está disponible.');
  }
  if (live && !emailDeliveryConfigured()) {
    throw new CheckoutError(503, 'La entrega de PDF por correo está temporalmente pausada. Tu carrito sigue guardado.');
  }
}

function existingPayment(order, input, live) {
  if (order.email !== input.email || JSON.stringify(order.items) !== JSON.stringify(input.items)) {
    throw new CheckoutError(409, 'El carrito cambió. Vuelve a iniciar el pago.');
  }
  if (order.payment && !['rejected', 'cancelled'].includes(order.payment.status)) {
    return { folio: order.folio, status: order.payment.status };
  }
  if (Date.parse(order.createdAt) + PREFERENCE_LIFETIME <= Date.now()
    || (live && order.checkoutUrl?.startsWith('https://sandbox.'))) {
    return { folio: order.folio, status: 'expired' };
  }
  return null;
}

async function createPreference(order, origin, live) {
  const { folio, email, quantity } = order;
  const expiresAt = new Date(Date.parse(order.createdAt) + PREFERENCE_LIFETIME).toISOString();
  const back = new URL('/pedido.html', origin);
  back.searchParams.set('folio', folio);
  const preference = await mercadoPago('/checkout/preferences', {
    external_reference: folio,
    items: [{ id: 'mapa-pdf', title: LABEL, currency_id: 'MXN', quantity, unit_price: PRICE_MXN }],
    payer: { email },
    payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'bank_transfer' }], installments: 1 },
    back_urls: { success: back.href, pending: back.href, failure: back.href },
    ...(live && { notification_url: SHOP_ORIGIN + '/.netlify/functions/mercadopago-webhook?source_news=webhooks' }),
    auto_return: 'approved',
    expires: true,
    expiration_date_to: expiresAt,
  }, folio);
  const checkoutUrl = preference[live ? 'init_point' : 'sandbox_init_point'];
  let redirect;
  try { redirect = new URL(checkoutUrl); } catch { /* Respuesta incompleta del proveedor. */ }
  if (!redirect || redirect.protocol !== 'https:' || redirect.username || redirect.password
    || !['www.mercadopago.com.mx', 'sandbox.mercadopago.com.mx', 'www.mercadopago.com', 'sandbox.mercadopago.com'].includes(redirect.hostname)
    || (live && redirect.hostname.startsWith('sandbox.'))
    || preference.collector_id == null || !preference.id) {
    throw new CheckoutError(502, 'Mercado Pago no devolvió un enlace de pago válido.');
  }

  return {
    checkoutUrl: redirect.href,
    preferenceId: preference.id,
    collectorId: String(preference.collector_id),
  };
}

export async function createCheckout(store, body, origin, deployContext) {
  const input = normalizeOrder(body);
  const { folio } = input;
  const live = production();
  let saved = await store.getWithMetadata(folio, { type: 'json' });
  if (saved?.data) {
    const result = existingPayment(saved.data, input, live);
    if (result) return result;
  }
  requireCheckoutConfiguration(live, origin, deployContext);
  if (live && !input.items.every(item => canRenderMap(item.map))) {
    throw new CheckoutError(400, 'Quita del carrito los mapas que falten por personalizar y agrégalos de nuevo desde el generador.');
  }
  if (!saved?.data) {
    const initial = { ...input, createdAt: new Date().toISOString(), payment: null };
    if (live) initial.delivery = { status: 'pending' };
    await store.setJSON(folio, initial, { onlyIfNew: true });
    saved = await store.getWithMetadata(folio, { type: 'json' });
    if (!saved?.data) throw new CheckoutError(503, 'No pudimos guardar el pedido. Intenta de nuevo.');
    const result = existingPayment(saved.data, input, live);
    if (result) return result;
  }
  const order = saved.data;
  if (order.checkoutUrl && (!live || order.delivery)) return { folio, url: order.checkoutUrl };

  const ready = { ...order };
  if (!ready.checkoutUrl) Object.assign(ready, await createPreference(order, origin, live));
  if (live && !ready.delivery) ready.delivery = { status: 'pending' };
  const write = await store.setJSON(folio, ready, { onlyIfMatch: saved.etag });
  if (write.modified) return { folio, url: ready.checkoutUrl };
  const current = await store.get(folio, { type: 'json' });
  if (current) {
    const result = existingPayment(current, input, live);
    if (result) return result;
    if (current.checkoutUrl && (!live || current.delivery)) return { folio, url: current.checkoutUrl };
  }
  throw new CheckoutError(409, 'No se pudo preparar el pago. Intenta de nuevo.');
}

export async function reconcilePayment(store, paymentId, expectedFolio) {
  if (!isPaymentId(paymentId)) return;
  const payment = await mercadoPago(`/v1/payments/${paymentId}`);
  const folio = payment.external_reference;
  if (!isFolio(folio) || (expectedFolio && folio !== expectedFolio)
    || String(payment.id) !== paymentId || payment.live_mode !== production() || payment.currency_id !== 'MXN'
    || typeof payment.transaction_amount !== 'number' || !Number.isFinite(payment.transaction_amount)) return;

  for (let attempt = 0; attempt < 3; attempt++) {
    const saved = await store.getWithMetadata(folio, { type: 'json' });
    const order = saved?.data;
    if (!order?.preferenceId || order.collectorId !== String(payment.collector_id)
      || payment.transaction_amount !== order.amount) return;
    const tracked = order.payment;
    const updated = payment.date_last_updated;
    if (!Number.isFinite(Date.parse(updated))) return;
    if (tracked?.id === paymentId && (
      Date.parse(updated) < Date.parse(tracked.updatedAt)
      || (tracked.status === payment.status && tracked.updatedAt === updated)
    )) return folio;
    // Los intentos fallidos de un segundo pago no sustituyen uno ya liquidado.
    if (tracked && tracked.id !== paymentId && (
      ['approved', 'refunded', 'charged_back'].includes(tracked.status)
      || (payment.status !== 'approved' && Date.parse(updated) <= Date.parse(tracked.updatedAt))
    )) return;

    const result = await store.setJSON(folio, {
      ...order,
      payment: { id: paymentId, status: payment.status, updatedAt: updated },
    }, { onlyIfMatch: saved.etag });
    if (result.modified) return folio;
  }
  throw new CheckoutError(503, 'La confirmación del pago está en curso.');
}

export async function confirmPaymentAndDeliver(store, paymentId, expectedFolio) {
  const verifiedFolio = await reconcilePayment(store, paymentId, expectedFolio);
  if (verifiedFolio && production()) await deliverPaidOrder(store, verifiedFolio);
}

export async function publicOrder(store, folio) {
  if (!isFolio(folio)) return null;
  const order = await store.get(folio, { type: 'json' });
  if (!order) return null;
  const status = order.payment?.status
    ?? (Date.now() > Date.parse(order.createdAt) + PREFERENCE_LIFETIME ? 'expired' : 'pending');
  const summary = { folio, amount: order.amount, status, test: !production() };
  if (status === 'approved' && order.delivery) summary.delivery = order.delivery.status;
  return summary;
}
