const jwt = require('jsonwebtoken');
const { query } = require('../configs/db.config');
const permissions = require('../configs/permissions');

/**
 * Verifica o JWT (Authorization: Bearer <token>) e confere no banco que o usuário
 * ainda existe, está ATIVO e pertence à conta do token. Papel (role) e verificação
 * de e-mail vêm sempre do banco — nunca do token — para que desativar/rebaixar
 * alguém tenha efeito imediato.
 * Injeta req.user = { id, account_id, role, email, email_verified }
 */
async function authenticate(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
  }

  let decoded;
  try {
    decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ error: 'Token expirado.' });
    return res.status(401).json({ error: 'Token inválido.' });
  }
  if (!decoded.id || !decoded.account_id) return res.status(401).json({ error: 'Token inválido.' });

  try {
    const [rows] = await query(
      'SELECT id, account_id, email, role, active, permissions, email_verified_at FROM users WHERE id = ? LIMIT 1',
      [decoded.id]
    );
    const u = rows[0];
    if (!u || !u.active || u.account_id !== decoded.account_id) {
      return res.status(401).json({ error: 'Sessão inválida. Entre novamente.' });
    }
    req.user = { id: u.id, account_id: u.account_id, role: u.role, email: u.email, email_verified: Boolean(u.email_verified_at), permissions: permissions.resolve(u.role, u.permissions) };
    next();
  } catch (err) {
    next(err);
  }
}

/** Garante que o usuário tem role 'admin' na conta. */
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Acesso restrito a administradores.' });
  }
  next();
}

/**
 * Exige e-mail confirmado (users.email_verified_at). Bloqueia as rotas do CRM até a
 * confirmação via POST /auth/verify-code (ou pelo link de convite/redefinição de senha).
 */
function requireVerifiedEmail(req, res, next) {
  if (!req.user?.email_verified) {
    return res.status(403).json({ error: 'Confirme seu e-mail para continuar.', code: 'EMAIL_NOT_VERIFIED' });
  }
  next();
}

module.exports = { authenticate, requireAdmin, requireVerifiedEmail };
