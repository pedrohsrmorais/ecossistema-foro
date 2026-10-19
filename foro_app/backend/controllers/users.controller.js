const usersService = require('../services/users.service');

async function list(req, res) {
  const users = await usersService.listByAccount(req.account.id);
  res.json(users);
}

async function me(req, res) {
  const user = await usersService.getById(req.user.id, req.account.id);
  res.json(user);
}

async function updateMe(req, res) {
  const { name } = req.body;
  const user = await usersService.update(req.user.id, req.account.id, { name });
  res.json(user);
}

async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body;
  await usersService.changePassword(req.user.id, currentPassword, newPassword);
  res.json({ message: 'Senha alterada com sucesso.' });
}

async function getById(req, res) {
  const user = await usersService.getById(req.params.id, req.account.id);
  res.json(user);
}

async function update(req, res) {
  // Admin only
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado.' });
  const { name, role, active } = req.body;
  const user = await usersService.update(req.params.id, req.account.id, { name, role, active });
  res.json(user);
}

async function deactivate(req, res) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Acesso negado.' });
  await usersService.deactivate(req.params.id, req.account.id);
  res.json({ message: 'Usuário desativado.' });
}

module.exports = { list, me, updateMe, changePassword, getById, update, deactivate };
