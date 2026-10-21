/**
 * modules.service.js
 *
 * Catálogo de módulos (funcionalidades) do produto e seu estado por conta.
 * Por padrão TODO módulo está ativo para toda conta — uma linha em
 * `account_modules` só existe quando um admin da plataforma mudou esse
 * padrão explicitamente (ver init.sql, seção 8). Isso evita ter que semear
 * uma linha por módulo em toda conta nova.
 *
 * Decisão de negócio: só a equipe da intellsn (painel administrativo) liga
 * ou desliga um módulo — não existe essa ação para o próprio tenant.
 */
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');

/** Catálogo completo de módulos (para a tela de admin montar os toggles). */
async function listCatalog() {
  const [rows] = await query('SELECT * FROM modules ORDER BY display_order');
  return rows;
}

/**
 * Módulos e seu estado (enabled true/false) para UMA conta — usado tanto
 * pelo frontend do tenant (pra saber o que mostrar no menu) quanto pela
 * tela de admin (pra montar os toggles daquela conta).
 */
async function listForAccount(accountId) {
  const [rows] = await query(
    `SELECT m.module_key, m.name, m.description, m.display_order,
            COALESCE(am.enabled, 1) AS enabled
     FROM modules m
     LEFT JOIN account_modules am ON am.module_key = m.module_key AND am.account_id = ?
     ORDER BY m.display_order`,
    [accountId]
  );
  return rows.map(r => ({ ...r, enabled: Boolean(r.enabled) }));
}

/**
 * Checagem rápida usada pelo middleware requireModule() — "sem linha" em
 * account_modules significa módulo ativo (padrão).
 */
async function isEnabled(accountId, moduleKey) {
  const [rows] = await query(
    'SELECT enabled FROM account_modules WHERE account_id = ? AND module_key = ? LIMIT 1',
    [accountId, moduleKey]
  );
  if (!rows.length) return true;
  return Boolean(rows[0].enabled);
}

/**
 * Liga/desliga um módulo para uma conta. Exclusivo do painel administrativo
 * (platformAdminId sempre obrigatório, registrado para auditoria).
 */
async function setEnabled(accountId, moduleKey, enabled, platformAdminId) {
  const [catalog] = await query('SELECT 1 FROM modules WHERE module_key = ? LIMIT 1', [moduleKey]);
  if (!catalog.length) throw new AppError(`Módulo "${moduleKey}" não existe.`, 400);

  await query(
    `INSERT INTO account_modules (account_id, module_key, enabled, updated_by_platform_admin)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), updated_by_platform_admin = VALUES(updated_by_platform_admin)`,
    [accountId, moduleKey, enabled ? 1 : 0, platformAdminId]
  );

  return listForAccount(accountId);
}

module.exports = { listCatalog, listForAccount, isEnabled, setEnabled };
