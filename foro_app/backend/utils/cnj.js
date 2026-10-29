/**
 * cnj.js — número único de processo (Resolução CNJ 65/2008):  NNNNNNN-DD.AAAA.J.TR.OOOO
 *   N = sequencial · DD = dígito verificador (módulo 97) · A = ano · J = segmento da justiça
 *   TR = tribunal/região · O = unidade de origem
 *
 * O número já diz qual é o tribunal (J + TR) — usamos isso para rotular o processo e,
 * quando há uma consulta pública confiável, sugerir o link. O link continua editável à mão.
 */

const UF_BY_TR = {
  '01': 'AC', '02': 'AL', '03': 'AP', '04': 'AM', '05': 'BA', '06': 'CE', '07': 'DF', '08': 'ES', '09': 'GO',
  '10': 'MA', '11': 'MT', '12': 'MS', '13': 'MG', '14': 'PA', '15': 'PB', '16': 'PR', '17': 'PE', '18': 'PI',
  '19': 'RJ', '20': 'RN', '21': 'RS', '22': 'RO', '23': 'RR', '24': 'SC', '25': 'SE', '26': 'SP', '27': 'TO',
};

/** Só dígitos → 20 dígitos ou null. */
function digits(input) {
  const d = String(input || '').replace(/\D/g, '');
  return d.length === 20 ? d : null;
}

function format(d) {
  return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`;
}

/** Dígito verificador (ISO 7064 mod 97-10): DD = 98 − ((N·AAAA·JTR·OOOO·00) mod 97). */
function checkDigits(d) {
  const base = d.slice(0, 7) + d.slice(9, 20) + '00';
  let rem = 0;
  for (const ch of base) rem = (rem * 10 + Number(ch)) % 97;
  return String(98 - rem).padStart(2, '0');
}

function isValid(input) {
  const d = digits(input);
  return Boolean(d) && checkDigits(d) === d.slice(7, 9);
}

/** Identifica o tribunal a partir de J e TR. */
function tribunalOf(input) {
  const d = digits(input);
  if (!d) return null;
  const j = d[13];
  const tr = d.slice(14, 16);
  switch (j) {
    case '1': return { code: 'STF', name: 'Supremo Tribunal Federal' };
    case '2': return { code: 'CNJ', name: 'Conselho Nacional de Justiça' };
    case '3': return { code: 'STJ', name: 'Superior Tribunal de Justiça' };
    case '4': return { code: `TRF${Number(tr)}`, name: `Tribunal Regional Federal da ${Number(tr)}ª Região` };
    case '5': return tr === '00'
      ? { code: 'TST', name: 'Tribunal Superior do Trabalho' }
      : { code: `TRT${Number(tr)}`, name: `Tribunal Regional do Trabalho da ${Number(tr)}ª Região` };
    case '6': return tr === '00'
      ? { code: 'TSE', name: 'Tribunal Superior Eleitoral' }
      : { code: `TRE-${UF_BY_TR[tr] || tr}`, name: `Tribunal Regional Eleitoral (${UF_BY_TR[tr] || tr})` };
    case '7': return { code: 'JMU', name: 'Justiça Militar da União' };
    case '8': return UF_BY_TR[tr]
      ? { code: `TJ${UF_BY_TR[tr]}`, name: `Tribunal de Justiça (${UF_BY_TR[tr]})` }
      : null;
    case '9': return { code: `JME-${UF_BY_TR[tr] || tr}`, name: 'Justiça Militar Estadual' };
    default: return null;
  }
}

/**
 * Link sugerido. Só existe onde o formato é conhecido e estável; nos demais tribunais
 * (a maioria exige captcha/login ou usa portais próprios) retorna null e o usuário cola o link.
 */
function suggestedUrl(input) {
  const d = digits(input);
  const trib = d && tribunalOf(d);
  if (!trib) return null;
  if (trib.code === 'TJSP') {
    const num = format(d);
    const unif = `${num.slice(0, 15)}`; // NNNNNNN-DD.AAAA
    const foro = d.slice(16, 20);
    return `https://esaj.tjsp.jus.br/cpopg/search.do?cbPesquisa=NUMPROC&numeroDigitoAnoUnificado=${encodeURIComponent(unif)}&foroNumeroUnificado=${foro}&dadosConsulta.valorConsultaNuUnificado=${encodeURIComponent(num)}&dadosConsulta.tipoNuProcesso=UNIFICADO`;
  }
  return null;
}

/** Normaliza o que o usuário digitou: devolve { case_number, tribunal, valid, suggested_url } ou null se vazio. */
function analyze(input) {
  if (!input || !String(input).trim()) return null;
  const d = digits(input);
  if (!d) return { case_number: String(input).trim(), tribunal: null, valid: false, suggested_url: null };
  const t = tribunalOf(d);
  return { case_number: format(d), tribunal: t?.code || null, tribunal_name: t?.name || null, valid: checkDigits(d) === d.slice(7, 9), suggested_url: suggestedUrl(d) };
}

module.exports = { digits, format, checkDigits, isValid, tribunalOf, suggestedUrl, analyze };
