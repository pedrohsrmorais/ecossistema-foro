const adminService = require('../services/admin.service');
const modulesService = require('../services/modules.service');

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

/** GET /admin/modules — catálogo completo (pra montar a lista de toggles na tela). */
async function listModulesCatalog(req, res) {
  const modules = await modulesService.listCatalog();
  res.json({ modules });
}

/** GET /admin/accounts/:id/modules — estado dos módulos de UMA conta. */
async function getAccountModules(req, res) {
  const modules = await adminService.getAccountModules(req.params.id);
  res.json({ modules });
}

/** PATCH /admin/accounts/:id/modules/:moduleKey — liga/desliga um módulo pra essa conta. */
async function setAccountModule(req, res) {
  const { enabled } = req.body;
  const modules = await adminService.setAccountModule(
    req.params.id,
    req.params.moduleKey,
    Boolean(enabled),
    req.platformAdmin.platform_admin_id
  );
  res.json({ modules });
}

module.exports = {
  listAccounts, getAccount, updateAccountStatus, listPlans, adjustCredits, creditsOverview,
  listModulesCatalog, getAccountModules, setAccountModule,
};
