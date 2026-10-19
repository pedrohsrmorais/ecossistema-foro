const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  database: process.env.DB_NAME || 'foro_db',
  user: process.env.DB_USER || 'foro_user',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '10'),
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  timezone: '-03:00', // Brasília
});

/**
 * Testa a conexão com o banco ao iniciar o servidor.
 */
async function testConnection() {
  try {
    const conn = await pool.getConnection();
    console.log('✅ MySQL connected to:', process.env.DB_NAME);
    conn.release();
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
    process.exit(1);
  }
}

/**
 * Executa uma query usando o pool.
 * @param {string} sql
 * @param {any[]} params
 * @returns {Promise<[any[], any]>}
 */
async function query(sql, params = []) {
  return pool.execute(sql, params);
}

/**
 * Executa múltiplas queries dentro de uma transação.
 * @param {(conn: import('mysql2/promise').PoolConnection) => Promise<T>} callback
 * @returns {Promise<T>}
 */
async function transaction(callback) {
  const conn = await pool.getConnection();
  await conn.beginTransaction();
  try {
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, transaction, testConnection };
