const { query } = require('../configs/db.config');
const deadlines = require('../services/deadlines.service');
const email = require('../services/email.service');

const appUrl = () => (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');
const me = (req) => ({ id: req.user.id, role: req.user.role });

/** Sino + painel: vencidos, hoje e próximos 7 dias do usuário. */
async function summary(req, res) {
  res.json(await deadlines.forUser(req.account.id, me(req)));
}

async function getPrefs(req, res) {
  const [r] = await query('SELECT notify_deadlines_email FROM users WHERE id = ? LIMIT 1', [req.user.id]);
  res.json({ deadlines_email: !!r[0]?.notify_deadlines_email, email: req.user.email });
}

async function setPrefs(req, res) {
  const v = req.body?.deadlines_email;
  if (typeof v !== 'boolean') return res.status(422).json({ error: 'Informe deadlines_email (true/false).' });
  await query('UPDATE users SET notify_deadlines_email = ? WHERE id = ?', [v ? 1 : 0, req.user.id]);
  res.json({ deadlines_email: v });
}

/** Manda o resumo agora (para o usuário conferir se o e-mail chega — e checar o spam). */
async function sendTest(req, res) {
  const [u] = await query('SELECT name, email FROM users WHERE id = ? LIMIT 1', [req.user.id]);
  const data = await deadlines.forUser(req.account.id, me(req));
  await email.sendDeadlineDigest(u[0].email, { name: u[0].name, data, appUrl: appUrl(), isTest: true });
  res.json({ sent_to: u[0].email });
}

module.exports = { summary, getPrefs, setPrefs, sendTest };
