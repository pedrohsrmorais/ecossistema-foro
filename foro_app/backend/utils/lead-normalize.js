/**
 * lead-normalize.js — limpeza e extração (regex) de dados de contato vindos de planilhas.
 * Funções puras, sem banco: CPF/CNPJ, telefone BR, e-mail, UF, CEP, nome e extração de texto livre.
 */
const { isValidCpf, isValidCnpj } = require('./documentValidator');

const DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77, 79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

const UF_NAMES = {
  AC: 'acre', AL: 'alagoas', AP: 'amapa', AM: 'amazonas', BA: 'bahia', CE: 'ceara', DF: 'distrito federal', ES: 'espirito santo',
  GO: 'goias', MA: 'maranhao', MT: 'mato grosso', MS: 'mato grosso do sul', MG: 'minas gerais', PA: 'para', PB: 'paraiba',
  PR: 'parana', PE: 'pernambuco', PI: 'piaui', RJ: 'rio de janeiro', RN: 'rio grande do norte', RS: 'rio grande do sul',
  RO: 'rondonia', RR: 'roraima', SC: 'santa catarina', SP: 'sao paulo', SE: 'sergipe', TO: 'tocantins',
};
const UF_BY_NAME = Object.fromEntries(Object.entries(UF_NAMES).map(([uf, n]) => [n, uf]));

const strip = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Cabeçalho comparável: minúsculas, sem acento, sinais viram espaço ("E-mail 1 - Value" → "e mail 1 value"). */
const normHeader = (s) => strip(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const digits = (s) => String(s ?? '').replace(/\D/g, '');
const clean = (s) => String(s ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();

// ─── Nome ────────────────────────────────────────────────────────────────────
const PARTICLES = new Set(['da', 'de', 'do', 'das', 'dos', 'e', 'di', 'du', 'del', 'van', 'von']);
/** "JOAO DA SILVA" → "Joao da Silva". Só mexe quando está TODO em maiúsculas ou TODO em minúsculas. */
function properName(raw) {
  const s = clean(raw);
  if (!s) return '';
  const letters = s.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (!letters || (letters !== letters.toUpperCase() && letters !== letters.toLowerCase())) return s;
  return s.toLowerCase().split(' ').map((w, i) => {
    if (i > 0 && PARTICLES.has(w)) return w;
    return w.replace(/(^|[-'’.])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  }).join(' ');
}

// ─── CPF / CNPJ ──────────────────────────────────────────────────────────────
/**
 * `numeric` = a célula era um número no Excel (zeros à esquerda se perderam). Completa com zeros:
 * até 11 dígitos → CPF; 12 a 14 → CNPJ. Só vale se o dígito verificador fechar.
 */
function normDocument(raw, { numeric = false } = {}) {
  let d = digits(raw);
  if (!d) return null;
  const original = d;
  if (d.length < 11 && (numeric || d.length >= 9)) d = d.padStart(11, '0');
  else if (d.length > 11 && d.length < 14 && (numeric || d.length >= 12)) d = d.padStart(14, '0');
  if (d.length === 11) return { digits: d, type: 'cpf', valid: isValidCpf(d), padded: d !== original };
  if (d.length === 14) return { digits: d, type: 'cnpj', valid: isValidCnpj(d), padded: d !== original };
  return { digits: original, type: null, valid: false, padded: false };
}
const formatDocument = (d) => {
  const s = digits(d);
  if (s.length === 11) return s.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (s.length === 14) return s.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return s;
};

// ─── Telefone ────────────────────────────────────────────────────────────────
/**
 * Telefone brasileiro → "(DD) 9XXXX-XXXX" / "(DD) XXXX-XXXX". Aceita +55, 55, 0 inicial e DDD padrão.
 * Celular antigo de 8 dígitos (começa com 6–9) ganha o 9. Número estrangeiro (+ e DDI ≠ 55) é mantido.
 * Devolve { value, kind: 'celular'|'fixo'|'internacional', fixed?, reason? } — reason quando inválido.
 */
function normPhone(raw, { defaultDdd = null } = {}) {
  const text = clean(raw);
  let d = digits(text);
  if (!d) return null;
  const plus = /^\+/.test(text) || /^00/.test(d);
  if (/^00/.test(d)) d = d.slice(2);
  if (plus && !d.startsWith('55')) {
    return d.length >= 8 && d.length <= 15 ? { value: '+' + d, kind: 'internacional', valid: true } : { valid: false, reason: 'telefone internacional com tamanho estranho' };
  }
  if (d.startsWith('55') && (d.length === 12 || d.length === 13) && DDDS.has(Number(d.slice(2, 4)))) d = d.slice(2);
  if (d.startsWith('0') && (d.length === 11 || d.length === 12) && DDDS.has(Number(d.slice(1, 3)))) d = d.slice(1);
  if ((d.length === 8 || d.length === 9) && defaultDdd && DDDS.has(Number(defaultDdd))) d = String(defaultDdd) + d;
  if (d.length !== 10 && d.length !== 11) {
    return { valid: false, reason: d.length < 10 ? 'telefone sem DDD ou incompleto' : 'telefone com dígitos demais' };
  }
  const ddd = d.slice(0, 2);
  if (!DDDS.has(Number(ddd))) return { valid: false, reason: `DDD ${ddd} inexistente` };
  let fixed = false;
  if (d.length === 10 && /[6-9]/.test(d[2])) { d = ddd + '9' + d.slice(2); fixed = true; }
  if (d.length === 11) {
    if (d[2] !== '9') return { valid: false, reason: 'celular de 11 dígitos precisa começar com 9 depois do DDD' };
    if (/^(\d)\1+$/.test(d.slice(2))) return { valid: false, reason: 'telefone com dígitos repetidos' };
    return { value: `(${ddd}) ${d.slice(2, 7)}-${d.slice(7)}`, kind: 'celular', valid: true, fixed };
  }
  if (!/[2-5]/.test(d[2]) || /^(\d)\1+$/.test(d.slice(2))) return { valid: false, reason: 'telefone fixo inválido' };
  return { value: `(${ddd}) ${d.slice(2, 6)}-${d.slice(6)}`, kind: 'fixo', valid: true, fixed };
}
/** Uma célula pode trazer vários telefones separados por ; / | quebra de linha ou " e ". */
const splitPhones = (raw) => clean(String(raw ?? '').replace(/[\n\r]+/g, ';')).split(/\s*(?:;|\/|\||\be\b)\s*/i).filter(Boolean);

// ─── E-mail ──────────────────────────────────────────────────────────────────
const EMAIL_RE = /^[a-z0-9._%+'-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/i;
const EMAIL_FIND = /[a-z0-9._%+'-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
const isEmail = (s) => EMAIL_RE.test(String(s || '').trim()) && String(s).length <= 254;
const splitEmails = (raw) => clean(raw).split(/[\s;,<>()]+/).filter(Boolean);

// ─── UF e CEP ────────────────────────────────────────────────────────────────
function normUf(raw) {
  const s = clean(raw);
  if (!s) return null;
  const up = strip(s).toUpperCase();
  if (UF_NAMES[up]) return up;
  return UF_BY_NAME[strip(s).toLowerCase()] || null;
}
function normCep(raw) {
  const d = digits(raw);
  if (!d) return null;
  const p = d.length >= 5 && d.length < 8 ? d.padStart(8, '0') : d;
  return p.length === 8 ? p.replace(/(\d{5})(\d{3})/, '$1-$2') : null;
}

// ─── Extração de texto livre ─────────────────────────────────────────────────
const LABELS = /\b(cpf\/cnpj|cpf|cnpj|telefone|tel|fone|celular|cel|whatsapp|zap|e-?mail|contato|nome)\b\s*[:.\-]?/gi;
/**
 * "Maria Souza - (51) 99999-0000 - maria@x.com - CPF 529.982.247-25" →
 * { name:'Maria Souza', phones:['(51) 99999-0000'], emails:['maria@x.com'], documents:[…], ceps:[] }
 */
function extractFromText(raw, opts = {}) {
  let t = ' ' + String(raw ?? '').replace(/[\n\r\t]+/g, ' ') + ' ';
  const out = { name: '', phones: [], emails: [], documents: [], ceps: [] };

  t = t.replace(EMAIL_FIND, (m) => { out.emails.push(m.toLowerCase()); return ' '; });
  t = t.replace(/(?<!\d)\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}(?!\d)/g, (m) => { const d = normDocument(m); if (d) out.documents.push(d); return ' '; });
  t = t.replace(/(?<!\d)\d{3}\.\d{3}\.\d{3}-\d{2}(?!\d)/g, (m) => { const d = normDocument(m); if (d) out.documents.push(d); return ' '; });
  t = t.replace(/\b(cpf|cnpj)\b\s*[:\-]?\s*(\d{11}|\d{14})(?!\d)/gi, (m, l, num) => { out.documents.push(normDocument(num)); return ' '; });
  t = t.replace(/(?<!\d)\d{14}(?!\d)/g, (m) => { const d = normDocument(m); if (d.valid) { out.documents.push(d); return ' '; } return m; });
  t = t.replace(/(?<!\d)\d{5}-\d{3}(?!\d)/g, (m) => { out.ceps.push(normCep(m)); return ' '; });

  // candidatos a telefone: sequências de 8 a 13 dígitos com separadores comuns
  t = t.replace(/(?:\+?55[\s.-]?)?\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}(?!\d)|(?<!\d)\d{8,9}(?!\d)/g, (m) => {
    const p = normPhone(m, opts);
    if (p && p.valid) { out.phones.push(p.value); return ' '; }
    const d = normDocument(m);
    if (d && d.type === 'cpf' && d.valid && digits(m).length === 11) { out.documents.push(d); return ' '; }
    return m;
  });

  const name = clean(t.replace(LABELS, ' ').replace(/[()[\]{}<>|;:,/\\_]+/g, ' ').replace(/\s-\s|^-+|-+$/g, ' ').replace(/\s+-+\s+/g, ' '))
    .replace(/^[\s\-–.]+|[\s\-–.]+$/g, '');
  out.name = /\p{L}{2,}/u.test(name) ? name : '';
  out.emails = [...new Set(out.emails)];
  out.phones = [...new Set(out.phones)];
  return out;
}

module.exports = {
  DDDS, UF_NAMES, strip, normHeader, digits, clean, properName,
  normDocument, formatDocument, normPhone, splitPhones, isEmail, splitEmails, normUf, normCep, extractFromText,
};
