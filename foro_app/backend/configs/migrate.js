/**
 * Runner de migrações — roda automaticamente no boot (server.js), ANTES de abrir a porta.
 *
 * Por que existe: o init.sql só é aplicado na PRIMEIRA subida do MySQL (volume vazio).
 * Qualquer mudança de schema depois disso precisa de uma migração aqui, para que
 * `git pull && docker compose up -d --build` atualize o banco de produção sozinho.
 *
 * Regras para escrever migrações (backend/migrations/NNN_nome.js):
 *   - Exporta `async function up(db)`; `db` traz helpers idempotentes (addColumn, tableExists...).
 *   - Nome em ordem lexicográfica (001_, 002_...). Uma migração aplicada nunca é editada: crie outra.
 *   - Deve ser SEGURA em banco novo (onde o init.sql já criou tudo) e em banco antigo.
 *   - Um lock do MySQL (GET_LOCK) impede duas instâncias migrando ao mesmo tempo.
 */
const fs = require('fs');
const path = require('path');
const { pool } = require('./db.config');

const DIR = path.join(__dirname, '..', 'migrations');

function helpers(conn) {
  const run = (sql, params = []) => conn.query(sql, params);
  return {
    run,
    async tableExists(table) {
      const [r] = await run('SELECT 1 FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?', [table]);
      return r.length > 0;
    },
    async columnExists(table, column) {
      const [r] = await run('SELECT 1 FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?', [table, column]);
      return r.length > 0;
    },
    async addColumn(table, column, definition) {
      if (!(await this.columnExists(table, column))) await run(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
    },
    async indexExists(table, name) {
      const [r] = await run('SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?', [table, name]);
      return r.length > 0;
    },
    async addIndex(table, name, columnsSql) {
      const [r] = await run('SELECT 1 FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?', [table, name]);
      if (!r.length) await run(`ALTER TABLE \`${table}\` ADD KEY \`${name}\` ${columnsSql}`);
    },
  };
}

async function migrate() {
  const conn = await pool.getConnection();
  try {
    const [[lock]] = await conn.query("SELECT GET_LOCK('foro_migrations', 60) AS got");
    if (!lock.got) throw new Error('Não foi possível obter o lock de migração (outra instância migrando?).');

    await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name VARCHAR(190) NOT NULL PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);

    const [done] = await conn.query('SELECT name FROM schema_migrations');
    const applied = new Set(done.map(r => r.name));
    const files = fs.readdirSync(DIR).filter(f => /^\d+_.+\.js$/.test(f)).sort();

    for (const file of files) {
      const name = file.replace(/\.js$/, '');
      if (applied.has(name)) continue;
      console.log(`[migrate] aplicando ${name}...`);
      await require(path.join(DIR, file)).up(helpers(conn));
      await conn.query('INSERT INTO schema_migrations (name) VALUES (?)', [name]);
      console.log(`[migrate] ${name} ok`);
    }
  } finally {
    try { await conn.query("SELECT RELEASE_LOCK('foro_migrations')"); } catch { /* conexão já caiu */ }
    conn.release();
  }
}

module.exports = { migrate };
