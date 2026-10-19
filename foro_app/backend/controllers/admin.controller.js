const adminService = require('../services/admin.service');

async function listAccounts(req, res) {
  const accounts = await adminService.listAccounts();
  res.json({ accounts });
}

async function getAccount(req, res) {
  const account = await adminService.getAccount(req.params.id);
  res.json({ account });
}

async function updateAccountStatus(req, res) {
  const account = await adminService.updateAccountStatus(req.params.id, req.body.status);
  res.json({ account });
}

async function listPlans(req, res) {
  const plans = await adminService.listPlans();
  res.json({ plans });
}

/**
 * PATCH /admin/accounts/:id/credits/adjust
 * Único jeito de "reembolsar" ou ajustar créditos de um tenant — decisão
 * manual da equipe intellsn, nunca self-service. Exige motivo (`note`).
 * `amount_cents` pode ser negativo (desconto) ou positivo (crédito/reembolso).
 */
async function adjustCredits(req, res) {
  const { amount_cents, note } = req.body;
  const result = await adminService.adjustAccountCredits(
    req.params.id,
    Number(amount_cents),
    note,
    req.platformAdmin.platform_admin_id
  );
  res.json(result);
}

async function creditsOverview(req, res) {
  const overview = await adminService.getCreditsOverview();
  res.json({ overview });
}

module.exports = { listAccounts, getAccount, updateAccountStatus, listPlans, adjustCredits, creditsOverview };
