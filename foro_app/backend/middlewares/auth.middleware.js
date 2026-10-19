const jwt = require('jsonwebtoken');
const { query } = require('../configs/db.config');

/**
 * Verifica o JWT no header Authorization: Bearer <token>
 * Injeta req.user = { id, account_id, role, email }
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado.' });
    }
    return res.status(401).json({ error: 'Token inválido.' });
  }
}

/**
 * Garante que o usuário tem role 'admin' na conta.
 */
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' });
  }
  next();
}

/**
 * Exige que o e-mail do usuário esteja verificado (users.email_verified_at).
 * Bloqueia o acesso às rotas protegidas do CRM até que o cadastro seja
 * confirmado via POST /auth/verify-code — ver documentation/banco-de-dados.md.
 *
 * Consultado em tempo real (não via JWT) porque o token é assinado no login,
 * antes da verificação acontecer, e não deve ficar desatualizado.
 */
async function requireVerifiedEmail(req, res, next) {
  try {
    const [rows] = await query('SELECT email_verified_at FROM users WHERE id = ? LIMIT 1', [req.user.id]);
    if (!rows.length) {
      return res.status(401).json({ error: 'Usuário não encontrado.' });
    }
    if (!rows[0].email_verified_at) {
      return res.status(403).json({ error: 'Confirme seu e-mail para continuar.', code: 'EMAIL_NOT_VERIFIED' });
    }
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { authenticate, requireAdmin, requireVerifiedEmail };
