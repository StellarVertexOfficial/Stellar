'use strict';

const params = new URLSearchParams(location.search);
const folio = params.get('folio');
const candidate = params.get('payment_id') || params.get('collection_id');
const paymentId = /^[0-9]{1,24}$/.test(candidate ?? '') ? candidate : null;
const message = document.getElementById('order-message');
const number = document.getElementById('order-number');
const refresh = document.getElementById('order-refresh');
const checkout = '/.netlify/functions/checkout';
let verifiedPayment = false;

function clearPaidCart() {
  try {
    const session = JSON.parse(sessionStorage.getItem('sv_checkout_pending'));
    if (session?.folio !== folio) return;
    if (localStorage.getItem('sv_cart_v1') === session.cartSnapshot) {
      localStorage.removeItem('sv_cart_v1');
    }
    sessionStorage.removeItem('sv_checkout_pending');
  } catch { /* El pedido permanece confirmado aunque falle el almacenamiento local. */ }
}

async function updateOrder() {
  refresh.disabled = true;
  try {
    const shouldVerify = paymentId && !verifiedPayment;
    const response = shouldVerify
      ? await fetch(checkout, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', folio, paymentId }),
        signal: AbortSignal.timeout(12000),
      })
      : await fetch(checkout + '?folio=' + encodeURIComponent(folio), {
        signal: AbortSignal.timeout(12000),
      });
    const order = await response.json();
    if (!response.ok) throw new Error(order.error ?? 'No pudimos consultar el pedido.');
    if (['approved', 'rejected', 'cancelled', 'refunded', 'charged_back'].includes(order.status)) {
      verifiedPayment = true;
      history.replaceState(null, '', '/pedido.html?folio=' + encodeURIComponent(folio));
    }

    number.textContent = 'Folio: ' + order.folio;
    switch (order.status) {
      case 'approved':
        message.textContent = order.test ? 'Pago de prueba aprobado.' : 'Pago confirmado. Enviaremos tu PDF al correo que registraste.';
        clearPaidCart();
        break;
      case 'rejected':
      case 'cancelled':
        message.textContent = 'El pago no se completó. Puedes volver a la tienda e intentarlo de nuevo.';
        break;
      case 'expired':
        message.textContent = 'El enlace de pago venció. Vuelve a la tienda para iniciar otro pago.';
        break;
      case 'refunded':
      case 'charged_back':
        message.textContent = 'Este pago se devolvió. Si necesitas ayuda, comparte el folio con StellarVertex.';
        break;
      default:
        message.textContent = 'Tu pago está pendiente de confirmación. Si ya pagaste, actualiza el estado más tarde. Si cancelaste, puedes volver a la tienda.';
    }
  } catch (error) {
    message.textContent = 'No pudimos consultar el estado del pedido. Intenta actualizarlo.';
  } finally {
    refresh.disabled = false;
  }
}

if (folio) {
  const query = new URLSearchParams({ folio });
  if (paymentId) query.set('payment_id', paymentId);
  history.replaceState(null, '', '/pedido.html?' + query);
  refresh.addEventListener('click', updateOrder);
  updateOrder();
} else {
  message.textContent = 'Falta el folio del pedido.';
  refresh.hidden = true;
}
