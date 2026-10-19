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

module.exports = { listAccounts, getAccount, updateAccountStatus, listPlans };
