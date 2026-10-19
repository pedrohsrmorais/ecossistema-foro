const jwt = require('jsonwebtoken');

/**
 * Autenticação da equipe da plataforma (intellsn).
 * Separada de authenticate()/loadClientContext() porque um admin de plataforma
 * não pertence a nenhuma conta (tenant) — ele administra TODAS as contas.
 *
 * Verifica o JWT no header Authorization: Bearer <token> e exige que o
 * payload tenha { type: 'platform_admin' } (gerado em authService.platformLogin).
 * Injeta req.platformAdmin = { platform_admin_id, email, type }.
 */
async function authenticatePlatform(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'platform_admin') {
      return res.status(403).json({ error: 'Acesso restrito ao painel administrativo da plataforma.' });
    }
    req.platformAdmin = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado.' });
    }
    return res.status(401).json({ error: 'Token inválido.' });
  }
}

module.exports = { authenticatePlatform };
