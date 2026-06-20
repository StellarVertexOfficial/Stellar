/* ============================================================
   CART SYSTEM — StellarVertex
   Vanilla JS · localStorage · Checkout por WhatsApp
   ============================================================ */

(function () {
  'use strict';

  /* ────────────────────────────────────────────
     CONFIG — actualiza el número de WhatsApp
     ──────────────────────────────────────────── */
  const WHATSAPP = '525629704701'; // ← reemplaza con tu número real (sin +, sin espacios)
  const EMAIL    = 'contacto@stellarvertex.mx';
  const STORAGE  = 'sv_cart_v1';

  /* ────────────────────────────────────────────
     ESTADO
     ──────────────────────────────────────────── */
  let cartItems = loadFromStorage();

  /* ────────────────────────────────────────────
     PERSISTENCIA
     ──────────────────────────────────────────── */
  function loadFromStorage() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE)) || [];
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
      existing.qty += 1;
    } else {
      cartItems.push({ ...product, qty: 1 });
    }
    persist();
    render();
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
    } else {
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
      <div class="cart-drawer__footer" id="svCartFooter" style="display:none;">
        <div class="cart-summary">
          <span class="cart-summary__label">Total estimado</span>
          <span class="cart-summary__value" id="svCartTotal">$0 <span>MXN</span></span>
        </div>
        <p class="cart-note">Pago coordinado directamente con Colter · Envío incluido · Respuesta &lt; 24h</p>
        <button class="btn btn--wap" id="svCartWap">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg" style="flex-shrink:0">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
          </svg>
          Confirmar pedido por WhatsApp
        </button>
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
    document.getElementById('svCartWap').addEventListener('click', checkoutWhatsApp);
    document.getElementById('svCartCrypto').addEventListener('click', checkoutCrypto);
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
      price:  parseInt(btn.dataset.productPrice, 10),
      detail: btn.dataset.productDetail || '',
      icon:   btn.dataset.productIcon   || '📦',
    };

    /* Validación mínima */
    if (!product.id || isNaN(product.price)) return;

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

    /* Items */
    if (body) {
      body.innerHTML = cartItems.map(item => {
        const lineTotal = formatMXN(item.price * item.qty);
        const unitPrice = formatMXN(item.price);
        return `
        <div class="cart-item" data-cart-id="${item.id}">
          <div class="cart-item__icon">${item.icon}</div>
          <div class="cart-item__info">
            <div class="cart-item__name">${item.name}</div>
            <div class="cart-item__detail">${item.detail}</div>
            <div class="cart-item__price">
              $${lineTotal} <span>MXN</span>
              ${item.qty > 1 ? `<span style="color:var(--text-muted);font-size:0.6rem;margin-left:4px;">($${unitPrice} c/u)</span>` : ''}
            </div>
          </div>
          <div class="cart-item__controls">
            <div class="cart-item__qty">
              <button class="cart-item__qty-btn" data-sv-action="dec" data-sv-id="${item.id}" aria-label="Reducir cantidad">−</button>
              <span class="cart-item__qty-num">${item.qty}</span>
              <button class="cart-item__qty-btn" data-sv-action="inc" data-sv-id="${item.id}" aria-label="Aumentar cantidad">+</button>
            </div>
            <button class="cart-item__remove" data-sv-action="del" data-sv-id="${item.id}">Eliminar</button>
          </div>
        </div>`;
      }).join('');
    }

    /* Total */
    if (total) {
      total.innerHTML = `$${formatMXN(totalPrice())} <span>MXN</span>`;
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

  /* ────────────────────────────────────────────
     CHECKOUT — WhatsApp
     ──────────────────────────────────────────── */
  function checkoutWhatsApp() {
    if (cartItems.length === 0) return;

    const lineas = cartItems.map(i =>
      `• ${i.name} (×${i.qty}) — $${formatMXN(i.price * i.qty)} MXN`
    ).join('\n');

    const mensaje = [
      '¡Hola Colter! Me interesa hacer un pedido desde StellarVertex 🌱',
      '',
      '📦 *Mi pedido:*',
      lineas,
      '',
      `💰 *Total estimado: $${formatMXN(totalPrice())} MXN*`,
      '',
      '¿Cómo procedo con el pago y los datos de envío?'
    ].join('\n');

    const url = `https://wa.me/${WHATSAPP}?text=${encodeURIComponent(mensaje)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

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