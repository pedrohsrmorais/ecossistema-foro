/**
 * lookup.controller.js
 *
 * Endpoints dos serviços pagos de consulta (CPF, CNPJ, processual) e resumo
 * por IA. Todos debitam créditos automaticamente (ver external-lookup.service.js)
 * — o controller só repassa o resultado ou deixa o erro genérico subir, que
 * já vem formatado como "contate o suporte" pelo service.
 */
const cnpjService = require('../services/cnpj.service');
const cpfService = require('../services/cpf.service');
const processoService = require('../services/processo.service');

async function cnpj(req, res) {
  const { cnpj } = req.body;
  const data = await cnpjService.lookupCnpj(req.account.id, req.user.id, cnpj);
  res.json({ data });
}

async function cpf(req, res) {
  const { cpf } = req.body;
  const data = await cpfService.lookupCpf(req.account.id, req.user.id, cpf);
  res.json({ data });
}

async function processo(req, res) {
  const { documento } = req.body;
  const data = await processoService.searchProcessos(req.account.id, req.user.id, documento);
  res.json({ data });
}

/** Resume um processo já consultado — o cliente envia os dados retornados por POST /lookup/processo */
async function processoSummary(req, res) {
  const { processo } = req.body;
  const data = await processoService.summarizeProcess(req.account.id, req.user.id, processo);
  res.json({ data });
}

module.exports = { cnpj, cpf, processo, processoSummary };
