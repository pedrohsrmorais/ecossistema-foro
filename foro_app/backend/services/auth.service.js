const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');

function generateToken(payload, expiresIn = process.env.JWT_EXPIRES_IN || '7d') {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

/**
 * Registra novo usuário + nova conta (tenant).
 */
async function register({ name, email, password, accountName }) {
  const [existing] = await query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  if (existing.length) throw new AppError('E-mail já cadastrado.', 409);

  const passwordHash = await bcrypt.hash(password, 12);
  const slug = accountName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 60);

  return transaction(async (conn) => {
    // Cria a conta
    const accountId = uuidv4();
    await conn.execute(
      'INSERT INTO accounts (id, name, slug) VALUES (?, ?, ?)',
      [accountId, accountName, `${slug}-${accountId.slice(0, 8)}`]
    );

    // Cria o usuário admin
    const userId = uuidv4();
    await conn.execute(
      'INSERT INTO users (id, account_id, name, email, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, accountId, name, email, passwordHash, 'admin']
    );

    // Cria campos de sistema padrão
    await _seedDefaultFields(conn, accountId);

    const token = generateToken({ id: userId, account_id: accountId, role: 'admin', email });
    return { token, user: { id: userId, name, email, role: 'admin' }, account: { id: accountId, name: accountName } };
  });
}

/**
 * Login com e-mail + senha.
 */
async function login({ email, password }) {
  const [rows] = await query(
    'SELECT u.id, u.name, u.email, u.password_hash, u.role, u.active, u.account_id FROM users u WHERE u.email = ? LIMIT 1',
    [email]
  );

  if (!rows.length) throw new AppError('Credenciais inválidas.', 401);
  const user = rows[0];
  if (!user.active) throw new AppError('Usuário inativo.', 401);

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new AppError('Credenciais inválidas.', 401);

  const token = generateToken({ id: user.id, account_id: user.account_id, role: user.role, email: user.email });
  return {
    token,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  };
}

async function refreshToken(token) {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET, { ignoreExpiration: true });
    const newToken = generateToken({
      id: decoded.id, account_id: decoded.account_id, role: decoded.role, email: decoded.email,
    });
    return { token: newToken };
  } catch {
    throw new AppError('Token inválido.', 401);
  }
}

async function forgotPassword(email) {
  // TODO: implementar envio de e-mail com link de reset
  // Por enquanto apenas não revela se o email existe
  const [rows] = await query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  if (!rows.length) return; // silencioso
  // Em produção: gerar token, salvar em tabela, enviar e-mail
}

async function resetPassword(token, password) {
  // TODO: validar token de reset, atualizar senha
  throw new AppError('Função ainda não implementada.', 501);
}

/**
 * Seed dos campos de sistema que toda conta nova recebe.
 */
async function _seedDefaultFields(conn, accountId) {
  const systemFields = [
    { name: 'area_juridica', label: 'Área jurídica', field_type: 'select', options: JSON.stringify(['Trabalhista','Cível','Criminal','Família','Previdenciário','Tributário','Outros']), display_order: 1 },
    { name: 'preferencia_contato', label: 'Preferência de contato', field_type: 'select', options: JSON.stringify(['Manhã','Tarde','Noite','Qualquer']), display_order: 2 },
    { name: 'descricao_caso', label: 'Descrição do caso', field_type: 'textarea', display_order: 3 },
    { name: 'honorarios', label: 'Honorários (R$)', field_type: 'number', display_order: 4 },
  ];
  for (const f of systemFields) {
    await conn.execute(
      `INSERT INTO field_definitions (id, account_id, name, label, field_type, options, is_system, collect_via_ai, display_order)
       VALUES (UUID(), ?, ?, ?, ?, ?, 1, 1, ?)`,
      [accountId, f.name, f.label, f.field_type, f.options || null, f.display_order]
    );
  }
}

module.exports = { register, login, refreshToken, forgotPassword, resetPassword };
