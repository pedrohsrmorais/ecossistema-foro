const authService = require('../services/auth.service');

async function register(req, res) {
  const { name, email, password, phone, accountName } = req.body;
  const result = await authService.register({ name, email, password, phone, accountName });
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

/**
 * Envia (ou reenvia) um código de verificação para o usuário autenticado.
 * Body: { channel: 'email' | 'phone' }
 */
async function sendVerification(req, res) {
  const { channel } = req.body;
  const result = await authService.sendVerificationCode(req.user.id, channel);
  res.json(result);
}

/**
 * Confirma o código de verificação enviado.
 * Body: { channel: 'email' | 'phone', code: '123456' }
 */
async function verifyCode(req, res) {
  const { channel, code } = req.body;
  const result = await authService.verifyCode(req.user.id, channel, code);
  res.json(result);
}

/**
 * Login da equipe da plataforma (intellsn) — administração de todos os tenants.
 */
async function platformLogin(req, res) {
  const { email, password } = req.body;
  const result = await authService.platformLogin({ email, password });
  res.json(result);
}

module.exports = {
  register, login, refreshToken, forgotPassword, resetPassword,
  sendVerification, verifyCode, platformLogin,
};
