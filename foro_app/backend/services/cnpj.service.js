/**
 * cnpj.service.js — consulta de CNPJ (Direct Data: "Cadastro - Pessoa Jurídica - Básica").
 * Razão social, CNAE, porte, sócios, telefones, e-mails e endereços. A lógica (cache, créditos, estorno)
 * fica em lookup.service.js.
 */
const lookupService = require('./lookup.service');

const lookupCnpj = (accountId, userId, cnpj, opts) => lookupService.lookup(accountId, userId, 'cnpj', cnpj, opts);

module.exports = { lookupCnpj };
