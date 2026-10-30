/**
 * document-guard.js — trava anti-alucinação para texto gerado por IA.
 *
 * A IA só pode citar dispositivos que estejam na lista curada (refs da área + legal_basis do modelo).
 * Qualquer outra citação (artigo, lei, súmula, tema, recurso) recebe o marcador `[CONFERIR: ...]` logo após,
 * para o advogado verificar antes de usar. Nada é removido silenciosamente.
 */
const STATUTES = [
  ['CPC', /CPC|C[óo]digo de Processo Civil/i], ['CPP', /CPP|C[óo]digo de Processo Penal/i], ['CLT', /CLT|Consolida[çc][ãa]o das Leis do Trabalho/i],
  ['CF', /CF(?:\/88)?|Constitui[çc][ãa]o Federal/i], ['CP', /CP|C[óo]digo Penal/i], ['CC', /CC|C[óo]digo Civil/i], ['CDC', /CDC|C[óo]digo de Defesa do Consumidor/i],
];
const LAW = /Lei(?:\s+Complementar)?\s*(?:n[ºo°.]*\s*)?(\d{1,2}(?:\.\d{3})?)\s*\/\s*(\d{4})/i;

function _statuteKey(txt) {
  const law = txt.match(LAW);
  if (law) return `L${law[1].replace(/\./g, '')}/${law[2]}`;
  for (const [k, re] of STATUTES) if (new RegExp(`^(?:${re.source})$`, 'i').test(txt.trim())) return k;
  return null;
}
const _art = (n) => String(n).replace(/\./g, '').replace(/[ºo°]$/i, '').toUpperCase();

/** Chave canônica de uma citação de artigo: "CPC:319", "L14133/2021:18". */
function refKey(statute, art) { const s = _statuteKey(statute); return s ? `${s}:${_art(art)}` : null; }

/** Converte "CPC art. 1.003, §5º" / "Lei 14.133/2021 art. 6º, XXIII" em chave de artigo. */
function keyFromRefId(id) {
  const m = String(id).match(/^(.*?)\s+art\.?\s*(\d[\d.]*(?:-[A-Za-z])?)/i);
  return m ? refKey(m[1], m[2]) : null;
}

const STAT_ALT = 'CPC|CPP|CLT|CF(?:\\/88)?|CP|CC|CDC|C[óo]digo de Processo Civil|C[óo]digo de Processo Penal|C[óo]digo Penal|C[óo]digo Civil|C[óo]digo de Defesa do Consumidor|Constitui[çc][ãa]o Federal|Consolida[çc][ãa]o das Leis do Trabalho|Lei(?:\\s+Complementar)?\\s*(?:n[ºo°.]*\\s*)?\\d{1,2}(?:\\.\\d{3})?\\s*\\/\\s*\\d{4}';
const RE_PREFIX = new RegExp(`\\b(${STAT_ALT})\\s*,?\\s*(?:arts?\\.?)\\s*(\\d[\\d.]*(?:-[A-Za-z])?)`, 'gi');          // "CPC, art. 319"
const RE_SUFFIX = new RegExp(`\\barts?\\.?\\s*(\\d[\\d.]*(?:-[A-Za-z])?)[^.;\\n]{0,60}?\\bd[oae]s?\\s+(${STAT_ALT})`, 'gi');  // "art. 319 do CPC"
const RE_OTHER = /\b(S[úu]mula(?:\s+Vinculante)?\s+n?[ºo°.]*\s*\d+|Tema\s+(?:n[ºo°.]*\s*)?\d+(?:\.\d+)*|(?:REsp|AgRg|RE|ADI|ADPF|HC|RR|AIRR)\s+n?[ºo°.]*\s*\d[\d.]{2,}\d|OJ\s+n?[ºo°.]*\s*\d+|Orienta[çc][ãa]o Jurisprudencial\s+n?[ºo°.]*\s*\d+)/gi;

function findCitations(text) {
  const out = [];
  for (const m of text.matchAll(RE_PREFIX)) out.push({ raw: m[0], end: m.index + m[0].length, key: refKey(m[1], m[2]) });
  for (const m of text.matchAll(RE_SUFFIX)) out.push({ raw: m[0], end: m.index + m[0].length, key: refKey(m[2], m[1]) });
  for (const m of text.matchAll(RE_OTHER)) out.push({ raw: m[0], end: m.index + m[0].length, key: null });
  return out.sort((a, b) => a.end - b.end);
}

/**
 * @param {string} text texto gerado pela IA
 * @param {string[]} allowedRefIds ids de referência permitidos (ex.: 'CPC art. 319')
 * @returns {{ text:string, flags:string[] }}
 */
function guard(text, allowedRefIds = []) {
  const allowed = new Set(allowedRefIds.map(keyFromRefId).filter(Boolean));
  const flags = [];
  const bad = [];
  for (const c of findCitations(String(text || ''))) {
    if (c.key && allowed.has(c.key)) continue;
    if (bad.some(b => b.end === c.end)) continue;
    bad.push(c); flags.push(c.raw.trim());
  }
  let out = String(text || '');
  for (const c of bad.sort((a, b) => b.end - a.end)) {
    out = `${out.slice(0, c.end)} [CONFERIR: citação não verificada]${out.slice(c.end)}`;
  }
  return { text: out, flags };
}

/** Quantos marcadores pendentes (PREENCHER/CONFERIR/IA) o documento ainda tem. */
function countOpen(text) {
  return (String(text || '').match(/\[(?:PREENCHER|CONFERIR)\b[^\]]*\]/g) || []).length + (String(text || '').match(new RegExp(SLOT_SRC, 'g')) || []).length;
}

/** Trecho a ser preenchido pela IA: [[IA: instrução]] — aceita [colchetes] simples dentro da instrução. */
const SLOT_SRC = '\\[\\[IA:((?:[^\\[\\]]|\\[[^\\[\\]]*\\])*)\\]\\]';

module.exports = { SLOT_SRC, guard, countOpen, findCitations, keyFromRefId, refKey };
