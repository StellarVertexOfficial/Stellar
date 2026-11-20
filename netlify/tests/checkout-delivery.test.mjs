import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { setEnvironmentContext } from '@netlify/blobs';
import { BlobsServer } from '@netlify/blobs/server';
import checkout from '../functions/checkout.mjs';
import { orderStore } from '../functions/lib/checkout.mjs';
import webhook from '../functions/mercadopago-webhook.mjs';

const shop = 'https://stellarvertex.com';
const email = 'mapas+prueba@example.test';
const map = { fecha: '2025-09-16', hora: '20:30', lugar: 'Mérida', titulo: 'Nuestro cielo', msg: '', estilo: 'papel' };

function order() {
  return { folio: randomUUID(), email, items: [{ product: 'mapa-pdf', qty: 1, detail: map.titulo, map }] };
}

function post(body, deployContext = 'production') {
  const origin = deployContext === 'production' ? shop : 'https://preview.example.test';
  return checkout(new Request(origin + '/.netlify/functions/checkout', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }), { deploy: { context: deployContext } });
}

test('cobro y entrega del PDF por Mercado Pago', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'stellar-checkout-'));
  const blobs = new BlobsServer({ directory });
  const { address } = await blobs.start();
  const previousContext = globalThis.netlifyBlobsContext;
  setEnvironmentContext({ edgeURL: address, uncachedEdgeURL: address, siteID: 'test-site', token: 'local' });
  t.after(async () => {
    globalThis.netlifyBlobsContext = previousContext;
    await blobs.stop();
    await rm(directory, { recursive: true, force: true });
  });
  const settings = {
    MERCADOPAGO_MODE: 'production', MERCADOPAGO_ACCESS_TOKEN: 'local-mp',
    MERCADOPAGO_WEBHOOK_SECRET: 'local-webhook', RESEND_API_KEY: 'local-mail',
    STELLAR_EMAIL_FROM: 'StellarVertex <pedidos@stellarvertex.com>',
  };
  for (const [key, value] of Object.entries(settings)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) delete process.env[key];
      else process.env[key] = previous;
    });
  }

  const preferences = [];
  const emails = [];
  let payment;
  let mailAvailable = true;
  const localFetch = globalThis.fetch;
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const request = new Request(input, options);
    const url = new URL(request.url);
    if (url.origin === new URL(address).origin) return localFetch(request);
    if (url.href === 'https://api.mercadopago.com/checkout/preferences') {
      preferences.push(await request.json());
      return Response.json({ id: 'pref-1', collector_id: 7001, init_point: 'https://www.mercadopago.com.mx/checkout/v1/redirect' });
    }
    if (payment && url.href === 'https://api.mercadopago.com/v1/payments/' + payment.id) return Response.json(payment);
    assert.equal(url.href, 'https://api.resend.com/emails');
    emails.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
    return mailAvailable ? Response.json({ id: 'email-1' }) : new Response(null, { status: 503 });
  });

  await t.test('la tienda pública pausa los cobros si falta el correo o si el modo es de prueba', async () => {
    const cart = order();
    process.env.RESEND_API_KEY = ' ';
    const paused = await post(cart);
    assert.equal(paused.status, 503);
    assert.match((await paused.json()).error, /entrega de PDF/);
    assert.equal(await orderStore().get(cart.folio), null);
    process.env.RESEND_API_KEY = settings.RESEND_API_KEY;
    process.env.MERCADOPAGO_MODE = 'test';
    assert.equal((await post(cart)).status, 503);
    process.env.MERCADOPAGO_MODE = 'production';
    assert.equal(preferences.length, 0);
    assert.equal(emails.length, 0);
  });

  await t.test('el regreso verifica el pago y reintenta el envío conservando el folio y el destinatario', async () => {
    const cart = order();
    assert.equal((await post(cart)).status, 200);
    assert.equal(preferences[0].notification_url, shop + '/.netlify/functions/mercadopago-webhook?source_news=webhooks');
    assert.equal(preferences[0].payer.email, cart.email);
    payment = {
      id: 8001, external_reference: cart.folio, transaction_amount: 99, currency_id: 'MXN',
      collector_id: 7001, live_mode: true, status: 'pending', date_last_updated: '2025-09-16T20:31:00Z',
      payer: { email: 'facturacion@example.test' },
    };
    const confirm = () => post({ action: 'confirm', folio: cart.folio, paymentId: '8001' });
    assert.equal((await (await confirm()).json()).status, 'pending');
    assert.equal(emails.length, 0);

    payment.status = 'approved';
    payment.date_last_updated = '2025-09-16T20:32:00Z';
    mailAvailable = false;
    const pending = await confirm();
    assert.equal(pending.status, 200);
    assert.deepEqual(await pending.json(), { folio: cart.folio, amount: 99, status: 'approved', test: false, delivery: 'pending' });
    mailAvailable = true;
    assert.equal((await (await confirm()).json()).delivery, 'sent');
    assert.equal((await (await confirm()).json()).delivery, 'sent');
    assert.equal(emails.length, 2);
    assert.deepEqual(emails[0], emails[1]);
    assert.equal(emails[1].key, 'mapa-estelar/' + cart.folio);
    assert.deepEqual(emails[1].body.to, [cart.email]);
    const attachment = emails[1].body.attachments[0];
    assert.match(attachment.filename, /\.pdf$/);
    assert.equal(Buffer.from(attachment.content, 'base64').subarray(0, 5).toString(), '%PDF-');
    assert.equal((await orderStore().get(cart.folio, { type: 'json' })).delivery.providerId, 'email-1');
  });

  await t.test('el aviso de pago basta para entregar al comprador que cerró la página', async () => {
    const cart = order();
    assert.equal((await post(cart)).status, 200);
    payment = {
      id: 8002, external_reference: cart.folio, transaction_amount: 99, currency_id: 'MXN',
      collector_id: 7001, live_mode: true, status: 'rejected', date_last_updated: '2025-09-16T21:00:00Z',
    };
    const url = new URL(preferences.at(-1).notification_url);
    url.searchParams.set('data.id', String(payment.id));
    const notify = () => {
      const requestId = randomUUID();
      const ts = String(Math.floor(Date.now() / 1000));
      const manifest = `id:${payment.id};request-id:${requestId};ts:${ts};`;
      const signature = createHmac('sha256', settings.MERCADOPAGO_WEBHOOK_SECRET).update(manifest).digest('hex');
      return webhook(new Request(url, {
        method: 'POST', headers: { 'x-request-id': requestId, 'x-signature': `ts=${ts},v1=${signature}` },
      }));
    };
    const attempts = emails.length;
    assert.equal((await notify()).status, 200);
    assert.equal(emails.length, attempts);

    payment.status = 'approved';
    payment.date_last_updated = '2025-09-16T21:01:00Z';
    assert.equal((await notify()).status, 200);
    assert.equal((await notify()).status, 200);
    assert.equal(emails.length, attempts + 1);
    assert.deepEqual(emails.at(-1).body.to, [cart.email]);
    assert.equal(emails.at(-1).key, 'mapa-estelar/' + cart.folio);
    assert.equal((await orderStore().get(cart.folio, { type: 'json' })).delivery.status, 'sent');
  });

  await t.test('una preferencia anterior de sandbox tampoco abre un cobro en la tienda pública', async () => {
    const cart = order();
    await orderStore().setJSON(cart.folio, {
      ...cart, amount: 99, quantity: 1, createdAt: new Date().toISOString(),
      checkoutUrl: 'https://sandbox.mercadopago.com.mx/checkout/v1/redirect', delivery: { status: 'pending' },
    });
    const attempts = preferences.length;
    const response = await post(cart);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { folio: cart.folio, status: 'expired' });
    assert.equal(preferences.length, attempts);
  });
});
