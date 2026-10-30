const { query } = require('../configs/db.config');
const dashboard = require('../services/dashboard.service');
const support = require('../services/support.service');

async function dashboardOverview(req, res) { res.json(await dashboard.overview(req.account.id, { id: req.user.id, role: req.user.role })); }

async function info(req, res) { res.json(support.info()); }
async function list(req, res) { res.json(await support.list(req.account.id, req.user.id)); }
async function create(req, res) {
  const [u] = await query('SELECT id, name, email FROM users WHERE id = ? LIMIT 1', [req.user.id]);
  const [a] = await query('SELECT id, name, plan_id FROM accounts WHERE id = ? LIMIT 1', [req.account.id]);
  res.status(201).json(await support.create({ accountId: req.account.id, user: u[0], account: a[0], body: req.body }));
}

module.exports = { dashboardOverview, info, list, create };
