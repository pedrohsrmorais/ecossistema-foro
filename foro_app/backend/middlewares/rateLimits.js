const rateLimit = require('express-rate-limit');

const json = (error) => ({ error, code: 'RATE_LIMITED' });
const base = { standardHeaders: true, legacyHeaders: false };

// Login: 10 tentativas erradas / 15 min por IP (acertos não contam).
const loginLimiter = rateLimit({
  ...base, windowMs: 15 * 60 * 1000, max: 10, skipSuccessfulRequests: true,
  message: json('Muitas tentativas de login. Aguarde alguns minutos e tente de novo.'),
});

// Cadastro / esqueci a senha / reset / refresh: por IP.
const registerLimiter = rateLimit({
  ...base, windowMs: 60 * 60 * 1000, max: 10,
  message: json('Muitos cadastros deste endereço. Tente novamente mais tarde.'),
});
const emailFlowLimiter = rateLimit({
  ...base, windowMs: 60 * 60 * 1000, max: 10,
  message: json('Muitas solicitações. Tente novamente em alguns minutos.'),
});

// Código de verificação: tentativas de confirmar (anti adivinhação do código de 6 dígitos).
const verifyLimiter = rateLimit({
  ...base, windowMs: 15 * 60 * 1000, max: 20,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: json('Muitas tentativas de confirmação. Aguarde alguns minutos.'),
});

// Mensagens da IA: freio de rajada por usuário (o limite de verdade são os créditos semanais).
const aiLimiter = rateLimit({
  ...base, windowMs: 60 * 1000, max: 20,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: json('Muitas mensagens em pouco tempo. Aguarde um instante.'),
});

// Chamados de suporte: 5 por hora por usuário (evita spam na caixa do suporte).
const supportLimiter = rateLimit({
  ...base, windowMs: 60 * 60 * 1000, max: 5,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: json('Você já enviou vários chamados em pouco tempo. Aguarde um pouco ou escreva para o e-mail de suporte.'),
});

module.exports = { supportLimiter, loginLimiter, registerLimiter, emailFlowLimiter, verifyLimiter, aiLimiter };
