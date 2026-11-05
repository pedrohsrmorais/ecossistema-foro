/**
 * cpf.service.js — consulta de CPF (Direct Data: "Cadastro - Pessoa Física - Básica").
 * Nome, data de nascimento, telefones (com WhatsApp), e-mails e endereços. A lógica (cache, créditos, estorno)
 * fica em lookup.service.js.
 */
const lookupService = require('./lookup.service');

const lookupCpf = (accountId, userId, cpf, opts) => lookupService.lookup(accountId, userId, 'cpf', cpf, opts);

module.exports = { lookupCpf };
