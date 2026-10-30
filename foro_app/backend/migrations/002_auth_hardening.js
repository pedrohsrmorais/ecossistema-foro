/**
 * 002 — Endurecimento de auth e histórico da IA.
 *  - ai_messages.created_at com milissegundos (a ordem user/assistant dentro do mesmo segundo
 *    era indefinida e podia embaralhar o histórico enviado ao modelo).
 *  - password_reset_tokens.purpose: 'reset' (esqueci a senha) ou 'invite' (convite de equipe).
 */
module.exports.up = async function up(db) {
  await db.run('ALTER TABLE ai_messages MODIFY created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)');
  await db.addColumn('password_reset_tokens', 'purpose', "ENUM('reset','invite') NOT NULL DEFAULT 'reset'");
};
