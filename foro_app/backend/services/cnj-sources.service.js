/**
 * cnj-sources.service.js — consulta processual em fontes PÚBLICAS e gratuitas do CNJ, sem banco de dados:
 *
 *   • DataJud (API Pública)  → capa do processo + lista de movimentações. Sem partes e sem documentos; sem sigilosos.
 *       POST {DATAJUD_BASE_URL}/api_publica_<tribunal>/_search   Authorization: APIKey <DATAJUD_API_KEY>
 *   • DJEN (Comunica PJe)    → publicações/intimações (texto), partes (destinatários) e advogados. Só aceita IPs do Brasil.
 *       GET  {DJEN_BASE_URL}/api/v1/comunicacao?numeroProcesso=… | numeroOab=…&ufOab=… | nomeParte=…
 *            &dataDisponibilizacaoInicio=AAAA-MM-DD&dataDisponibilizacaoFim=AAAA-MM-DD  (sem token)
 *       Período padrão: DJEN_DATA_INICIO (1990-01-01) até hoje — pega todas as publicações; o usuário pode filtrar.
 *
 * As duas fontes são consultadas EM PARALELO e o resultado é mesclado; se uma falhar, a outra continua valendo
 * (cada fonte devolve seu próprio status). Nada aqui grava no banco — quem salva é process-search.service.js.
 *
 * Os formatos de resposta abaixo seguem a documentação pública; o parser é tolerante (aceita nomes alternativos de
 * campos) porque os tribunais não são 100% uniformes. Para validar em produção: `node scripts/test-process-sources.js <termo>`.
 */
const { AppError } = require('../middlewares/error.middleware');
const cnj = require('../utils/cnj');

const cfg = () => ({
  datajudBase: (process.env.DATAJUD_BASE_URL || 'https://api-publica.datajud.cnj.jus.br').replace(/\/+$/, ''),
  datajudKey: process.env.DATAJUD_API_KEY || '',
  djenBase: (process.env.DJEN_BASE_URL || 'https://comunicaapi.pje.jus.br').replace(/\/+$/, ''),
  datajudTimeoutMs: Number(process.env.DATAJUD_TIMEOUT_MS) || 30000,
  djenTimeoutMs: Number(process.env.DJEN_TIMEOUT_MS) || 20000,
});

const LIMITS = { movimentos: 2000, comunicacoes: 300, textoComunicacao: 20000, processosPorBusca: 20, paginasDjen: 5, itensPorPagina: 100 };

// ─── período (filtro de datas) ───────────────────────────────────────────────
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const defaultFrom = () => (ISO_DAY.test(process.env.DJEN_DATA_INICIO || '') ? process.env.DJEN_DATA_INICIO : '1990-01-01');
const todayBR = () => new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
/** { de, ate } do usuário (AAAA-MM-DD, opcionais) → período validado; sem nada = 1990 até hoje. */
function period({ de, ate } = {}) {
  const ok = (v) => ISO_DAY.test(v) && !isNaN(Date.parse(v));
  if (de && !ok(String(de))) throw new AppError('Data inicial inválida.', 422);
  if (ate && !ok(String(ate))) throw new AppError('Data final inválida.', 422);
  const from = de ? String(de) : defaultFrom();
  const to = ate ? String(ate) : todayBR();
  if (from > to) throw new AppError('A data inicial é depois da data final.', 422);
  return { de: from, ate: to, filtrado: Boolean(de || ate) };
}
const inPeriod = (iso, per) => { const d = (iso || '').slice(0, 10); return !d || (d >= per.de && d <= per.ate); };

// ─── utilidades ──────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** fetch com timeout e 1 nova tentativa em erro de rede / 429 / 5xx. */
async function http(url, { method = 'GET', headers = {}, body, timeoutMs, retries = 1 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method, headers: { 'User-Agent': 'Foro/1.0 (consulta processual)', Accept: 'application/json', ...headers }, body, signal: ctl.signal });
      if ((res.status === 429 || res.status >= 500) && attempt < retries) { lastErr = new Error(`HTTP ${res.status}`); await sleep(800); continue; }
      return res;
    } catch (e) {
      lastErr = e.name === 'AbortError' ? Object.assign(new Error('tempo esgotado'), { timeout: true }) : e;
      if (attempt < retries) await sleep(800);
    } finally { clearTimeout(timer); }
  }
  throw lastErr;
}

const pick = (o, keys) => { for (const k of keys) if (o && o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return null; };

/** Datas do CNJ vêm em ISO ("2024-05-10T13:00:00.000Z"), "20240510130000" ou "10/05/2024". Devolve ISO ou null. */
function parseDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  let m;
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})?(\d{2})?(\d{2})?$/))) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0))).toISOString();
  if ((m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1])).toISOString();
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** HTML/entidades → texto puro (o texto das publicações vem com marcação). */
function toPlainText(html) {
  return String(html || '')
    .replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return ''; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; } })
    .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&amp;/gi, '&')
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

// ─── DataJud ─────────────────────────────────────────────────────────────────
const UF_LOWER = (tr) => ({ '01': 'ac', '02': 'al', '03': 'ap', '04': 'am', '05': 'ba', '06': 'ce', '07': 'dft', '08': 'es', '09': 'go', '10': 'ma', '11': 'mt', '12': 'ms', '13': 'mg', '14': 'pa', '15': 'pb', '16': 'pr', '17': 'pe', '18': 'pi', '19': 'rj', '20': 'rn', '21': 'rs', '22': 'ro', '23': 'rr', '24': 'sc', '25': 'se', '26': 'sp', '27': 'to' })[tr] || null;

/** Índice do DataJud para o número (J.TR do CNJ). null = tribunal sem índice na API pública. */
function datajudAlias(digits) {
  const j = digits[13]; const tr = digits.slice(14, 16);
  switch (j) {
    case '3': return 'stj';
    case '4': return Number(tr) >= 1 && Number(tr) <= 6 ? `trf${Number(tr)}` : null;
    case '5': return tr === '00' ? 'tst' : (Number(tr) >= 1 && Number(tr) <= 24 ? `trt${Number(tr)}` : null);
    case '6': { if (tr === '00') return 'tse'; const uf = UF_LOWER(tr); return uf ? `tre-${uf === 'dft' ? 'df' : uf}` : null; }
    case '7': return 'stm';
    case '8': { const uf = UF_LOWER(tr); return uf ? `tj${uf}` : null; }
    case '9': return { '13': 'tjmmg', '21': 'tjmrs', '26': 'tjmsp' }[tr] || null;
    default: return null; // STF (1) e CNJ (2) não têm índice
  }
}

function normDatajudHit(src, indexHit) {
  const movs = (Array.isArray(src.movimentos) ? src.movimentos : []).map(m => ({
    data: parseDate(pick(m, ['dataHora', 'data'])),
    codigo: pick(m, ['codigo']),
    nome: String(pick(m, ['nome']) || 'Movimentação'),
    complementos: (Array.isArray(m.complementosTabelados) ? m.complementosTabelados : [])
      .map(c => [pick(c, ['nome']), pick(c, ['descricao'])].filter(Boolean).join(': ')).filter(Boolean),
    grau: src.grau || null,
  }));
  const assuntos = [src.assuntos].flat(Infinity).filter(Boolean).map(a => (typeof a === 'string' ? a : a.nome)).filter(Boolean);
  return {
    grau: src.grau || null,
    tribunal: src.tribunal || null,
    classe: src.classe ? (src.classe.nome || null) : null,
    assuntos,
    orgao_julgador: src.orgaoJulgador ? (src.orgaoJulgador.nome || null) : null,
    sistema: src.sistema ? (src.sistema.nome || null) : null,
    formato: src.formato ? (src.formato.nome || null) : null,
    data_ajuizamento: parseDate(src.dataAjuizamento),
    nivel_sigilo: src.nivelSigilo != null ? Number(src.nivelSigilo) : 0,
    atualizado_em: parseDate(src.dataHoraUltimaAtualizacao),
    movimentos: movs,
  };
}

async function queryDatajud(digits) {
  const c = cfg();
  const alias = datajudAlias(digits);
  if (!c.datajudKey) return { status: 'nao_configurado', mensagem: 'Chave do DataJud não configurada no servidor (DATAJUD_API_KEY).' };
  if (!alias) return { status: 'nao_suportado', mensagem: 'Este tribunal não tem índice na API pública do DataJud.' };
  let res;
  try {
    res = await http(`${c.datajudBase}/api_publica_${alias}/_search`, {
      method: 'POST', timeoutMs: c.datajudTimeoutMs,
      headers: { Authorization: `APIKey ${c.datajudKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ size: 10, query: { match: { numeroProcesso: digits } } }),
    });
  } catch (e) {
    return { status: 'erro', mensagem: e.timeout ? 'O DataJud demorou demais para responder.' : 'Não foi possível falar com o DataJud.' };
  }
  if (res.status === 401 || res.status === 403) return { status: 'erro', mensagem: 'O DataJud recusou a chave (ela pode ter sido trocada pelo CNJ; atualize DATAJUD_API_KEY).' };
  if (res.status === 404) return { status: 'erro', mensagem: 'Índice do tribunal não encontrado no DataJud.' };
  if (res.status === 429) return { status: 'erro', mensagem: 'O DataJud limitou as consultas agora (muitas requisições). Tente em instantes.' };
  if (!res.ok) return { status: 'erro', mensagem: `O DataJud respondeu com erro (${res.status}).` };
  let json;
  try { json = await res.json(); } catch { return { status: 'erro', mensagem: 'Resposta inválida do DataJud.' }; }
  const hits = (json?.hits?.hits || []).map(h => h && h._source).filter(s => s && String(s.numeroProcesso || '').replace(/\D/g, '') === digits);
  if (!hits.length) return { status: 'vazio', mensagem: 'O DataJud não tem este processo (pode estar em sigilo ou ainda não ter sido enviado pelo tribunal).' };
  const graus = hits.map(h => normDatajudHit(h));
  // várias instâncias (G1, G2…): a capa vem da mais antiga (1º grau); as movimentações são somadas
  graus.sort((a, b) => String(a.grau || '').localeCompare(String(b.grau || '')));
  const capa = graus[0];
  const movimentos = graus.flatMap(g => g.movimentos)
    .sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  return {
    status: 'ok',
    capa: { ...capa, graus: graus.map(g => g.grau).filter(Boolean), movimentos: undefined },
    movimentos: movimentos.slice(0, LIMITS.movimentos),
    movimentos_total: movimentos.length,
    atualizado_em: graus.map(g => g.atualizado_em).filter(Boolean).sort().pop() || null,
  };
}

// ─── DJEN ────────────────────────────────────────────────────────────────────
function normComunicacao(i) {
  const advs = (Array.isArray(i.destinatarioadvogados) ? i.destinatarioadvogados : (Array.isArray(i.advogados) ? i.advogados : []))
    .map(a => { const x = a.advogado || a; return { nome: pick(x, ['nome']), oab: [pick(x, ['numero_oab', 'numeroOab']), pick(x, ['uf_oab', 'ufOab'])].filter(Boolean).join('/') || null }; })
    .filter(a => a.nome);
  const dests = (Array.isArray(i.destinatarios) ? i.destinatarios : [])
    .map(d => ({ nome: pick(d, ['nome']), polo: pick(d, ['polo']) })).filter(d => d.nome);
  const numero = String(pick(i, ['numero_processo', 'numeroProcesso', 'numeroprocessocommascara']) || '').replace(/\D/g, '');
  return {
    id: pick(i, ['id']),
    hash: pick(i, ['hash']),
    numero_digits: numero.length === 20 ? numero : null,
    data: parseDate(pick(i, ['data_disponibilizacao', 'dataDisponibilizacao', 'datadisponibilizacao'])),
    tribunal: pick(i, ['siglaTribunal', 'sigla_tribunal']),
    tipo: pick(i, ['tipoComunicacao', 'tipo_comunicacao']),
    tipo_documento: pick(i, ['tipoDocumento', 'tipo_documento']),
    orgao: pick(i, ['nomeOrgao', 'nome_orgao']),
    classe: pick(i, ['nomeClasse', 'nome_classe']),
    texto: toPlainText(pick(i, ['texto'])).slice(0, LIMITS.textoComunicacao),
    link: pick(i, ['link']),
    destinatarios: dests,
    advogados: advs,
  };
}

async function djenFetch(params, per = period()) {
  const c = cfg();
  const items = []; let total = null; let size = LIMITS.itensPorPagina;
  for (let page = 1; page <= LIMITS.paginasDjen; page++) {
    const qs = new URLSearchParams({
      ...params, dataDisponibilizacaoInicio: per.de, dataDisponibilizacaoFim: per.ate, pagina: String(page), itensPorPagina: String(size),
    });
    let res;
    try { res = await http(`${c.djenBase}/api/v1/comunicacao?${qs}`, { timeoutMs: c.djenTimeoutMs }); }
    catch (e) { return { erro: e.timeout ? 'O DJEN demorou demais para responder.' : 'Não foi possível falar com o DJEN.' }; }
    if (res.status === 403) return { erro: 'O DJEN bloqueou o acesso (ele só aceita servidores no Brasil).' };
    if (res.status === 429) return { erro: 'O DJEN limitou as consultas agora (muitas requisições). Tente em instantes.' };
    if (res.status === 404 || res.status === 204) break;
    // alguns ambientes do DJEN limitam itens por página: tenta de novo com 50
    if ((res.status === 400 || res.status === 422) && page === 1 && size > 50) { size = 50; page--; continue; }
    if (!res.ok) return { erro: `O DJEN respondeu com erro (${res.status}).` };
    let json;
    try { json = await res.json(); } catch { return { erro: 'Resposta inválida do DJEN.' }; }
    const batch = Array.isArray(json) ? json : (json.items || json.content || json.data || []);
    if (json && json.count != null) total = Number(json.count);
    items.push(...batch);
    if (!batch.length || batch.length < size || (total != null && items.length >= total)) break;
  }
  return { items: items.map(normComunicacao), total: total ?? items.length };
}

const POLO = { A: 'Polo ativo', P: 'Polo passivo', T: 'Terceiro', ATIVO: 'Polo ativo', PASSIVO: 'Polo passivo' };
function partesFrom(comunicacoes) {
  const seen = new Map();
  for (const c of comunicacoes) for (const d of c.destinatarios) {
    const papel = POLO[String(d.polo || '').toUpperCase()] || (d.polo ? String(d.polo) : 'Parte');
    const k = `${papel}|${d.nome.toLowerCase()}`;
    if (!seen.has(k)) seen.set(k, { papel, nome: d.nome });
  }
  return [...seen.values()].slice(0, 30);
}

async function queryDjenByNumber(digits, per) {
  const r = await djenFetch({ numeroProcesso: digits }, per);
  if (r.erro) return { status: 'erro', mensagem: r.erro };
  const own = r.items.filter(i => !i.numero_digits || i.numero_digits === digits);
  if (!own.length) return { status: 'vazio', mensagem: per.filtrado ? 'Nenhuma publicação deste processo no DJEN no período escolhido.' : 'Nenhuma publicação deste processo no DJEN.' };
  own.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  return { status: 'ok', comunicacoes: own.slice(0, LIMITS.comunicacoes), comunicacoes_total: own.length, partes: partesFrom(own) };
}

// ─── Interpretação do termo digitado ─────────────────────────────────────────
/** OAB: "OAB/RS 12345", "12345/RS", "RS 12345", "oab rs12345"… → { numero, uf } ou null. */
function parseOab(term) {
  const t = String(term || '').trim();
  let m = t.match(/^(?:oab[\s/.:-]*)?([A-Za-z]{2})[\s/.:-]*(\d{1,7})$/i) || t.match(/^(?:oab[\s/.:-]*)?(\d{1,7})[\s/.:-]*([A-Za-z]{2})$/i);
  if (!m) return null;
  const [uf, numero] = /^\d/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
  return { numero: String(Number(numero)), uf: uf.toUpperCase() };
}

function classify(term) {
  const t = String(term || '').trim();
  const d = cnj.digits(t);
  if (d) {
    if (!cnj.isValid(d)) throw new AppError('Número de processo inválido (confira os dígitos).', 422);
    return { kind: 'cnj', digits: d };
  }
  const onlyDigits = t.replace(/\D/g, '');
  if (!/[A-Za-zÀ-ÿ]/.test(t) && (onlyDigits.length === 11 || onlyDigits.length === 14)) {
    throw new AppError('A busca por CPF/CNPJ não está disponível nas fontes gratuitas (DataJud/DJEN). Use o número do processo, o nome da parte ou a OAB.', 422);
  }
  const oab = parseOab(t);
  if (oab) return { kind: 'oab', ...oab };
  if (/[A-Za-zÀ-ÿ]{3,}/.test(t) && t.length >= 5) return { kind: 'name', name: t.replace(/\s+/g, ' ') };
  throw new AppError('Informe o número do processo (CNJ), o nome da parte ou a OAB (ex.: OAB/RS 12345).', 422);
}

// ─── Estado atual de UM processo (mescla) ────────────────────────────────────
const cache = new Map(); const CACHE_MS = 3 * 60 * 1000;
function cacheGet(k) { const e = cache.get(k); if (e && Date.now() - e.at < CACHE_MS) return e.v; cache.delete(k); return null; }
function cacheSet(k, v) { if (cache.size > 200) cache.delete(cache.keys().next().value); cache.set(k, { at: Date.now(), v }); }

const srcInfo = (r) => ({ status: r.status, mensagem: r.mensagem || null, atualizado_em: r.atualizado_em || null });

/**
 * Consulta DataJud e DJEN para o número e devolve o "retrato" do processo:
 * { numero_cnj, tribunal, capa, partes, movimentos[], comunicacoes[], fontes, consultado_em }.
 * Lança 502 só se NENHUMA fonte respondeu (as duas deram erro); "vazio" não é erro.
 */
async function snapshot(numero, { fresh = false, de, ate } = {}) {
  const digits = cnj.digits(numero);
  if (!digits || !cnj.isValid(digits)) throw new AppError('Número de processo inválido.', 422);
  const per = period({ de, ate });
  const ck = `${digits}|${per.de}|${per.ate}`;
  if (!fresh) { const hit = cacheGet(ck); if (hit) return hit; }
  const [dj0, dn] = await Promise.all([
    queryDatajud(digits).catch(e => ({ status: 'erro', mensagem: `Falha inesperada no DataJud (${e.message}).` })),
    queryDjenByNumber(digits, per).catch(e => ({ status: 'erro', mensagem: `Falha inesperada no DJEN (${e.message}).` })),
  ]);
  // o DataJud não filtra por data: aplica o mesmo período às movimentações
  let dj = dj0;
  if (per.filtrado && dj0.status === 'ok') {
    const movs = (dj0.movimentos || []).filter(m => inPeriod(m.data, per));
    dj = { ...dj0, movimentos: movs, movimentos_total: movs.length };
  }
  const usable = (r) => r.status === 'ok';
  // nenhuma fonte trouxe dados E pelo menos uma FALHOU: não dá para afirmar que "não existe" — avisa da falha
  if (!usable(dj) && !usable(dn) && (dj.status === 'erro' || dn.status === 'erro')) {
    throw new AppError(`Não foi possível consultar as fontes agora. DataJud: ${dj.mensagem} DJEN: ${dn.mensagem}`, 502, 'SOURCES_UNAVAILABLE');
  }
  const trib = cnj.tribunalOf(digits);
  const lastCom = dn.comunicacoes && dn.comunicacoes[0];
  const capa = {
    numero_cnj: cnj.format(digits),
    tribunal: trib?.code || dj.capa?.tribunal || lastCom?.tribunal || null,
    tribunal_nome: trib?.name || null,
    grau: dj.capa?.grau || null,
    graus: dj.capa?.graus || [],
    classe: dj.capa?.classe || lastCom?.classe || null,
    assuntos: dj.capa?.assuntos || [],
    orgao_julgador: dj.capa?.orgao_julgador || lastCom?.orgao || null,
    sistema: dj.capa?.sistema || null,
    formato: dj.capa?.formato || null,
    data_ajuizamento: dj.capa?.data_ajuizamento || null,
    nivel_sigilo: dj.capa?.nivel_sigilo || 0,
  };
  const snap = {
    numero_cnj: capa.numero_cnj,
    capa,
    partes: dn.partes || [],
    movimentos: dj.movimentos || [],
    movimentos_total: dj.movimentos_total || 0,
    comunicacoes: dn.comunicacoes || [],
    comunicacoes_total: dn.comunicacoes_total || 0,
    fontes: { datajud: srcInfo(dj), djen: srcInfo(dn) },
    periodo: per,
    consultado_em: new Date().toISOString(),
  };
  cacheSet(ck, snap);
  return snap;
}

/** "Intimação — Despacho" (sem repetir quando tipo e documento são iguais) + começo do texto. */
function comTitle(c) {
  const t = `${c.tipo || 'Publicação'}${c.tipo_documento && c.tipo_documento !== c.tipo ? ` — ${c.tipo_documento}` : ''}`;
  const txt = (c.texto || '').replace(/\s+/g, ' ').trim();
  return txt ? `${t}: ${txt.length > 140 ? txt.slice(0, 140) + '…' : txt}` : t;
}

/** Resumo de um retrato no formato dos resultados de pesquisa. */
function summarize(snap) {
  const m = snap.movimentos[0]; const c = snap.comunicacoes[0];
  const useMov = m && (!c || (m.data || '') >= (c.data || ''));
  return {
    numero_cnj: snap.capa.numero_cnj,
    tribunal: snap.capa.tribunal || '—',
    tribunal_nome: snap.capa.tribunal_nome,
    classe: snap.capa.classe || '—',
    assunto: snap.capa.assuntos.slice(0, 2).join('; ') || '—',
    orgao: snap.capa.orgao_julgador,
    partes: snap.partes.slice(0, 6),
    data_distribuicao: snap.capa.data_ajuizamento ? snap.capa.data_ajuizamento.slice(0, 10) : null,
    ultima_movimentacao: useMov ? m.nome : (c ? comTitle(c) : '—'),
    data_ultima_movimentacao: (useMov ? m.data : c?.data || null)?.slice(0, 10) || null,
    movimentos_total: snap.movimentos_total,
    comunicacoes_total: snap.comunicacoes_total,
    fontes: snap.fontes,
  };
}

// ─── Pesquisa (por número, OAB ou nome) ──────────────────────────────────────
function groupFromDjen(items) {
  const by = new Map();
  for (const i of items) {
    if (!i.numero_digits) continue;
    const g = by.get(i.numero_digits) || { digits: i.numero_digits, itens: [] };
    g.itens.push(i); by.set(i.numero_digits, g);
  }
  return [...by.values()].map(g => {
    g.itens.sort((a, b) => (b.data || '').localeCompare(a.data || ''));
    const last = g.itens[0]; const trib = cnj.tribunalOf(g.digits);
    return {
      numero_cnj: cnj.format(g.digits),
      tribunal: trib?.code || last.tribunal || '—', tribunal_nome: trib?.name || null,
      classe: last.classe || '—', assunto: '—', orgao: last.orgao || null,
      partes: partesFrom(g.itens).slice(0, 6),
      data_distribuicao: null,
      ultima_movimentacao: comTitle(last),
      data_ultima_movimentacao: last.data ? last.data.slice(0, 10) : null,
      movimentos_total: null, comunicacoes_total: g.itens.length,
      fontes: { datajud: { status: 'nao_consultado', mensagem: null }, djen: { status: 'ok', mensagem: null } },
    };
  }).sort((a, b) => (b.data_ultima_movimentacao || '').localeCompare(a.data_ultima_movimentacao || '')).slice(0, LIMITS.processosPorBusca);
}

/** Devolve { kind, results[], aviso } — results no formato de process-search. */
async function search(term, { de, ate } = {}) {
  const k = classify(term);
  const per = period({ de, ate });
  if (k.kind === 'cnj') {
    const snap = await snapshot(k.digits, { fresh: true, de, ate });
    const noData = snap.fontes.datajud.status !== 'ok' && snap.fontes.djen.status !== 'ok';
    return { kind: 'cnj', results: noData ? [] : [summarize(snap)], fontes: snap.fontes, periodo: per };
  }
  const params = k.kind === 'oab' ? { numeroOab: k.numero, ufOab: k.uf } : { nomeParte: k.name };
  const r = await djenFetch(params, per);
  if (r.erro) throw new AppError(r.erro, 502, 'SOURCES_UNAVAILABLE');
  return {
    kind: k.kind, results: groupFromDjen(r.items), periodo: per,
    aviso: 'Busca por ' + (k.kind === 'oab' ? 'OAB' : 'nome') + ' usa as publicações do DJEN (intimações): processos sem publicação recente podem não aparecer. Para o histórico completo, pesquise pelo número do processo.',
  };
}

module.exports = { search, snapshot, summarize, period, classify, parseOab, datajudAlias, parseDate, toPlainText, LIMITS, cfg };
