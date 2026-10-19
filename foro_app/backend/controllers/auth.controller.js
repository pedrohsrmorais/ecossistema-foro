const authService = require('../services/auth.service');

async function register(req, res) {
  const { name, email, password, accountName } = req.body;
  const result = await authService.register({ name, email, password, accountName });
  res.status(201).json(result);
}

async function login(req, res) {
  const { email, password } = req.body;
  const result = await authService.login({ email, password });
  res.json(result);
}

async function refreshToken(req, res) {
  const { refreshToken } = req.body;
  const result = await authService.refreshToken(refreshToken);
  res.json(result);
}

async function forgotPassword(req, res) {
  const { email } = req.body;
  await authService.forgotPassword(email);
  res.json({ message: 'Se o e-mail existir, você receberá as instruções em breve.' });
}

async function resetPassword(req, res) {
  const { token, password } = req.body;
  await authService.resetPassword(token, password);
  res.json({ message: 'Senha redefinida com sucesso.' });
}

module.exports = { register, login, refreshToken, forgotPassword, resetPassword };
