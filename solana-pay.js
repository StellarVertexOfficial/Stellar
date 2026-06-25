/**
 * StellarVertex — Solana Pay Widget
 * Integración de pagos con SOL y USDC vía Solana Pay
 *
 * CONFIGURACIÓN:
 *   1. Cambia WALLET_ADDRESS por tu dirección de Solana
 *   2. Sube verify-payment.js a netlify/functions/
 *   3. Incluye este script en tus páginas
 *
 * USO:
 *   StellarPay.open({ amount: 1299, label: 'Sensor IoT XR-200' });
 *
 * EVENTO al confirmar:
 *   document.addEventListener('solana-pay:confirmed', (e) => {
 *     console.log('TX:', e.detail.signature);
 *   });
 */

(function () {
  'use strict';

  // ─── CONFIGURACIÓN ────────────────────────────────────────────────
  const CONFIG = {
    WALLET_ADDRESS: 'G1sjfuuSKsRgb1o1iDH77xjPCdwwPiSaLAvjxoQ3c1iQ',              // ← CAMBIAR
    USDC_MINT: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    VERIFY_ENDPOINT: '/.netlify/functions/verify-payment',
    POLL_INTERVAL_MS: 4000,
    PRICE_TOLERANCE: 0.01,  // 1% de tolerancia en conversión
    LABEL: 'StellarVertex',
  };

  // ─── BASE58 (para generar reference keys de Solana válidas) ───────
  const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

  function toBase58(bytes) {
    let leading = 0;
    for (const b of bytes) { if (b === 0) leading++; else break; }

    let num = 0n;
    for (const b of bytes) num = num * 256n + BigInt(b);

    let result = '';
    while (num > 0n) {
      result = B58_ALPHABET[Number(num % 58n)] + result;
      num /= 58n;
    }
    return '1'.repeat(leading) + result;
  }

  function generateReference() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return toBase58(bytes);
  }

  // ─── ESTADO ───────────────────────────────────────────────────────
  let state = {
    amount: 0,
    label: '',
    token: 'SOL',
    prices: { sol_mxn: 0, usd_mxn: 0 },
    reference: null,
    pollTimer: null,
    status: 'idle',
  };

  // ─── PRECIOS (CoinGecko público) ──────────────────────────────────
  async function fetchPrices() {
    const res = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana,usd-coin&vs_currencies=mxn'
    );
    if (!res.ok) throw new Error('No se pudo obtener el tipo de cambio');
    const data = await res.json();
    return {
      sol_mxn: data.solana.mxn,
      usd_mxn: data['usd-coin'].mxn,
    };
  }

  function getTokenAmount(mxnAmount, token, prices) {
    if (token === 'USDC') {
      return (mxnAmount / prices.usd_mxn).toFixed(2);
    }
    return (mxnAmount / prices.sol_mxn).toFixed(6);
  }

  // ─── SOLANA PAY URL ───────────────────────────────────────────────
  function buildPayURL(token, tokenAmount, reference, label) {
    const params = new URLSearchParams({
      amount: tokenAmount,
      reference,
      label: CONFIG.LABEL,
      message: label,
    });
    if (token === 'USDC') {
      params.append('spl-token', CONFIG.USDC_MINT);
    }
    return `solana:${CONFIG.WALLET_ADDRESS}?${params.toString()}`;
  }

  // ─── QR CODE ──────────────────────────────────────────────────────
  function loadQRLib(callback) {
    if (window.QRCode) { callback(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = callback;
    s.onerror = () => callback(true);
    document.head.appendChild(s);
  }

  function renderQR(container, url) {
    container.innerHTML = '';
    loadQRLib((err) => {
      if (err || !window.QRCode) {
        // Fallback: imagen vía API
        const img = document.createElement('img');
        img.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}&bgcolor=0D1117&color=FFFFFF&margin=10`;
        img.width = 220;
        img.height = 220;
        img.style.borderRadius = '8px';
        container.appendChild(img);
        return;
      }
      new QRCode(container, {
        text: url,
        width: 220,
        height: 220,
        colorDark: '#FFFFFF',
        colorLight: '#0D1117',
        correctLevel: QRCode.CorrectLevel.M,
      });
    });
  }

  // ─── VERIFICACIÓN ─────────────────────────────────────────────────
  async function checkPayment() {
    if (state.status === 'confirmed') return;
    try {
      const tokenAmount = getTokenAmount(state.amount, state.token, state.prices);
      const res = await fetch(CONFIG.VERIFY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference: state.reference,
          token: state.token,
          expectedAmount: tokenAmount,
          recipient: CONFIG.WALLET_ADDRESS,
        }),
      });
      const data = await res.json();
      if (data.verified) {
        clearInterval(state.pollTimer);
        setStatus('confirmed', data.signature);
      }
    } catch (_) { /* sigue esperando */ }
  }

  function startPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(checkPayment, CONFIG.POLL_INTERVAL_MS);
  }

  // ─── UI ───────────────────────────────────────────────────────────
  function setStatus(status, sig) {
    state.status = status;
    const el = document.getElementById('svp-status');
    if (!el) return;

    const map = {
      loading:   { text: 'Obteniendo precio de mercado...', cls: 'loading' },
      pending:   { text: '⟳  Esperando confirmación en la blockchain', cls: 'pending' },
      confirmed: { text: '✓  Pago confirmado',  cls: 'confirmed' },
      error:     { text: '✕  Error — intenta de nuevo', cls: 'error' },
    };

    const s = map[status] || { text: '', cls: '' };
    el.textContent = s.text;
    el.className = `svp-status svp-status--${s.cls}`;

    if (status === 'confirmed') {
      const body = document.querySelector('.svp-body');
      if (body) body.innerHTML = buildSuccessHTML(sig);
      document.dispatchEvent(
        new CustomEvent('solana-pay:confirmed', { detail: { signature: sig } })
      );
    }
  }

  function buildSuccessHTML(sig) {
    return `
      <div class="svp-success">
        <div class="svp-success-icon">
          <svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="28" cy="28" r="28" fill="rgba(125,211,125,0.12)"/>
            <path d="M18 28L25 35L38 21" stroke="#7DD37D" stroke-width="2.5"
                  stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <h3 class="svp-success-title">¡Pago recibido!</h3>
        <p class="svp-success-msg">
          Tu pedido ha sido confirmado en la blockchain.<br>
          Te contactamos pronto por WhatsApp.
        </p>
        ${sig ? `<a href="https://solscan.io/tx/${sig}" target="_blank" class="svp-tx-link">Ver en Solscan →</a>` : ''}
        <button class="svp-btn svp-btn--primary" onclick="StellarPay.close()">Cerrar</button>
      </div>`;
  }

  function updateUI() {
    const tokenAmount = getTokenAmount(state.amount, state.token, state.prices);
    const url = buildPayURL(state.token, tokenAmount, state.reference, state.label);

    const amountEl = document.getElementById('svp-token-amount');
    if (amountEl) {
      amountEl.textContent = state.token === 'SOL'
        ? `≈ ${tokenAmount} SOL`
        : `≈ ${tokenAmount} USDC`;
    }

    const qrEl = document.getElementById('svp-qr');
    if (qrEl) renderQR(qrEl, url);

    const link = document.getElementById('svp-deeplink');
    if (link) link.href = url;
  }

  // ─── API PÚBLICA ──────────────────────────────────────────────────
  async function open({ amount, label = 'Producto StellarVertex' }) {
    if (!amount || amount <= 0) {
      console.error('[StellarPay] amount debe ser mayor a 0');
      return;
    }

    // Limpieza defensiva: si quedó un timer de una apertura anterior sin cerrar
    if (state.pollTimer) clearInterval(state.pollTimer);

    state = {
      amount,
      label,
      token: 'SOL',
      prices: { sol_mxn: 0, usd_mxn: 0 },
      reference: generateReference(),
      pollTimer: null,
      status: 'loading',
    };

    injectStyles();
    renderModal();
    document.body.style.overflow = 'hidden';
    setStatus('loading');

    try {
      state.prices = await fetchPrices();
      updateUI();
      setStatus('pending');
      startPolling();
    } catch (e) {
      console.error('[StellarPay]', e);
      setStatus('error');
    }
  }

  function close() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    const overlay = document.getElementById('svp-overlay');
    if (!overlay) return;
    overlay.classList.remove('svp-visible');
    overlay.classList.add('svp-closing');
    setTimeout(() => {
      overlay.remove();
      document.body.style.overflow = '';
    }, 280);
  }

  function switchToken(token) {
    if (token === state.token) return;
    state.token = token;
    state.reference = generateReference(); // nueva reference por token

    document.querySelectorAll('.svp-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.token === token)
    );

    updateUI();

    if (state.pollTimer) clearInterval(state.pollTimer);
    setStatus('pending');
    startPolling();
  }

  // ─── MODAL HTML ───────────────────────────────────────────────────
  function renderModal() {
    document.getElementById('svp-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'svp-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Pago con Solana');

    overlay.innerHTML = `
      <div id="svp-modal">
        <div class="svp-header">
          <div class="svp-logo">
            <span class="svp-sol-icon" aria-hidden="true">◎</span>
            Solana Pay
          </div>
          <button class="svp-close" onclick="StellarPay.close()" aria-label="Cerrar">
            <svg viewBox="0 0 16 16" fill="none" width="14" height="14">
              <path d="M2 2L14 14M14 2L2 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <div class="svp-body">
          <div class="svp-amount-block">
            <span class="svp-mxn-label">Total</span>
            <span class="svp-mxn-value">$${Number(state.amount).toLocaleString('es-MX')} MXN</span>
            <span id="svp-token-amount" class="svp-token-value">Calculando...</span>
          </div>

          <div class="svp-tabs" role="tablist">
            <button class="svp-tab active" data-token="SOL"
              onclick="StellarPay.switchToken('SOL')" role="tab">
              SOL
            </button>
            <button class="svp-tab" data-token="USDC"
              onclick="StellarPay.switchToken('USDC')" role="tab">
              USDC
            </button>
          </div>

          <div id="svp-qr" class="svp-qr" aria-label="Código QR de pago">
            <div class="svp-qr-loading">
              <span class="svp-spinner"></span>
            </div>
          </div>

          <p class="svp-hint">
            Escanea con <strong>Phantom</strong>, <strong>Solflare</strong>
            u otra wallet de Solana
          </p>

          <div id="svp-status" class="svp-status svp-status--loading" role="status" aria-live="polite">
            Obteniendo precio de mercado...
          </div>

          <a id="svp-deeplink" href="#" target="_blank" rel="noopener"
            class="svp-btn svp-btn--ghost">
            Abrir en wallet móvil
            <svg viewBox="0 0 12 12" fill="none" width="10" height="10" style="margin-left:4px">
              <path d="M1 11L11 1M11 1H5M11 1V7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </a>
        </div>
      </div>`;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', escHandler); }
    });

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('svp-visible'));
  }

  // ─── ESTILOS ──────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('svp-styles')) return;
    const style = document.createElement('style');
    style.id = 'svp-styles';
    style.textContent = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap');

/* ── Overlay ── */
#svp-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.72);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 99999;
  opacity: 0;
  transition: opacity 0.25s ease;
  font-family: 'Inter', system-ui, sans-serif;
  padding: 16px;
  box-sizing: border-box;
}
#svp-overlay.svp-visible  { opacity: 1; }
#svp-overlay.svp-closing  { opacity: 0; pointer-events: none; }

/* ── Modal ── */
#svp-modal {
  background: #0D1117;
  border: 1px solid rgba(255,255,255,0.09);
  border-radius: 20px;
  width: 100%;
  max-width: 388px;
  overflow: hidden;
  transform: translateY(18px) scale(0.98);
  transition: transform 0.32s cubic-bezier(0.16,1,0.3,1);
  box-shadow:
    0 0 0 1px rgba(255,255,255,0.04),
    0 24px 64px rgba(0,0,0,0.65),
    0 0 80px rgba(125,211,125,0.06);
}
#svp-overlay.svp-visible #svp-modal {
  transform: translateY(0) scale(1);
}

/* ── Header ── */
.svp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.svp-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255,255,255,0.85);
  letter-spacing: -0.01em;
}
.svp-sol-icon {
  font-size: 19px;
  background: linear-gradient(135deg, #9945FF 30%, #14F195);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.svp-close {
  background: none;
  border: none;
  color: rgba(255,255,255,0.35);
  cursor: pointer;
  padding: 6px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  transition: color 0.15s, background 0.15s;
}
.svp-close:hover {
  color: rgba(255,255,255,0.75);
  background: rgba(255,255,255,0.07);
}

/* ── Body ── */
.svp-body {
  padding: 22px 22px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

/* ── Amount ── */
.svp-amount-block { text-align: center; }
.svp-mxn-label {
  display: block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: rgba(255,255,255,0.3);
  margin-bottom: 3px;
}
.svp-mxn-value {
  display: block;
  font-size: 30px;
  font-weight: 700;
  color: #E6EDF3;
  letter-spacing: -0.03em;
  line-height: 1;
}
.svp-token-value {
  display: block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: #7DD37D;
  margin-top: 5px;
  letter-spacing: 0.3px;
}

/* ── Tabs ── */
.svp-tabs {
  display: flex;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 10px;
  padding: 3px;
  gap: 2px;
}
.svp-tab {
  background: none;
  border: 1px solid transparent;
  color: rgba(255,255,255,0.45);
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1px;
  padding: 6px 22px;
  border-radius: 7px;
  cursor: pointer;
  transition: all 0.18s;
}
.svp-tab.active {
  background: rgba(125,211,125,0.1);
  color: #7DD37D;
  border-color: rgba(125,211,125,0.18);
}
.svp-tab:not(.active):hover {
  color: rgba(255,255,255,0.7);
  background: rgba(255,255,255,0.05);
}

/* ── QR ── */
.svp-qr {
  background: #111820;
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 16px;
  padding: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 256px;
  min-width: 256px;
}
.svp-qr canvas, .svp-qr img { border-radius: 6px; display: block; }
.svp-qr-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 220px;
  height: 220px;
}

/* ── Spinner ── */
.svp-spinner {
  display: inline-block;
  width: 28px;
  height: 28px;
  border: 2px solid rgba(125,211,125,0.15);
  border-top-color: #7DD37D;
  border-radius: 50%;
  animation: svp-spin 0.8s linear infinite;
}
@keyframes svp-spin { to { transform: rotate(360deg); } }

/* ── Hint ── */
.svp-hint {
  font-size: 12px;
  color: rgba(255,255,255,0.35);
  text-align: center;
  margin: 0;
  line-height: 1.5;
}
.svp-hint strong { color: rgba(255,255,255,0.6); font-weight: 500; }

/* ── Status ── */
.svp-status {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.4px;
  padding: 8px 14px;
  border-radius: 8px;
  text-align: center;
  width: 100%;
  box-sizing: border-box;
  transition: all 0.2s;
}
.svp-status--loading, .svp-status--pending {
  background: rgba(125,211,125,0.05);
  color: rgba(125,211,125,0.65);
  border: 1px solid rgba(125,211,125,0.1);
}
.svp-status--confirmed {
  background: rgba(125,211,125,0.1);
  color: #7DD37D;
  border: 1px solid rgba(125,211,125,0.22);
}
.svp-status--error {
  background: rgba(255,80,80,0.07);
  color: rgba(255,120,120,0.85);
  border: 1px solid rgba(255,80,80,0.14);
}

/* ── Buttons ── */
.svp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 500;
  padding: 9px 18px;
  border-radius: 10px;
  border: none;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.18s;
  width: 100%;
  box-sizing: border-box;
}
.svp-btn--ghost {
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.5);
  border: 1px solid rgba(255,255,255,0.07);
}
.svp-btn--ghost:hover {
  background: rgba(255,255,255,0.07);
  color: rgba(255,255,255,0.85);
  border-color: rgba(255,255,255,0.12);
}
.svp-btn--primary {
  background: rgba(125,211,125,0.12);
  color: #7DD37D;
  border: 1px solid rgba(125,211,125,0.22);
}
.svp-btn--primary:hover {
  background: rgba(125,211,125,0.18);
}

/* ── Success ── */
.svp-success {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  text-align: center;
  padding: 8px 0;
}
.svp-success-icon svg { width: 60px; height: 60px; }
.svp-success-title {
  font-size: 20px;
  font-weight: 700;
  color: #E6EDF3;
  margin: 0;
  letter-spacing: -0.02em;
}
.svp-success-msg {
  font-size: 13px;
  color: rgba(255,255,255,0.45);
  margin: 0;
  line-height: 1.6;
}
.svp-tx-link {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: rgba(125,211,125,0.65);
  text-decoration: none;
  border-bottom: 1px solid rgba(125,211,125,0.25);
  padding-bottom: 1px;
  transition: color 0.15s;
}
.svp-tx-link:hover { color: #7DD37D; }

/* ── Responsive ── */
@media (max-width: 430px) {
  #svp-overlay { padding: 0; align-items: flex-end; }
  #svp-modal {
    border-radius: 20px 20px 0 0;
    max-width: 100%;
  }
}
@media (prefers-reduced-motion: reduce) {
  #svp-modal, #svp-overlay, .svp-spinner, .svp-btn, .svp-tab, .svp-status {
    transition: none !important;
    animation: none !important;
  }
}`;
    document.head.appendChild(style);
  }

  // ─── EXPORT ───────────────────────────────────────────────────────
  window.StellarPay = { open, close, switchToken };

})();
