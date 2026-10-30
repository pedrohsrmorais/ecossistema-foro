/**
 * permissions.js — o que cada usuário pode fazer, definido pelo administrador do escritório.
 * Administradores sempre podem tudo. Para usuários comuns vale o que estiver em users.permissions
 * (JSON { chave: true|false }); chave ausente usa o padrão abaixo.
 */
const DEFS = [
  { key: 'templates_manage', label: 'Criar e editar modelos de documento do escritório', default: false },
  { key: 'ai_drafts', label: 'Gerar rascunhos de documentos com IA (gasta créditos)', default: true },
  { key: 'delete_records', label: 'Excluir processos e documentos', default: true },
];
const KEYS = DEFS.map(d => d.key);

function resolve(role, stored) {
  const s = (typeof stored === 'string' ? safeParse(stored) : stored) || {};
  const out = {};
  for (const d of DEFS) out[d.key] = role === 'admin' ? true : (typeof s[d.key] === 'boolean' ? s[d.key] : d.default);
  return out;
}
function safeParse(v) { try { return JSON.parse(v); } catch { return {}; } }

/** Valida o que o admin enviou: só chaves conhecidas, só booleanos. */
function sanitize(input) {
  const out = {};
  for (const [k, v] of Object.entries(input || {})) if (KEYS.includes(k) && typeof v === 'boolean') out[k] = v;
  return out;
}

function requirePermission(key) {
  return (req, res, next) => {
    if (req.user?.permissions?.[key]) return next();
    res.status(403).json({ error: 'O administrador do escritório não liberou esta ação para o seu usuário.', code: 'PERMISSION_DENIED', permission: key });
  };
}

module.exports = { DEFS, KEYS, resolve, sanitize, requirePermission };
