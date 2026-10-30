/**
 * person.service.js — a mesma PESSOA em vários workspaces (uma linha em users por workspace, ligadas por person_id).
 * Credenciais (senha, e-mail confirmado) valem para a pessoa toda e são mantidas iguais em todas as linhas.
 */
const { query } = require('../configs/db.config');

async function personIdOf(userId, conn) {
  const run = conn ? (s, p) => conn.execute(s, p) : query;
  const [r] = await run('SELECT person_id FROM users WHERE id = ? LIMIT 1', [userId]);
  return r[0]?.person_id || userId;
}

/** Aplica a todas as linhas da pessoa: { password_hash?, email_verified_at?: 'now', phone_verified_at?: 'now' }. */
async function syncCredentials(userId, { passwordHash, emailVerified, phoneVerified } = {}, conn) {
  const run = conn ? (s, p) => conn.execute(s, p) : query;
  const pid = await personIdOf(userId, conn);
  if (passwordHash) await run('UPDATE users SET password_hash = ? WHERE person_id = ?', [passwordHash, pid]);
  if (emailVerified) await run('UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE person_id = ?', [pid]);
  if (phoneVerified) await run('UPDATE users SET phone_verified_at = COALESCE(phone_verified_at, NOW()) WHERE person_id = ?', [pid]);
}

module.exports = { personIdOf, syncCredentials };
