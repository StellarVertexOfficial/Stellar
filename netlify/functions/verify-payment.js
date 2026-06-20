/**
 * netlify/functions/verify-payment.js
 *
 * Verifica pagos de Solana Pay consultando la blockchain.
 * Se activa con POST /.netlify/functions/verify-payment
 *
 * Body esperado:
 *   { reference, token, expectedAmount, recipient }
 *
 * Responde con:
 *   { verified: bool, signature: string | null, status: string }
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const USDC_MINT     = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOLANA_RPC    = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
const TOLERANCE     = 0.01; // 1% tolerancia por fluctuación de precio

const CORS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  const { reference, token, expectedAmount, recipient } = body;

  if (!reference || !token || !expectedAmount || !recipient) {
    return {
      statusCode: 400,
      headers: CORS,
      body: JSON.stringify({ error: 'Faltan parámetros: reference, token, expectedAmount, recipient' }),
    };
  }

  try {
    const connection  = new Connection(SOLANA_RPC, 'confirmed');
    const referenceKey = new PublicKey(reference);

    // Buscar transacciones que incluyan esta reference key
    const signatures = await connection.getSignaturesForAddress(referenceKey, {
      limit: 5,
      commitment: 'confirmed',
    });

    if (!signatures || signatures.length === 0) {
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ verified: false, signature: null, status: 'pending' }),
      };
    }

    // Verificar la más reciente
    const latestSig = signatures[0].signature;

    const tx = await connection.getTransaction(latestSig, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });

    if (!tx || tx.meta?.err) {
      return {
        statusCode: 200,
        headers: CORS,
        body: JSON.stringify({ verified: false, signature: null, status: 'tx_error' }),
      };
    }

    const recipientKey = new PublicKey(recipient);
    const amount       = parseFloat(expectedAmount);
    let verified       = false;

    if (token === 'SOL') {
      verified = verifySOL(tx, recipientKey, amount);
    } else if (token === 'USDC') {
      verified = verifyUSDC(tx, recipientKey, amount);
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify({
        verified,
        signature: verified ? latestSig : null,
        status:    verified ? 'confirmed' : 'mismatch',
      }),
    };

  } catch (err) {
    console.error('[verify-payment] Error:', err.message);
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({ verified: false, status: 'error', error: err.message }),
    };
  }
};

// ─── VERIFICAR TRANSFER DE SOL NATIVO ─────────────────────────────────────────
function verifySOL(tx, recipientKey, expectedSOL) {
  const LAMPORTS = 1_000_000_000;
  const expectedLamports = Math.floor(expectedSOL * LAMPORTS);
  const toleranceLamports = Math.floor(expectedLamports * TOLERANCE);

  // Obtener accountKeys según versión del mensaje
  const accountKeys = getAccountKeys(tx);
  const recipientB58 = recipientKey.toBase58();
  const idx = accountKeys.findIndex(k => k === recipientB58);
  if (idx === -1) return false;

  const pre  = tx.meta.preBalances[idx]  || 0;
  const post = tx.meta.postBalances[idx] || 0;
  const received = post - pre;

  return received >= expectedLamports - toleranceLamports;
}

// ─── VERIFICAR TRANSFER DE USDC (SPL Token) ───────────────────────────────────
function verifyUSDC(tx, recipientKey, expectedUSDC) {
  const DECIMALS     = 6; // USDC usa 6 decimales
  const expectedMicro = Math.floor(expectedUSDC * 10 ** DECIMALS);
  const toleranceMicro = Math.floor(expectedMicro * TOLERANCE);

  const postBalances = tx.meta?.postTokenBalances || [];
  const preBalances  = tx.meta?.preTokenBalances  || [];
  const recipientB58 = recipientKey.toBase58();

  for (const post of postBalances) {
    // Filtrar solo cuentas USDC cuyo owner sea el recipient
    if (post.mint !== USDC_MINT) continue;
    if (post.owner !== recipientB58) continue;

    const postAmount = parseInt(post.uiTokenAmount?.amount || '0');
    const pre        = preBalances.find(p => p.accountIndex === post.accountIndex);
    const preAmount  = parseInt(pre?.uiTokenAmount?.amount  || '0');
    const received   = postAmount - preAmount;

    if (received >= expectedMicro - toleranceMicro) return true;
  }
  return false;
}

// ─── HELPER: accountKeys compatible con legacy y versioned tx ─────────────────
function getAccountKeys(tx) {
  try {
    // Versioned transaction (v0)
    const msg = tx.transaction.message;
    if (msg.getAccountKeys) {
      return msg.getAccountKeys().staticAccountKeys.map(k => k.toBase58());
    }
    // Legacy transaction
    return (msg.accountKeys || []).map(k =>
      typeof k.toBase58 === 'function' ? k.toBase58() : k.toString()
    );
  } catch {
    return [];
  }
}
