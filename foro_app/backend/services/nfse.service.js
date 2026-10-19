/**
 * nfse.service.js
 *
 * Emissão automática de NFS-e via NFE.io.
 * Padrão: NFS-e Nacional (Porto Alegre / RS).
 * ISS: 2% (Simples Nacional, código de serviço 1.07 — Desenvolvimento de software)
 *
 * Docs: https://nfe.io/docs/nota-fiscal-servico/
 */

const axios = require('axios');
const { query } = require('../configs/db.config');

const nfeio = axios.create({
  baseURL: process.env.NFEIO_BASE_URL || 'https://api.nfe.io/v1',
  headers: {
    'Authorization': `Basic ${Buffer.from(process.env.NFEIO_API_KEY + ':').toString('base64')}`,
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

const COMPANY_ID = process.env.NFEIO_COMPANY_ID;

/**
 * Emite uma NFS-e para um pagamento confirmado.
 * @param {string} paymentId ID interno do pagamento
 * @param {string} accountId Conta (tenant) que pagou
 * @param {number} amount    Valor pago (R$)
 * @param {string} description Descrição do serviço
 */
async function emitNfse(paymentId, accountId, amount, description) {
  if (!COMPANY_ID || !process.env.NFEIO_API_KEY) {
    console.warn('[NFS-e] Chaves NFE.io não configuradas. Pulando emissão.');
    return;
  }

  // Evita emissão duplicada
  const [existing] = await query(
    'SELECT id, status FROM nfse_records WHERE payment_id = ? LIMIT 1',
    [paymentId]
  );
  if (existing.length && existing[0].status !== 'error') {
    console.info('[NFS-e] Nota já emitida para payment:', paymentId);
    return;
  }

  // Busca dados da conta tomadora
  const [accounts] = await query(
    'SELECT name FROM accounts WHERE id = ? LIMIT 1',
    [accountId]
  );
  const accountName = accounts[0]?.name || 'Tomador não identificado';

  // Cria registro pendente
  let nfseId;
  if (existing.length) {
    nfseId = existing[0].id;
    await query('UPDATE nfse_records SET status = ? WHERE id = ?', ['pending', nfseId]);
  } else {
    await query(
      'INSERT INTO nfse_records (id, account_id, payment_id, status) VALUES (UUID(), ?, ?, ?)',
      [accountId, paymentId, 'pending']
    );
    const [rows] = await query(
      'SELECT id FROM nfse_records WHERE payment_id = ? ORDER BY created_at DESC LIMIT 1',
      [paymentId]
    );
    nfseId = rows[0].id;
  }

  try {
    const payload = {
      cityServiceCode: '01.07',    // Desenvolvimento e licenciamento de programas de computador
      issRate: 0.02,               // 2% ISS — Simples Nacional
      servicesAmount: Number(amount),
      description: description || 'Acesso à plataforma Foro — serviço de software',
      borrower: {
        federalTaxNumber: '00000000000000', // CNPJ ou CPF da empresa cliente (a preencher futuramente)
        name: accountName,
        email: '',
        address: { country: 'BRA' },
      },
    };

    const { data } = await nfeio.post(`/companies/${COMPANY_ID}/serviceinvoices`, payload);

    await query(
      `UPDATE nfse_records SET nfeio_id = ?, status = ? WHERE id = ?`,
      [data.id, data.flowStatus || 'issued', nfseId]
    );

    console.info(`[NFS-e] Nota emitida: ${data.id} para pagamento ${paymentId}`);
    return data;
  } catch (err) {
    const errMsg = err.response?.data?.message || err.message;
    await query('UPDATE nfse_records SET status = ?, error_msg = ? WHERE id = ?', ['error', errMsg, nfseId]);
    throw err;
  }
}

/**
 * Webhook do NFE.io — atualiza status da nota (autorizada, rejeitada, etc.)
 */
async function handleNfeioWebhook(event) {
  const { id, flowStatus, number, series, pdfUrl, xmlUrl } = event;
  if (!id) return;

  await query(
    `UPDATE nfse_records SET status = ?, number = ?, series = ?, pdf_url = ?, xml_url = ?
     WHERE nfeio_id = ?`,
    [flowStatus || 'updated', number || null, series || null, pdfUrl || null, xmlUrl || null, id]
  );
}

module.exports = { emitNfse, handleNfeioWebhook };
