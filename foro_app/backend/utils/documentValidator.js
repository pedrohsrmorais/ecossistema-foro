/**
 * documentValidator.js
 *
 * Validação matemática (dígito verificador) de CPF/CNPJ — gratuita, local,
 * sem chamar nenhuma API externa. Usada para rejeitar documentos obviamente
 * inválidos ANTES de debitar créditos e chamar o provedor pago — não é uma
 * consulta de existência/titularidade, só validação de formato.
 */

function isValidCpf(cpf) {
  const digits = String(cpf).replace(/\D/g, '');
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;

  const calc = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += parseInt(digits[i], 10) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return calc(9) === parseInt(digits[9], 10) && calc(10) === parseInt(digits[10], 10);
}

function isValidCnpj(cnpj) {
  const digits = String(cnpj).replace(/\D/g, '');
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;

  const calc = (len) => {
    const weights = len === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) sum += parseInt(digits[i], 10) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  return calc(12) === parseInt(digits[12], 10) && calc(13) === parseInt(digits[13], 10);
}

module.exports = { isValidCpf, isValidCnpj };
