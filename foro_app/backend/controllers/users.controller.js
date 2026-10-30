const usersService = require('../services/users.service');

async function list(req, res) {
  res.json(await usersService.listByAccount(req.account.id));
}

async function me(req, res) {
  res.json(await usersService.getById(req.user.id, req.account.id));
}

async function updateMe(req, res) {
  const { name, oab_number } = req.body;
  res.json(await usersService.update(req.user.id, req.account.id, { name, oab_number }, req.user.id));
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  await usersService.changePassword(req.user.id, currentPassword, newPassword);
  res.json({ message: 'Senha alterada com sucesso.' });
}

async function getById(req, res) {
  res.json(await usersService.getById(req.params.id, req.account.id));
}

// As rotas abaixo usam requireAdmin (api.routes.js).
async function invite(req, res) {
  const { name, email, role } = req.body;
  res.status(201).json(await usersService.invite(req.account.id, req.user, { name, email, role }));
}

async function resendInvite(req, res) {
  await usersService.resendInvite(req.params.id, req.account.id, req.user);
  res.json({ message: 'Convite reenviado.' });
}

async function update(req, res) {
  const { name, role, active } = req.body;
  res.json(await usersService.update(req.params.id, req.account.id, { name, role, active }, req.user.id));
}

async function deactivate(req, res) {
  await usersService.deactivate(req.params.id, req.account.id, req.user.id);
  res.json({ message: 'Usuário desativado.' });
}

module.exports = { list, me, updateMe, changePassword, getById, invite, resendInvite, update, deactivate };
