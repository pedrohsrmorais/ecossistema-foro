/**
 * 009 — Workspaces: a mesma pessoa pode ter várias "participações" (uma linha em users por workspace):
 * o espaço pessoal e quantos escritórios quiser, cada um com papel, permissões, plano e dados próprios.
 *  - users.person_id liga as linhas da mesma pessoa (login único por e-mail, senha sincronizada).
 *  - e-mail/telefone deixam de ser únicos globais: passam a ser únicos por conta.
 *  - accounts.kind: 'personal' (espaço privado de uma pessoa) | 'office' (escritório com equipe).
 *  - perfil cadastral estendido do escritório + padrões de permissão dos membros (governança).
 */
module.exports.up = async function up(db) {
  await db.addColumn('users', 'person_id', "VARCHAR(36) NULL COMMENT 'identifica a pessoa; varia o workspace (linha) mas não a pessoa'");
  await db.addColumn('users', 'last_used_at', "DATETIME(3) NULL COMMENT 'último workspace usado (o login abre este)'");
  await db.run('UPDATE users SET person_id = id WHERE person_id IS NULL');
  await db.addIndex('users', 'idx_users_person', '(person_id)');

  // e-mail e telefone: únicos por conta (a mesma pessoa aparece em várias contas)
  if (await db.indexExists('users', 'uk_users_email')) await db.run('ALTER TABLE users DROP INDEX uk_users_email');
  if (await db.indexExists('users', 'uk_users_phone')) await db.run('ALTER TABLE users DROP INDEX uk_users_phone');
  if (!(await db.indexExists('users', 'uk_users_account_email'))) await db.run('ALTER TABLE users ADD UNIQUE KEY uk_users_account_email (account_id, email)');
  await db.addIndex('users', 'idx_users_email', '(email)');
  await db.addIndex('users', 'idx_users_phone', '(phone)');

  await db.addColumn('accounts', 'kind', "ENUM('personal','office') NOT NULL DEFAULT 'office'");
  // contas rascunho (sem escritório criado) viram espaço pessoal, já utilizável
  await db.run("UPDATE accounts SET kind = 'personal', office_configured = 1 WHERE office_configured = 0");

  await db.addColumn('accounts', 'legal_name', 'VARCHAR(255) NULL');
  await db.addColumn('accounts', 'website', 'VARCHAR(255) NULL');
  await db.addColumn('accounts', 'office_email', 'VARCHAR(255) NULL');
  await db.addColumn('accounts', 'zip_code', 'VARCHAR(9) NULL');
  await db.addColumn('accounts', 'address_number', 'VARCHAR(20) NULL');
  await db.addColumn('accounts', 'address_complement', 'VARCHAR(100) NULL');
  await db.addColumn('accounts', 'district', 'VARCHAR(100) NULL');
  await db.addColumn('accounts', 'oab_society', 'VARCHAR(40) NULL COMMENT "registro da sociedade na OAB"');
  await db.addColumn('accounts', 'founded_on', 'DATE NULL');
  await db.addColumn('accounts', 'practice_areas', 'JSON NULL');
  await db.addColumn('accounts', 'headcount_total', 'INT NULL COMMENT "integrantes declarados (total)"');
  await db.addColumn('accounts', 'headcount_lawyers', 'INT NULL COMMENT "advogados declarados"');
  await db.addColumn('accounts', 'notes', 'TEXT NULL');
  await db.addColumn('accounts', 'member_defaults', "JSON NULL COMMENT 'permissões padrão dos membros do escritório (governança); o admin pode ajustar por pessoa'");
};
