/* ============================================================
   CART SYSTEM — StellarVertex
   Vanilla JS · localStorage · Checkout Pro
   ============================================================ */

(function () {
  'use strict';

  /* ────────────────────────────────────────────
     CONFIG
     ──────────────────────────────────────────── */
  const EMAIL    = 'contacto@stellarvertex.mx';
  const STORAGE  = 'sv_cart_v1';
  const CHECKOUT_SESSION = 'sv_checkout_pending';
  let pendingCheckout;

  /* ────────────────────────────────────────────
     ESTADO
     ──────────────────────────────────────────── */
  let cartItems = loadFromStorage();

  /* ────────────────────────────────────────────
     PERSISTENCIA
     ──────────────────────────────────────────── */
  function isValidItem(item) {
    return item
      && typeof item.id === 'string' && item.id.length > 0
      && typeof item.name === 'string' && item.name.length > 0
      && typeof item.detail === 'string' && typeof item.icon === 'string'
      && Number.isSafeInteger(item.price) && item.price > 0
      && Number.isSafeInteger(item.qty) && item.qty > 0
      && Number.isSafeInteger(item.price * item.qty);
  }

  function loadFromStorage() {
    try {
      const items = JSON.parse(localStorage.getItem(STORAGE));
      return Array.isArray(items) ? items.filter(isValidItem) : [];
    } catch {
      return [];
    }
  }

  function persist() {
    try {
      localStorage.setItem(STORAGE, JSON.stringify(cartItems));
    } catch {
      /* sin soporte de localStorage — modo sin persistencia */
    }
  }

  /* ────────────────────────────────────────────
     OPERACIONES DEL CARRITO
     ──────────────────────────────────────────── */
  function addItem(product) {
    const existing = cartItems.find(i => i.id === product.id);
    if (existing) {
      changeQty(existing.id, 1);
    } else {
      cartItems.push(product);
      persist();
      render();
    }
    showToast(`${product.name} agregado al carrito`);
  }

  function removeItem(id) {
    cartItems = cartItems.filter(i => i.id !== id);
    persist();
    render();
  }

  function changeQty(id, delta) {
    const item = cartItems.find(i => i.id === id);
    if (!item) return;
    const newQty = item.qty + delta;
    if (newQty <= 0) {
      removeItem(id);
    } else if (Number.isSafeInteger(newQty * item.price)) {
      item.qty = newQty;
      persist();
      render();
    }
  }

  function clearCart() {
    cartItems = [];
    persist();
    render();
  }

  /* ────────────────────────────────────────────
     CÁLCULOS
     ──────────────────────────────────────────── */
  function totalItems() {
    return cartItems.reduce((n, i) => n + i.qty, 0);
  }

  function totalPrice() {
    return cartItems.reduce((n, i) => n + i.price * i.qty, 0);
  }

  function formatMXN(n) {
    return n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  /* ────────────────────────────────────────────
     CONSTRUCCIÓN DEL DOM
     ──────────────────────────────────────────── */
  function buildDOM() {
    /* Overlay */
    const overlay = document.createElement('div');
    overlay.className = 'cart-overlay';
    overlay.id = 'svCartOverlay';

    /* Drawer */
    const drawer = document.createElement('aside');
    drawer.className = 'cart-drawer';
    drawer.id = 'svCartDrawer';
    drawer.setAttribute('aria-label', 'Carrito de compras');
    drawer.innerHTML = `
      <div class="cart-drawer__header">
        <div class="cart-drawer__header-meta">
          <span class="label">Tu Pedido</span>
          <h3>Carrito</h3>
        </div>
        <button class="cart-drawer__close" id="svCartClose" aria-label="Cerrar carrito">✕</button>
      </div>
      <div class="cart-drawer__body" id="svCartBody"></div>
      <template id="svCartItemTemplate">
        <div class="cart-item">
          <div class="cart-item__icon"></div>
          <div class="cart-item__info">
            <div class="cart-item__name"></div>
            <div class="cart-item__detail"></div>
            <div class="cart-item__price">
              <span>MXN</span>
              <span class="cart-item__unit-price" style="color:var(--text-muted);font-size:0.6rem;margin-left:4px;"></span>
            </div>
          </div>
          <div class="cart-item__controls">
            <div class="cart-item__qty">
              <button type="button" class="cart-item__qty-btn" data-sv-action="dec" aria-label="Reducir cantidad">−</button>
              <span class="cart-item__qty-num"></span>
              <button type="button" class="cart-item__qty-btn" data-sv-action="inc" aria-label="Aumentar cantidad">+</button>
            </div>
            <button type="button" class="cart-item__remove" data-sv-action="del">Eliminar</button>
          </div>
        </div>
      </template>
      <div class="cart-drawer__footer" id="svCartFooter" style="display:none;">
        <div class="cart-summary">
          <span class="cart-summary__label">Total</span>
          <span class="cart-summary__value" id="svCartTotal">$0 <span>MXN</span></span>
        </div>
        <form class="cart-payment" id="svCartPayment">
          <label for="svCartDeliveryEmail">Correo para recibir tu PDF</label>
          <input type="email" id="svCartDeliveryEmail" name="email" autocomplete="email" maxlength="254"
            placeholder="tu@correo.com" required aria-describedby="svCartPaymentMessage">
          <button type="submit" class="btn btn--pay" id="svCartPay">Pagar ahora</button>
          <p class="cart-payment__hint">Paga con tarjeta en Mercado Pago.</p>
          <p class="cart-payment__message" id="svCartPaymentMessage" role="status"></p>
        </form>
        <button class="btn btn--ghost" id="svCartCrypto" style="width:100%;justify-content:center;border-color:rgba(125,211,125,0.2);color:#7DD37D;">
          <span style="font-size:14px;line-height:1;">◎</span>
          Pagar con Solana / USDC
        </button>
        <div class="cart-footer-alt">
          <button class="btn btn--ghost" id="svCartEmail">Pedir por correo</button>
          <button class="btn btn--ghost" id="svCartClear">Vaciar</button>
        </div>
      </div>`;

    /* Toast */
    const toast = document.createElement('div');
    toast.className = 'cart-toast';
    toast.id = 'svCartToast';
    toast.innerHTML = `
      <span class="cart-toast__check">✓</span>
      <span id="svCartToastMsg">Producto agregado</span>`;

    document.body.append(overlay, drawer, toast);
  }

  /* ────────────────────────────────────────────
     EVENTOS
     ──────────────────────────────────────────── */
  function bindEvents() {
    /* Cerrar drawer */
    document.getElementById('svCartOverlay').addEventListener('click', closeDrawer);
    document.getElementById('svCartClose').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') closeDrawer();
    });

    /* Checkout */
    document.getElementById('svCartPayment').addEventListener('submit', checkoutCard);
    const cryptoButton = document.getElementById('svCartCrypto');
    if (typeof StellarPay === 'undefined') cryptoButton.hidden = true;
    else cryptoButton.addEventListener('click', checkoutCrypto);
    document.getElementById('svCartEmail').addEventListener('click', checkoutEmail);
    document.getElementById('svCartClear').addEventListener('click', () => {
      if (totalItems() === 0) return;
      if (confirm('¿Vaciar el carrito?')) clearCart();
    });

    /* Delegación en el body del drawer — cantidades y eliminar */
    document.getElementById('svCartBody').addEventListener('click', e => {
      const btn = e.target.closest('[data-sv-action]');
      if (!btn) return;
      const action = btn.dataset.svAction;
      const id     = btn.dataset.svId;
      if (action === 'inc') changeQty(id, +1);
      if (action === 'dec') changeQty(id, -1);
      if (action === 'del') removeItem(id);
    });

    /* Botones "Agregar al carrito" en el catálogo */
    document.querySelectorAll('.btn-add-cart').forEach(btn => {
      btn.addEventListener('click', handleAddClick);
    });

    /* Trigger del carrito en la nav */
    const trigger = document.getElementById('svCartTrigger');
    if (trigger) trigger.addEventListener('click', openDrawer);
  }

  function handleAddClick(e) {
    const btn = e.currentTarget;
    const product = {
      id:     btn.dataset.productId,
      name:   btn.dataset.productName,
      price:  Number(btn.dataset.productPrice),
      detail: btn.dataset.productDetail || '',
      icon:   btn.dataset.productIcon   || '📦',
      qty:    1,
      map:    btn.stellarMap ?? null,
    };

    if (!isValidItem(product)) return;

    addItem(product);

    /* Feedback visual en el botón */
    const original = btn.textContent;
    btn.textContent = '✓ Agregado';
    btn.classList.add('added');
    setTimeout(() => {
      btn.textContent = original;
      btn.classList.remove('added');
    }, 1800);
  }

  /* ────────────────────────────────────────────
     ABRIR / CERRAR DRAWER
     ──────────────────────────────────────────── */
  function openDrawer() {
    document.getElementById('svCartDrawer').classList.add('open');
    document.getElementById('svCartOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    document.getElementById('svCartDrawer').classList.remove('open');
    document.getElementById('svCartOverlay').classList.remove('open');
    document.body.style.overflow = '';
  }

  /* ────────────────────────────────────────────
     RENDER
     ──────────────────────────────────────────── */
  function render() {
    const body    = document.getElementById('svCartBody');
    const footer  = document.getElementById('svCartFooter');
    const count   = document.getElementById('svCartCount');
    const total   = document.getElementById('svCartTotal');
    const trigger = document.getElementById('svCartTrigger');

    const n = totalItems();

    /* Badge del trigger */
    if (count) {
      count.textContent = n;
      count.classList.toggle('hidden', n === 0);
    }
    if (trigger) trigger.classList.toggle('has-items', n > 0);

    /* Sin productos */
    if (cartItems.length === 0) {
      if (footer) footer.style.display = 'none';
      if (body) body.innerHTML = `
        <div class="cart-empty">
          <div class="cart-empty__icon">🛒</div>
          <h4>Tu carrito está vacío</h4>
          <p>Explora el catálogo y agrega los equipos que te interesan.</p>
        </div>`;
      return;
    }

    if (body) {
      const template = document.getElementById('svCartItemTemplate');
      const rows = cartItems.map(item => {
        const row = template.content.firstElementChild.cloneNode(true);

        row.dataset.cartId = item.id;
        row.querySelector('.cart-item__icon').textContent = item.icon;
        row.querySelector('.cart-item__name').textContent = item.name;
        row.querySelector('.cart-item__detail').textContent = item.detail;
        row.querySelector('.cart-item__qty-num').textContent = item.qty;
        row.querySelector('.cart-item__price').prepend(`$${formatMXN(item.price * item.qty)} `);
        const unitPrice = row.querySelector('.cart-item__unit-price');
        unitPrice.hidden = item.qty === 1;
        unitPrice.textContent = `($${formatMXN(item.price)} c/u)`;
        row.querySelectorAll('[data-sv-action]').forEach(button => {
          button.dataset.svId = item.id;
        });
        return row;
      });
      body.replaceChildren(...rows);
    }

    /* Total */
    if (total) {
      total.firstChild.textContent = `$${formatMXN(totalPrice())} `;
    }
    if (footer) footer.style.display = 'flex';
  }

  /* ────────────────────────────────────────────
     TOAST
     ──────────────────────────────────────────── */
  let toastTimer = null;
  function showToast(msg) {
    const toast = document.getElementById('svCartToast');
    const msgEl = document.getElementById('svCartToastMsg');
    if (!toast) return;
    msgEl.textContent = msg;
    toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('visible'), 2400);
  }

  async function checkoutCard(event) {
    event.preventDefault();
    if (cartItems.length === 0) return;
    const form = event.currentTarget;
    const pay = document.getElementById('svCartPay');
    const message = document.getElementById('svCartPaymentMessage');
    if (pay.disabled) return;

    const payload = {
      email: form.elements.email.value.trim(),
      items: cartItems.map(item => ({
        product: /^mapa-pdf(?:-[0-9a-z]+)?$/.test(item.id) ? 'mapa-pdf' : null,
        qty: item.qty,
        detail: item.detail,
        map: item.map ?? null,
      })),
    };
    const cartSnapshot = JSON.stringify(cartItems);
    try {
      pendingCheckout ??= JSON.parse(sessionStorage.getItem(CHECKOUT_SESSION));
    } catch { /* El pago también funciona sin almacenamiento de sesión. */ }
    const attempt = JSON.stringify(payload);
    const folio = pendingCheckout?.attempt === attempt
      ? pendingCheckout.folio
      : crypto.randomUUID();
    pendingCheckout = { folio, attempt, cartSnapshot };
    try {
      sessionStorage.setItem(CHECKOUT_SESSION, JSON.stringify(pendingCheckout));
    } catch { /* Conserva el folio en memoria para reintentar. */ }

    pay.disabled = true;
    pay.textContent = 'Abriendo Mercado Pago…';
    message.textContent = '';
    try {
      const response = await fetch('/.netlify/functions/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, folio }),
        signal: AbortSignal.timeout(15000),
      });
      const result = await response.json();
      if (!response.ok) {
        message.textContent = result.error || 'No pudimos iniciar el pago. Intenta de nuevo.';
      } else if (result.status === 'expired') {
        pendingCheckout = null;
        try { sessionStorage.removeItem(CHECKOUT_SESSION); } catch { /* Sin acceso a la sesión. */ }
        message.textContent = 'El enlace venció. Pulsa Pagar ahora para crear otro.';
      } else if (result.url) {
        location.assign(result.url);
        return;
      } else {
        location.assign('/pedido.html?folio=' + encodeURIComponent(folio));
        return;
      }
    } catch {
      message.textContent = 'No pudimos comunicarnos con el servicio de pago. Tu carrito sigue guardado.';
    }
    pay.disabled = false;
    pay.textContent = 'Pagar ahora';
  }

  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    cartItems = loadFromStorage();
    const pay = document.getElementById('svCartPay');
    if (pay) {
      pay.disabled = false;
      pay.textContent = 'Pagar ahora';
      render();
    }
  });

  /* ────────────────────────────────────────────
     CHECKOUT — Solana Pay (SOL / USDC)
     ──────────────────────────────────────────── */
  function checkoutCrypto() {
    if (cartItems.length === 0) return;

    if (typeof StellarPay === 'undefined') {
      alert('El módulo de pago cripto no se cargó correctamente. Revisa que solana-pay.js esté incluido en la página.');
      return;
    }

    const label = cartItems.map(i => `${i.name} x${i.qty}`).join(', ');

    StellarPay.open({
      amount: totalPrice(),
      label:  label || 'Pedido StellarVertex',
    });
  }

  /* ────────────────────────────────────────────
     CHECKOUT — Correo electrónico (fallback)
     ──────────────────────────────────────────── */
  function checkoutEmail() {
    if (cartItems.length === 0) return;

    const lineas = cartItems.map(i =>
      `${i.name} (×${i.qty}) — $${formatMXN(i.price * i.qty)} MXN`
    ).join('\n');

    const asunto = `Pedido StellarVertex — $${formatMXN(totalPrice())} MXN`;
    const cuerpo = [
      'Hola Colter,',
      '',
      'Me interesa hacer el siguiente pedido desde tu tienda:',
      '',
      lineas,
      '',
      `Total estimado: $${formatMXN(totalPrice())} MXN`,
      '',
      '¿Puedes indicarme los pasos para el pago y el envío?',
      '',
      'Gracias,'
    ].join('\n');

    window.location.href =
      `mailto:${EMAIL}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
  }

  /* ────────────────────────────────────────────
     INIT
     ──────────────────────────────────────────── */
  function init() {
    buildDOM();
    bindEvents();
    render();

    /* Una sola vez: cuando un pago cripto se confirma, cerramos el drawer y limpiamos el carrito */
    document.addEventListener('solana-pay:confirmed', () => {
      closeDrawer();
      clearCart();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();