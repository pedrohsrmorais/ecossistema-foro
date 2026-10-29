/**
 * payments.service.js
 *
 * Integração com o Asaas para cobranças via PIX e cartão de crédito.
 * https://docs.asaas.com/
 */

const axios = require('axios');
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');
const nfseService = require('./nfse.service');
const creditsService = require('./credits.service');

const asaas = axios.create({
  baseURL: process.env.ASAAS_BASE_URL || 'https://www.asaas.com/api/v3',
  headers: {
    'access_token': process.env.ASAAS_API_KEY,
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function _getOrCreateAsaasCustomer(accountId) {
  const [accounts] = await query('SELECT asaas_id, name FROM accounts WHERE id = ? LIMIT 1', [accountId]);
  if (!accounts.length) throw new AppError('Conta não encontrada.', 404);
  const account = accounts[0];

  if (account.asaas_id) return account.asaas_id;

  // Cria cliente no Asaas
  const { data } = await asaas.post('/customers', {
    name: account.name,
    externalReference: accountId,
  });

  await query('UPDATE accounts SET asaas_id = ? WHERE id = ?', [data.id, accountId]);
  return data.id;
}

// ─── PIX ──────────────────────────────────────────────────────────────────────

async function createPix(accountId, { amount, description }) {
  const customerId = await _getOrCreateAsaasCustomer(accountId);

  const { data } = await asaas.post('/payments', {
    customer: customerId,
    billingType: 'PIX',
    value: amount,
    description,
    dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10), // vence amanhã
  });

  // Busca QR Code
  const { data: pixData } = await asaas.get(`/payments/${data.id}/pixQrCode`);

  await query(
    `INSERT INTO payments (id, account_id, asaas_id, type, status, amount, description, pix_qr_code, pix_copy_paste)
     VALUES (UUID(), ?, ?, 'pix', ?, ?, ?, ?, ?)`,
    [accountId, data.id, data.status, amount, description, pixData.encodedImage, pixData.payload]
  );

  const [rows] = await query('SELECT * FROM payments WHERE asaas_id = ? LIMIT 1', [data.id]);
  return rows[0];
}

// ─── Cartão ───────────────────────────────────────────────────────────────────

async function createCard(accountId, { amount, description, card }) {
  const customerId = await _getOrCreateAsaasCustomer(accountId);

  const { data } = await asaas.post('/payments', {
    customer: customerId,
    billingType: 'CREDIT_CARD',
    value: amount,
    description,
    dueDate: new Date().toISOString().slice(0, 10),
    creditCard: {
      holderName:         card.holderName,
      number:             card.number,
      expiryMonth:        card.expiryMonth,
      expiryYear:         card.expiryYear,
      ccv:                card.ccv,
    },
    creditCardHolderInfo: {
      name:               card.holderName,
      email:              card.email,
      cpfCnpj:            card.cpfCnpj,
      postalCode:         card.postalCode,
      addressNumber:      card.addressNumber,
      phone:              card.phone,
    },
  });

  await query(
    `INSERT INTO payments (id, account_id, asaas_id, type, status, amount, description)
     VALUES (UUID(), ?, ?, 'credit_card', ?, ?, ?)`,
    [accountId, data.id, data.status, amount, description]
  );

  const [rows] = await query('SELECT * FROM payments WHERE asaas_id = ? LIMIT 1', [data.id]);
  return rows[0];
}

// ─── Compra de créditos (CPF/CNPJ/consulta processual/resumo IA) ──────────────
// Diferente da assinatura (plano mensal fixo), isto é uma recarga da carteira
// de créditos pré-pagos — ver credits.service.js e documentation/banco-de-dados.md.
// O valor só é efetivamente creditado quando o webhook confirma o pagamento
// (handleAsaasWebhook abaixo), nunca na criação da cobrança.

async function createCreditsPix(accountId, { amount, description }) {
  const customerId = await _getOrCreateAsaasCustomer(accountId);
  const amountCents = Math.round(Number(amount) * 100);
  if (amountCents <= 0) throw new AppError('Valor inválido.', 400);

  const { data } = await asaas.post('/payments', {
    customer: customerId,
    billingType: 'PIX',
    value: amount,
    description: description || 'Recarga de créditos Foro',
    dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  });

  const { data: pixData } = await asaas.get(`/payments/${data.id}/pixQrCode`);

  await query(
    `INSERT INTO payments (id, account_id, asaas_id, type, status, amount, description, pix_qr_code, pix_copy_paste, credits_amount_cents)
     VALUES (UUID(), ?, ?, 'pix', ?, ?, ?, ?, ?, ?)`,
    [accountId, data.id, data.status, amount, description || 'Recarga de créditos Foro', pixData.encodedImage, pixData.payload, amountCents]
  );

  const [rows] = await query('SELECT * FROM payments WHERE asaas_id = ? LIMIT 1', [data.id]);
  return rows[0];
}

async function createCreditsCard(accountId, { amount, description, card }) {
  const customerId = await _getOrCreateAsaasCustomer(accountId);
  const amountCents = Math.round(Number(amount) * 100);
  if (amountCents <= 0) throw new AppError('Valor inválido.', 400);

  const { data } = await asaas.post('/payments', {
    customer: customerId,
    billingType: 'CREDIT_CARD',
    value: amount,
    description: description || 'Recarga de créditos Foro',
    dueDate: new Date().toISOString().slice(0, 10),
    creditCard: { holderName: card.holderName, number: card.number, expiryMonth: card.expiryMonth, expiryYear: card.expiryYear, ccv: card.ccv },
    creditCardHolderInfo: { name: card.holderName, email: card.email, cpfCnpj: card.cpfCnpj, postalCode: card.postalCode, addressNumber: card.addressNumber, phone: card.phone },
  });

  await query(
    `INSERT INTO payments (id, account_id, asaas_id, type, status, amount, description, credits_amount_cents)
     VALUES (UUID(), ?, ?, 'credit_card', ?, ?, ?, ?)`,
    [accountId, data.id, data.status, amount, description || 'Recarga de créditos Foro', amountCents]
  );

  const [rows] = await query('SELECT * FROM payments WHERE asaas_id = ? LIMIT 1', [data.id]);
  return rows[0];
}

// ─── Assinatura ───────────────────────────────────────────────────────────────

async function createSubscription(accountId, { plan, billingType = 'PIX', card }) {
  const customerId = await _getOrCreateAsaasCustomer(accountId);

  const [plans] = await query('SELECT id, name, price FROM plans WHERE id = ? AND active = 1 AND purchasable = 1 LIMIT 1', [plan]);
  if (!plans.length) throw new AppError('Plano inválido.', 400);
  const selectedPlan = plans[0];

  const payload = {
    customer: customerId,
    billingType: billingType.toUpperCase(),
    value: Number(selectedPlan.price),
    nextDueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    cycle: 'MONTHLY',
    description: `Foro ${selectedPlan.name} — acesso mensal`,
    externalReference: accountId,
  };

  if (billingType === 'CREDIT_CARD' && card) {
    payload.creditCard = { holderName: card.holderName, number: card.number, expiryMonth: card.expiryMonth, expiryYear: card.expiryYear, ccv: card.ccv };
    payload.creditCardHolderInfo = { name: card.holderName, email: card.email, cpfCnpj: card.cpfCnpj, postalCode: card.postalCode, addressNumber: card.addressNumber, phone: card.phone };
  }

  const { data } = await asaas.post('/subscriptions', payload);

  await query("UPDATE accounts SET plan_id = ?, status = 'active', plan_started_at = ? WHERE id = ?", [plan, new Date(), accountId]);

  return { subscription_id: data.id, status: data.status, plan, billingType };
}

// ─── Consultas ────────────────────────────────────────────────────────────────

async function list(accountId, page = 1, limit = 20) {
  const offset = (page - 1) * limit;
  const [rows] = await query(
    'SELECT * FROM payments WHERE account_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
    [accountId, limit, offset]
  );
  return rows;
}

async function getById(paymentId, accountId) {
  const [rows] = await query('SELECT * FROM payments WHERE id = ? AND account_id = ? LIMIT 1', [paymentId, accountId]);
  if (!rows.length) throw new AppError('Pagamento não encontrado.', 404);
  return rows[0];
}

async function getNfse(paymentId, accountId) {
  const [rows] = await query('SELECT * FROM nfse_records WHERE payment_id = ? AND account_id = ? LIMIT 1', [paymentId, accountId]);
  if (!rows.length) throw new AppError('Nota fiscal não encontrada.', 404);
  return rows[0];
}

// ─── Webhook do Asaas ─────────────────────────────────────────────────────────

async function handleAsaasWebhook(event) {
  const { event: eventType, payment } = event;
  if (!payment?.id) return;

  const newStatus = payment.status;

  const [rows] = await query('SELECT * FROM payments WHERE asaas_id = ? LIMIT 1', [payment.id]);
  if (!rows.length) {
    console.warn('[Asaas Webhook] Pagamento não encontrado:', payment.id);
    return;
  }

  const localPayment = rows[0];
  const isConfirmed = newStatus === 'CONFIRMED' || newStatus === 'RECEIVED';

  await query('UPDATE payments SET status = ?, paid_at = ? WHERE asaas_id = ?', [
    newStatus,
    isConfirmed ? new Date() : null,
    payment.id,
  ]);

  if ((eventType === 'PAYMENT_CONFIRMED' || eventType === 'PAYMENT_RECEIVED') && localPayment.account_id) {
    // Dispara emissão de NFS-e automaticamente ao confirmar pagamento
    nfseService.emitNfse(localPayment.id, localPayment.account_id, localPayment.amount, localPayment.description)
      .catch(err => console.error('[NFS-e] Falha ao emitir nota:', err.message));

    // Se este pagamento é uma recarga de créditos, credita a carteira agora
    // — nunca na criação da cobrança, só na confirmação de pagamento de verdade.
    // Idempotente: Asaas pode reenviar o mesmo evento, então checa antes de creditar de novo.
    if (localPayment.credits_amount_cents) {
      _creditWalletOnce(localPayment).catch(err =>
        console.error('[Créditos] Falha ao creditar carteira:', err.message)
      );
    }
  }
}

async function _creditWalletOnce(payment) {
  const [existing] = await query(
    "SELECT id FROM credit_transactions WHERE reference_type = 'payment' AND reference_id = ? AND type = 'purchase' LIMIT 1",
    [payment.id]
  );
  if (existing.length) {
    console.info('[Créditos] Pagamento já creditado anteriormente, ignorando:', payment.id);
    return;
  }

  await creditsService.addCredits(payment.account_id, payment.credits_amount_cents, {
    referenceType: 'payment',
    referenceId: payment.id,
    note: `Recarga via Asaas (${payment.type})`,
  });
}

module.exports = {
  createPix, createCard, createSubscription,
  createCreditsPix, createCreditsCard,
  list, getById, getNfse, handleAsaasWebhook,
};
