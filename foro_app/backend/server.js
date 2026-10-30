require('dotenv').config();
require('express-async-errors');
const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');

const isProd = process.env.NODE_ENV === 'production';

// ─── Validação de ambiente (falha CEDO em produção, nunca sobe inseguro) ─────
const WEAK_SECRETS = ['change_this_jwt_secret_in_production', 'troque-por-um-segredo-longo-em-producao', 'testsecret', 'secret'];
function assertEnv() {
  const problems = [];
  const jwt = process.env.JWT_SECRET || '';
  if (!jwt) problems.push('JWT_SECRET não definido.');
  if (isProd) {
    if (WEAK_SECRETS.includes(jwt) || jwt.length < 32) problems.push('JWT_SECRET fraco: use um valor aleatório com 32+ caracteres (openssl rand -hex 32).');
    if (['foro_secret', 'root_secret', ''].includes(process.env.DB_PASSWORD || '')) problems.push('DB_PASSWORD é o padrão do repositório — defina uma senha própria.');
  }
  if (problems.length) {
    console.error('❌ Configuração insegura/ausente:\n - ' + problems.join('\n - '));
    process.exit(1);
  }
  if (isProd && !process.env.RESEND_API_KEY) console.warn('⚠️  RESEND_API_KEY ausente: e-mails de confirmação NÃO serão enviados (só logados).');
  if (isProd && !process.env.SUPPORT_EMAIL) console.warn('⚠️  SUPPORT_EMAIL ausente: chamados de suporte ficam só no banco (ninguém será avisado).');
  if (isProd && !process.env.ANTHROPIC_API_KEY) console.warn('⚠️  ANTHROPIC_API_KEY ausente: o chat de IA ficará indisponível.');
  if (isProd && !process.env.CORS_ORIGIN && !process.env.FRONTEND_URL) console.warn('⚠️  Defina FRONTEND_URL/CORS_ORIGIN com o domínio público.');
}
assertEnv();

const apiRoutes = require('./routes/api.routes');
const errorMiddleware = require('./middlewares/error.middleware');
const { testConnection, query } = require('./configs/db.config');
const { migrate } = require('./configs/migrate');

const app = express();
const PORT = process.env.PORT || 3040;

// Atrás do nginx (proxy reverso): confia no X-Forwarded-* do primeiro salto,
// senão o rate limit enxerga o IP do proxy e todos os usuários dividem a mesma cota.
const tp = process.env.TRUST_PROXY;
app.set('trust proxy', tp === undefined || tp === '' ? 1 : (/^\d+$/.test(tp) ? Number(tp) : tp === 'true'));

// ─── Security & Parsing ──────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // desabilitado para o SPA React carregar assets
  crossOriginEmbedderPolicy: false,
}));
const corsOrigin = process.env.CORS_ORIGIN || (isProd && process.env.FRONTEND_URL ? process.env.FRONTEND_URL : '*');
app.use(cors({ origin: corsOrigin === '*' ? '*' : corsOrigin.split(',').map(s => s.trim()), credentials: corsOrigin !== '*' }));
app.use(compression());
// rawBody fica disponível p/ validar assinatura de webhooks (ex.: Stripe-Signature) sobre os bytes originais.
app.use(express.json({ limit: '1mb', verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ─── Logging ─────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(isProd ? 'combined' : 'dev'));
}

// ─── Rate Limiting (global; limites específicos de login etc. ficam em middlewares/rateLimits.js)
app.use('/api', rateLimit({ windowMs: 15 * 60 * 1000, max: 600, standardHeaders: true, legacyHeaders: false }));

// ─── Health check (consulta o banco: "ok" só se o MySQL responde) ────────────
app.get('/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  } catch {
    res.status(503).json({ status: 'db_unavailable', timestamp: new Date().toISOString() });
  }
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api', apiRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));

// ─── Serve React SPA (dist built by: cd frontend && npm run build) ────────────
const distPath = path.join(__dirname, 'dist');
app.use('/assets', express.static(path.join(distPath, 'assets'), { maxAge: '1y', immutable: true }));
app.use(express.static(distPath));
app.get('*', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorMiddleware);

process.on('unhandledRejection', (reason) => console.error('[unhandledRejection]', reason));

// ─── Start ────────────────────────────────────────────────────────────────────
async function start() {
  await testConnection();
  try {
    await migrate();
  } catch (err) {
    console.error('❌ Falha ao migrar o banco:', err.message);
    process.exit(1);
  }
  const server = app.listen(PORT, () => {
    console.log(`🚀 Foro API running on port ${PORT}`);
    console.log(`📦 Serving React build from: ${distPath}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
  require('./jobs/deadline-digest').start();
  const shutdown = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 10000).unref(); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start();

module.exports = app;
