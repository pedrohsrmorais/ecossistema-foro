/**
 * permissions.js — o que cada usuário pode fazer, definido pelo administrador do escritório.
 * Administradores sempre podem tudo. Para usuários comuns vale o que estiver em users.permissions
 * (JSON { chave: true|false, view_scope: 'all'|'own' }); chave ausente usa o padrão abaixo.
 *
 * group 'module' = acesso à área do CRM (a aba some/bloqueia); group 'action' = ação específica.
 */
const DEFS = [
  { key: 'access_leads', group: 'module', label: 'Acessar Leads', default: true },
  { key: 'access_cases', group: 'module', label: 'Acessar Processos', default: true },
  { key: 'access_documents', group: 'module', label: 'Acessar Documentos e o Gerador', default: true },
  { key: 'access_agenda', group: 'module', label: 'Acessar Agenda e Tarefas', default: true },
  { key: 'access_ai', group: 'module', label: 'Usar o Assistente de IA (gasta créditos)', default: true },
  { key: 'create_leads', group: 'action', label: 'Cadastrar leads', default: true },
  { key: 'delete_leads', group: 'action', label: 'Excluir leads', default: true },
  { key: 'create_cases', group: 'action', label: 'Cadastrar processos', default: true },
  { key: 'create_events', group: 'action', label: 'Criar compromissos, prazos e tarefas na agenda', default: true },
  { key: 'ai_write', group: 'action', label: 'A IA pode criar, alterar e excluir dados em nome da pessoa (desmarcado: só consulta)', default: true },
  { key: 'templates_manage', group: 'action', label: 'Criar e editar modelos de documento do escritório', default: false },
  { key: 'ai_drafts', group: 'action', label: 'Gerar rascunhos de documentos com IA (gasta créditos)', default: true },
  { key: 'delete_records', group: 'action', label: 'Excluir processos e documentos', default: true },
];
const KEYS = DEFS.map(d => d.key);
const SCOPES = ['all', 'own'];

/**
 * Ordem de precedência para membros: ajuste individual (users.permissions) > padrão do escritório
 * (accounts.member_defaults, definido pelo admin) > padrão da plataforma (DEFS). Admin sempre pode tudo.
 */
function resolve(role, stored, officeDefaults) {
  const s = (typeof stored === 'string' ? safeParse(stored) : stored) || {};
  const o = (typeof officeDefaults === 'string' ? safeParse(officeDefaults) : officeDefaults) || {};
  const out = {};
  for (const d of DEFS) {
    out[d.key] = role === 'admin' ? true
      : typeof s[d.key] === 'boolean' ? s[d.key]
      : typeof o[d.key] === 'boolean' ? o[d.key] : d.default;
  }
  out.view_scope = role === 'admin' ? 'all'
    : SCOPES.includes(s.view_scope) ? s.view_scope
    : SCOPES.includes(o.view_scope) ? o.view_scope : 'all';
  return out;
}
function safeParse(v) { try { return JSON.parse(v); } catch { return {}; } }

/** Valida o que o admin enviou: só chaves conhecidas, booleanos (e view_scope all|own). */
function sanitize(input) {
  const out = {};
  for (const [k, v] of Object.entries(input || {})) {
    if (KEYS.includes(k) && typeof v === 'boolean') out[k] = v;
    else if (k === 'view_scope' && SCOPES.includes(v)) out[k] = v;
  }
  return out;
}

function requirePermission(key) {
  return (req, res, next) => {
    if (req.user?.permissions?.[key]) return next();
    res.status(403).json({ error: 'O administrador do escritório não liberou esta ação para o seu usuário.', code: 'PERMISSION_DENIED', permission: key });
  };
}

module.exports = { DEFS, KEYS, SCOPES, resolve, sanitize, requirePermission };
