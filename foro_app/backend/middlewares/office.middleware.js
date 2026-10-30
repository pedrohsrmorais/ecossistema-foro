const { query } = require('../configs/db.config');

// Rotas liberadas mesmo sem escritório criado (conta, cobrança, suporte, o próprio fluxo de escritório).
const EXEMPT = [/^\/auth\//, /^\/users\/me/, /^\/office/, /^\/settings/, /^\/support/, /^\/plans/, /^\/payments/, /^\/modules/, /^\/activity/];

/** Bloqueia o CRM até o usuário criar (ou entrar em) um escritório. */
function requireOffice(req, res, next) {
  if (req.account?.office_configured || EXEMPT.some(rx => rx.test(req.path))) return next();
  res.status(403).json({ error: 'Crie ou entre em um escritório para usar o CRM.', code: 'OFFICE_REQUIRED' });
}

/** Acesso por módulo definido pelo admin (permissions.access_*). Admin sempre passa. */
function requireAccess(key) {
  return (req, res, next) => {
    // A IA lê dados do escritório inteiro: para quem tem visão restrita ("own") ela fica indisponível, para não vazar o que não pode ver.
    if (key === 'ai' && req.user?.role !== 'admin' && req.user?.permissions?.view_scope === 'own') {
      return res.status(403).json({ error: 'O assistente de IA consulta todos os dados do escritório e não está disponível para a visão restrita ("apenas os meus").', code: 'MODULE_NOT_ALLOWED', module: key });
    }
    if (req.user?.permissions?.['access_' + key]) return next();
    res.status(403).json({ error: 'O administrador do escritório não liberou este módulo para o seu usuário.', code: 'MODULE_NOT_ALLOWED', module: key });
  };
}

/**
 * Escopo de visualização: usuário com view_scope 'own' só enxerga o que é dele.
 * Em listas, defina req.viewer (o serviço filtra). Em rotas /:id, valida o registro.
 */
const CHECKS = {
  cases: (id, uid) => query(
    `SELECT 1 FROM cases c WHERE c.id = ? AND c.deleted_at IS NULL AND (c.responsible_user_id = ? OR EXISTS (SELECT 1 FROM case_members m WHERE m.case_id = c.id AND m.user_id = ?)) LIMIT 1`, [id, uid, uid]),
  leads: (id, uid) => query('SELECT 1 FROM leads WHERE id = ? AND assigned_user_id = ? LIMIT 1', [id, uid]),
  documents: (id, uid) => query(
    `SELECT 1 FROM documents d WHERE d.id = ? AND (d.created_by = ? OR (d.case_id IS NOT NULL AND EXISTS (SELECT 1 FROM cases c WHERE c.id = d.case_id AND (c.responsible_user_id = ? OR EXISTS (SELECT 1 FROM case_members m WHERE m.case_id = c.id AND m.user_id = ?))))) LIMIT 1`, [id, uid, uid, uid]),
};
function scoped(entity, param = 'id') {
  return async (req, res, next) => {
    try {
      const own = req.user.role !== 'admin' && req.user.permissions?.view_scope === 'own';
      if (!own) return next();
      req.viewer = req.user.id;
      const id = req.params[param];
      if (!id) return next();
      const [rows] = await CHECKS[entity](id, req.user.id);
      if (!rows.length) return res.status(404).json({ error: 'Registro não encontrado.' });
      next();
    } catch (e) { next(e); }
  };
}

module.exports = { requireOffice, requireAccess, scoped };
