const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { query, transaction } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');
const emailService = require('./email.service');

const VERIFICATION_CODE_TTL_MIN = 10;   // validade do código de e-mail/celular
const RESET_TOKEN_TTL_MIN = 60;         // validade do link de redefinição de senha
const MAX_VERIFICATION_ATTEMPTS = 5;    // tentativas antes de exigir novo código

function generateToken(payload, expiresIn = process.env.JWT_EXPIRES_IN || '7d') {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

function _hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function _generateNumericCode(length = 6) {
  const max = 10 ** length;
  return String(crypto.randomInt(0, max)).padStart(length, '0');
}

/**
 * Registra novo usuário + nova conta (tenant).
 * O e-mail já sai com um código de verificação disparado (ver sendVerificationCode).
 * Login funciona imediatamente após o cadastro — a verificação de e-mail/celular
 * NÃO bloqueia o acesso hoje; ela habilita o fluxo de "esqueci minha senha" com
 * segurança e fica marcada em users.email_verified_at / phone_verified_at.
 */
async function register({ name, email, password, phone, accountName }) {
  const [existing] = await query('SELECT id FROM users WHERE email = ? LIMIT 1', [email]);
  if (existing.length) throw new AppError('E-mail já cadastrado.', 409);

  const passwordHash = await bcrypt.hash(password, 12);
  const slug = accountName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 60);

  const result = await transaction(async (conn) => {
    // Cria a conta com 14 dias de teste gratuito (status 'trialing' por padrão)
    const accountId = uuidv4();
    const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    await conn.execute(
      'INSERT INTO accounts (id, name, slug, trial_ends_at) VALUES (?, ?, ?, ?)',
      [accountId, accountName, `${slug}-${accountId.slice(0, 8)}`, trialEndsAt]
    );

    // Cria o usuário admin
    const userId = uuidv4();
    await conn.execute(
      'INSERT INTO users (id, account_id, name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [userId, accountId, name, email, phone || null, passwordHash, 'admin']
    );

    // Cria campos de sistema padrão
    await _seedDefaultFields(conn, accountId);

    const token = generateToken({ id: userId, account_id: accountId, role: 'admin', email });
    return { token, user: { id: userId, name, email, role: 'admin' }, account: { id: accountId, name: accountName } };
  });

  // Dispara o código de verificação de e-mail (fora da transação, não bloqueia o cadastro se falhar)
  sendVerificationCode(result.user.id, 'email').catch(err =>
    console.error('[auth] Falha ao enviar código de verificação de e-mail:', err.message)
  );

  return result;
}

/**
 * Login com e-mail + senha.
 */
async function login({ email, password }) {
  const [rows] = await query(
    `SELECT u.id, u.name, u.email, u.password_hash, u.role, u.active, u.account_id,
            u.email_verified_at, u.phone_verified_at
     FROM users u WHERE u.email = ? LIMIT 1`,
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
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      email_verified: Boolean(user.email_verified_at),
      phone_verified: Boolean(user.phone_verified_at),
    },
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

// ─── Verificação de e-mail / celular (OTP) ────────────────────────────────────

/**
 * Gera um código numérico de 6 dígitos e "envia" para o canal informado.
 *
 * IMPORTANTE: o envio real (SMTP/SendGrid/Resend para e-mail; Twilio/Zenvia
 * para SMS) ainda NÃO está integrado — por enquanto o código é apenas
 * logado no console do servidor (ambiente de desenvolvimento). Antes de ir
 * para produção, troque o bloco "TODO: integrar provedor" abaixo por uma
 * chamada real ao provedor escolhido.
 */
async function sendVerificationCode(userId, channel) {
  if (!['email', 'phone'].includes(channel)) throw new AppError('Canal inválido.', 400);

  const [rows] = await query('SELECT id, name, email, phone FROM users WHERE id = ? LIMIT 1', [userId]);
  if (!rows.length) throw new AppError('Usuário não encontrado.', 404);
  const user = rows[0];

  if (channel === 'phone' && !user.phone) {
    throw new AppError('Usuário não possui celular cadastrado.', 400);
  }

  const code = _generateNumericCode(6);
  const expiresAt = new Date(Date.now() + VERIFICATION_CODE_TTL_MIN * 60 * 1000);

  await query(
    'INSERT INTO verification_codes (id, user_id, channel, code, expires_at) VALUES (UUID(), ?, ?, ?, ?)',
    [userId, channel, code, expiresAt]
  );

  if (channel === 'email') {
    await emailService.sendVerificationEmail(user.email, code, VERIFICATION_CODE_TTL_MIN);
  } else {
    // TODO: integrar provedor de SMS (ex: Twilio/Zenvia) — nenhum foi escolhido ainda.
    console.log(`[DEV] Código de verificação (phone) para ${user.phone}: ${code} (expira em ${VERIFICATION_CODE_TTL_MIN} min)`);
  }

  return { sent: true, channel, expires_in_minutes: VERIFICATION_CODE_TTL_MIN };
}

/**
 * Valida o código informado e marca o canal como verificado.
 */
async function verifyCode(userId, channel, code) {
  if (!['email', 'phone'].includes(channel)) throw new AppError('Canal inválido.', 400);

  const [rows] = await query(
    `SELECT id, code, attempts, expires_at, consumed_at FROM verification_codes
     WHERE user_id = ? AND channel = ? AND consumed_at IS NULL
     ORDER BY created_at DESC LIMIT 1`,
    [userId, channel]
  );

  if (!rows.length) throw new AppError('Nenhum código pendente. Solicite um novo.', 400);
  const record = rows[0];

  if (new Date(record.expires_at) < new Date()) {
    throw new AppError('Código expirado. Solicite um novo.', 400);
  }
  if (record.attempts >= MAX_VERIFICATION_ATTEMPTS) {
    throw new AppError('Número máximo de tentativas excedido. Solicite um novo código.', 429);
  }

  if (record.code !== String(code)) {
    await query('UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?', [record.id]);
    throw new AppError('Código inválido.', 400);
  }

  const column = channel === 'email' ? 'email_verified_at' : 'phone_verified_at';
  await transaction(async (conn) => {
    await conn.execute('UPDATE verification_codes SET consumed_at = NOW() WHERE id = ?', [record.id]);
    await conn.execute(`UPDATE users SET ${column} = NOW() WHERE id = ?`, [userId]);
  });

  return { verified: true, channel };
}

// ─── Redefinição de senha ─────────────────────────────────────────────────────

/**
 * Gera um token de redefinição de senha e "envia" o link por e-mail.
 * Nunca revela se o e-mail existe ou não na base (evita enumeração de contas).
 */
async function forgotPassword(email) {
  const [rows] = await query('SELECT id, name FROM users WHERE email = ? LIMIT 1', [email]);
  if (!rows.length) return; // silencioso — não revela se o e-mail existe

  const user = rows[0];
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = _hashToken(token);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MIN * 60 * 1000);

  await query(
    'INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at) VALUES (UUID(), ?, ?, ?)',
    [user.id, tokenHash, expiresAt]
  );

  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
  await emailService.sendPasswordResetEmail(email, resetUrl, RESET_TOKEN_TTL_MIN);
}

async function resetPassword(token, password) {
  const tokenHash = _hashToken(token);
  const [rows] = await query(
    'SELECT id, user_id, expires_at, used_at FROM password_reset_tokens WHERE token_hash = ? LIMIT 1',
    [tokenHash]
  );
  if (!rows.length) throw new AppError('Token inválido.', 400);

  const record = rows[0];
  if (record.used_at) throw new AppError('Este link já foi utilizado.', 400);
  if (new Date(record.expires_at) < new Date()) throw new AppError('Link expirado. Solicite um novo.', 400);

  const passwordHash = await bcrypt.hash(password, 12);
  await transaction(async (conn) => {
    await conn.execute('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, record.user_id]);
    await conn.execute('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?', [record.id]);
  });
}

// ─── Plataforma (equipe intellsn — fora do contexto de qualquer tenant) ───────

async function platformLogin({ email, password }) {
  const [rows] = await query(
    'SELECT id, name, email, password_hash, active FROM platform_admins WHERE email = ? LIMIT 1',
    [email]
  );
  if (!rows.length) throw new AppError('Credenciais inválidas.', 401);

  const admin = rows[0];
  if (!admin.active) throw new AppError('Administrador inativo.', 401);

  const valid = await bcrypt.compare(password, admin.password_hash);
  if (!valid) throw new AppError('Credenciais inválidas.', 401);

  const token = jwt.sign(
    { platform_admin_id: admin.id, email: admin.email, type: 'platform_admin' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

  return { token, admin: { id: admin.id, name: admin.name, email: admin.email } };
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

module.exports = {
  register, login, refreshToken,
  sendVerificationCode, verifyCode,
  forgotPassword, resetPassword,
  platformLogin,
};
