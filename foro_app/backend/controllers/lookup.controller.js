/**
 * lookup.controller.js
 *
 * Endpoints de consulta (CPF, CNPJ — cota semanal por usuário; processos e resumo por IA — carteira,
 * desligados por ora) e enriquecimento de listas. A regra fica nos services (lookup.service.js,
 * lookup-quota.service.js); o controller só repassa o resultado.
 */
const cnpjService = require('../services/cnpj.service');
const cpfService = require('../services/cpf.service');
const processoService = require('../services/processo.service');
const lookupService = require('../services/lookup.service');
const enrichService = require('../services/lookup-enrich.service');
const { AppError } = require('../middlewares/error.middleware');

const refresh = (req) => req.body?.refresh === true;
const withMeta = (r) => ({ data: r.data, meta: { cached: r.cached, counted: r.counted, fetched_at: r.fetched_at, quota: r.quota, consulta_uid: r.consulta_uid, price_cents: r.price_cents, charged_cents: r.charged_cents, balance_cents: r.balance_cents } });

async function cnpj(req, res) {
  res.json(withMeta(await cnpjService.lookupCnpj(req.account.id, req.user.id, req.body?.cnpj, { refresh: refresh(req) })));
}

async function cpf(req, res) {
  res.json(withMeta(await cpfService.lookupCpf(req.account.id, req.user.id, req.body?.cpf, { refresh: refresh(req) })));
}

async function processo(req, res) {
  res.json(withMeta(await processoService.searchProcessos(req.account.id, req.user.id, req.body?.documento, { refresh: refresh(req) })));
}

async function status(req, res) {
  res.json(await lookupService.status(req.account.id, req.user.id));
}

/** Cria um lead com os dados da consulta (que fica em cache); o corpo só diz qual documento e a etapa. */
async function createLead(req, res) {
  const kind = req.params.kind;
  const lead = await lookupService.createLead(req.account.id, req.user, kind, req.body?.document, { stage: req.body?.stage });
  res.status(201).json({ data: lead });
}

// ─── Enriquecimento de listas ────────────────────────────────────────────────
const sendFile = (res, f) => {
  res.setHeader('Content-Type', f.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${f.filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(f.buffer);
};
const fmt = (v) => (v === 'csv' ? 'csv' : 'xlsx');
const enrich = {
  template: async (req, res) => sendFile(res, await enrichService.template(fmt(req.query.format))),
  history: async (req, res) => res.json({ data: await enrichService.history(req.account.id, req.user) }),
  create: async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) throw new AppError('Envie a planilha (.xlsx ou .csv).', 422, 'NO_FILE');
    res.status(201).json(await enrichService.createJob(req.account.id, req.user, { buffer: req.body, name: req.query.name }));
  },
  get: async (req, res) => res.json(await enrichService.get(req.account.id, req.user, req.params.id)),
  analyze: async (req, res) => res.json(await enrichService.analyze(req.account.id, req.user, req.params.id, req.body || {})),
  start: async (req, res) => res.status(202).json(await enrichService.start(req.account.id, req.user, req.params.id, req.body || {})),
  download: async (req, res) => sendFile(res, await enrichService.download(req.account.id, req.user, req.params.id, fmt(req.query.format))),
  toImport: async (req, res) => res.status(201).json(await enrichService.toImport(req.account.id, req.user, req.params.id)),
  discard: async (req, res) => res.json(await enrichService.discard(req.account.id, req.user, req.params.id)),
};

/** Resume um processo já consultado — o cliente envia os dados retornados por POST /lookup/processo */
async function processoSummary(req, res) {
  const { processo } = req.body;
  const data = await processoService.summarizeProcess(req.account.id, req.user.id, processo);
  res.json({ data });
}

module.exports = { cnpj, cpf, processo, processoSummary, status, createLead, enrich };
