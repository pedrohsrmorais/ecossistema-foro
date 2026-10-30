/**
 * case-members.service.js — quem, do escritório, responde pelo processo.
 * Papéis: responsavel (pode haver mais de um) e colaborador. O primeiro "responsavel" é espelhado em
 * cases.responsible_user_id (usado em alertas de prazo e listagens).
 */
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');

const ROLES = ['responsavel', 'colaborador'];

async function list(caseId, accountId) {
  const [rows] = await query(
    `SELECT m.id, m.user_id, m.role, u.name, u.email, u.active FROM case_members m JOIN users u ON u.id = m.user_id
     WHERE m.case_id = ? AND m.account_id = ? ORDER BY m.role = 'colaborador', u.name`, [caseId, accountId]);
  return rows;
}

/** Substitui o conjunto de membros. `members` = [{ user_id, role }]. */
async function set(caseId, accountId, members) {
  const [c] = await query('SELECT id FROM cases WHERE id = ? AND account_id = ? AND deleted_at IS NULL LIMIT 1', [caseId, accountId]);
  if (!c.length) throw new AppError('Processo não encontrado.', 404);
  if (!Array.isArray(members)) throw new AppError('Envie members como lista.', 422, 'VALIDATION');
  if (members.length > 30) throw new AppError('Máximo de 30 membros por processo.', 422, 'VALIDATION');
  const seen = new Set();
  for (const m of members) {
    if (!m || !m.user_id || !ROLES.includes(m.role || 'colaborador')) throw new AppError(`Cada membro precisa de user_id e papel (${ROLES.join(' ou ')}).`, 422, 'VALIDATION');
    if (seen.has(m.user_id)) throw new AppError('Usuário repetido na lista.', 422, 'VALIDATION');
    seen.add(m.user_id);
  }
  if (seen.size) {
    const [u] = await query(`SELECT id FROM users WHERE account_id = ? AND active = 1 AND id IN (${[...seen].map(() => '?').join(',')})`, [accountId, ...seen]);
    if (u.length !== seen.size) throw new AppError('Algum usuário não existe, está inativo ou é de outra conta.', 404);
  }
  await transaction(async (conn) => {
    await conn.execute('DELETE FROM case_members WHERE case_id = ? AND account_id = ?', [caseId, accountId]);
    for (const m of members) {
      await conn.execute('INSERT INTO case_members (id, account_id, case_id, user_id, role) VALUES (?, ?, ?, ?, ?)', [uuidv4(), accountId, caseId, m.user_id, m.role || 'colaborador']);
    }
    const primary = members.find(m => m.role === 'responsavel');
    await conn.execute('UPDATE cases SET responsible_user_id = ? WHERE id = ? AND account_id = ?', [primary ? primary.user_id : null, caseId, accountId]);
  });
  return list(caseId, accountId);
}

/** Garante o usuário como responsável quando o processo nasce (ou quando só há responsible_user_id). */
async function ensureResponsible(caseId, accountId, userId) {
  if (!userId) return;
  await query(
    `INSERT INTO case_members (id, account_id, case_id, user_id, role) VALUES (?, ?, ?, ?, 'responsavel')
     ON DUPLICATE KEY UPDATE role = 'responsavel'`, [uuidv4(), accountId, caseId, userId]);
}

module.exports = { ROLES, list, set, ensureResponsible };
