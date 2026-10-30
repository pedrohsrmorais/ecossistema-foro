/**
 * process-search.service.js — pesquisa de processos + guarda do documento (PDF) no S3 e metadados no MySQL.
 *
 * Provedores (PROCESS_SEARCH_PROVIDER):
 *   mock (padrão)  → FASE DE TESTE: qualquer termo "encontra" processos fictícios e o documento é sempre um PDF gerado
 *                    na hora (utils/mockPdf.js). Serve para validar o fluxo pesquisar → visualizar → salvar no S3.
 *   <real>         → futuro: implementar { search(q) , fetchDocument(meta) } em PROVIDERS e plugar o provedor contratado.
 *
 * Fluxo: search() devolve resultados com um `ref` ASSINADO (JWT curto) — o front manda de volta só o `ref`
 * (preview/salvar), então os metadados não podem ser adulterados no navegador.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../configs/db.config');
const { AppError } = require('../middlewares/error.middleware');
const storage = require('./storage.service');
const cnj = require('../utils/cnj');
const { buildProcessPdf } = require('../utils/mockPdf');

const REF_TTL = '30m';
const PROVIDER = () => (process.env.PROCESS_SEARCH_PROVIDER || 'mock').toLowerCase();

// ─── Provedor MOCK ────────────────────────────────────────────────────────────
const CLASSES = ['Procedimento Comum Cível', 'Reclamação Trabalhista', 'Execução Fiscal', 'Mandado de Segurança', 'Ação de Alimentos', 'Ação de Cobrança'];
const ASSUNTOS = ['Indenização por Dano Moral', 'Rescisão do Contrato de Trabalho', 'Cobrança de Dívida', 'Responsabilidade Civil', 'Pensão Alimentícia', 'Tributário - ICMS'];
const NOMES = ['Maria Souza', 'João Pereira', 'Ana Beatriz Lima', 'Carlos Eduardo Rocha', 'Fernanda Alves', 'Construtora Horizonte Ltda', 'Banco Aurora S.A.', 'Comercial Pinheiro ME'];
const TRIBUNAIS = [ // [J, TR]
  ['8', '26'], ['8', '21'], ['8', '19'], ['5', '04'], ['4', '04'], ['8', '13'],
];

function mockCnj(seedBytes) {
  const [j, tr] = TRIBUNAIS[seedBytes[0] % TRIBUNAIS.length];
  const seq = String(seedBytes.readUInt32BE(1) % 10000000).padStart(7, '0');
  const year = 2018 + (seedBytes[5] % 8);
  const origin = String(seedBytes.readUInt16BE(6) % 10000).padStart(4, '0');
  const base = `${seq}00${year}${j}${tr}${origin}`;
  const dd = cnj.checkDigits(base);
  return `${seq}${dd}${year}${j}${tr}${origin}`;
}

const MockProvider = {
  name: 'mock',
  async search(q) {
    const term = String(q).trim();
    const asCnj = cnj.digits(term);
    const out = [];
    for (let i = 0; i < 3; i++) {
      // 1º resultado: se o usuário digitou um número CNJ válido, devolve exatamente ele
      const seed = crypto.createHash('sha256').update(`${term.toLowerCase()}#${i}`).digest();
      const digits = i === 0 && asCnj && cnj.isValid(asCnj) ? asCnj : mockCnj(seed);
      const trib = cnj.tribunalOf(digits);
      const d = (n) => new Date(Date.UTC(2020 + (seed[8] % 5), seed[9] % 12, 1 + (seed[10] % 27)) + n * 86400000);
      out.push({
        numero_cnj: cnj.format(digits),
        tribunal: trib?.code || 'TJSP',
        tribunal_nome: trib?.name || 'Tribunal de Justiça',
        classe: CLASSES[seed[11] % CLASSES.length],
        assunto: ASSUNTOS[seed[12] % ASSUNTOS.length],
        partes: [{ papel: 'Autor', nome: NOMES[seed[13] % NOMES.length] }, { papel: 'Réu', nome: NOMES[(seed[14] + 3) % NOMES.length] }],
        data_distribuicao: d(0).toISOString().slice(0, 10),
        ultima_movimentacao: ['Juntada de petição', 'Conclusos para despacho', 'Audiência designada', 'Sentença publicada'][seed[15] % 4],
        data_ultima_movimentacao: d(400 + (seed[16] % 300)).toISOString().slice(0, 10),
      });
    }
    return out;
  },
  /** Documento do processo (sempre o PDF gerado). Determinístico por número: preview e salvar geram o MESMO arquivo. */
  async fetchDocument(meta) {
    const { buffer, pages } = buildProcessPdf(meta, meta.numero_cnj);
    return { buffer, contentType: 'application/pdf', pages, fileName: `processo-${meta.numero_cnj.replace(/\D/g, '')}.pdf` };
  },
};
const PROVIDERS = { mock: MockProvider };
function provider() {
  const p = PROVIDERS[PROVIDER()];
  if (!p) throw new AppError(`Provedor de consulta processual "${PROVIDER()}" não está implementado.`, 501);
  return p;
}

// ─── API do serviço ───────────────────────────────────────────────────────────
function _sign(meta, accountId, userId) {
  return jwt.sign({ purpose: 'process-ref', a: accountId, u: userId, meta }, process.env.JWT_SECRET, { expiresIn: REF_TTL });
}
function _open(ref, accountId, userId) {
  let p;
  try { p = jwt.verify(String(ref || ''), process.env.JWT_SECRET); } catch { throw new AppError('Esta pesquisa expirou. Pesquise de novo.', 410, 'REF_EXPIRED'); }
  if (p.purpose !== 'process-ref' || p.a !== accountId || p.u !== userId) throw new AppError('Resultado inválido.', 403);
  return p.meta;
}

async function search(accountId, userId, q) {
  const term = String(q || '').trim();
  if (term.length < 3) throw new AppError('Digite pelo menos 3 caracteres (número do processo, nome ou CPF/CNPJ).', 422);
  if (term.length > 120) throw new AppError('Termo muito longo.', 422);
  const results = await provider().search(term);
  return {
    provider: provider().name, query: term,
    results: results.map(r => ({ ...r, ref: _sign({ ...r, query: term }, accountId, userId) })),
  };
}

/** PDF para pré-visualização (sem salvar nada). */
async function preview(accountId, userId, ref) {
  return provider().fetchDocument(_open(ref, accountId, userId));
}

/** Salva: baixa o documento do provedor → S3 → metadados no MySQL. Idempotente por conteúdo (sha256) na conta. */
async function save(accountId, userId, ref) {
  const meta = _open(ref, accountId, userId);
  if (!storage.isConfigured()) throw new AppError('Armazenamento de arquivos não configurado no servidor.', 503, 'STORAGE_NOT_CONFIGURED');
  const doc = await provider().fetchDocument(meta);
  const sha256 = crypto.createHash('sha256').update(doc.buffer).digest('hex');

  const [dup] = await query('SELECT id FROM saved_processes WHERE account_id = ? AND sha256 = ? AND deleted_at IS NULL LIMIT 1', [accountId, sha256]);
  if (dup.length) return { ...(await get(accountId, dup[0].id)), already_saved: true };

  const id = uuidv4();
  const key = `accounts/${accountId}/processos/${id}/${doc.fileName}`;
  try {
    await storage.putObject(key, doc.buffer, {
      contentType: doc.contentType,
      metadata: { 'account-id': accountId, 'saved-by': userId, 'numero-cnj': meta.numero_cnj, sha256 },
    });
  } catch (err) {
    console.error('[process-search] falha ao gravar no S3:', err.message);
    throw new AppError('Não foi possível guardar o documento agora. Tente novamente em instantes.', 502, 'STORAGE_FAILED');
  }
  try {
    await query(
      `INSERT INTO saved_processes (id, account_id, saved_by, source, search_query, numero_cnj, tribunal, classe, assunto, parties, distributed_at,
         last_movement, last_movement_at, s3_bucket, s3_key, file_name, content_type, size_bytes, sha256, pages, numero_digits, parties_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, accountId, userId, provider().name, meta.query || null, meta.numero_cnj, meta.tribunal, meta.classe, meta.assunto, JSON.stringify(meta.partes || []),
        meta.data_distribuicao || null, meta.ultima_movimentacao || null, meta.data_ultima_movimentacao || null,
        storage.config().bucket, key, doc.fileName, doc.contentType, doc.buffer.length, sha256, doc.pages || null,
        String(meta.numero_cnj).replace(/\D/g, ''), (meta.partes || []).map(p => p.nome).join(' | ').slice(0, 500)]
    );
  } catch (err) {
    // metadados falharam: remove o objeto para não deixar arquivo órfão
    await storage.deleteObject(key).catch(() => {});
    throw err;
  }
  return { ...(await get(accountId, id)), already_saved: false };
}

const COLS = `s.id, s.numero_cnj, s.tribunal, s.classe, s.assunto, s.parties, s.distributed_at, s.last_movement, s.last_movement_at, s.source, s.search_query,
  s.file_name, s.content_type, s.size_bytes, s.sha256, s.pages, s.s3_bucket, s.s3_key, s.case_id, s.created_at, s.saved_by, u.name AS saved_by_name`;
function _shape(r) {
  let parties = r.parties; if (typeof parties === 'string') { try { parties = JSON.parse(parties); } catch { parties = []; } }
  return { ...r, parties: parties || [] };
}

async function get(accountId, id, viewerId) {
  const [rows] = await query(
    `SELECT ${COLS} FROM saved_processes s LEFT JOIN users u ON u.id = s.saved_by
     WHERE s.id = ? AND s.account_id = ? AND s.deleted_at IS NULL ${viewerId ? 'AND s.saved_by = ?' : ''} LIMIT 1`,
    viewerId ? [id, accountId, viewerId] : [id, accountId]);
  if (!rows.length) throw new AppError('Processo salvo não encontrado.', 404);
  return _shape(rows[0]);
}

const SORTS = {
  recent: 's.created_at DESC', oldest: 's.created_at ASC', number: 's.numero_cnj ASC',
  tribunal: 's.tribunal ASC, s.created_at DESC', size: 's.size_bytes DESC',
};

function _filters(accountId, { q, tribunal, from, to, viewerId } = {}) {
  const where = ['s.account_id = ?', 's.deleted_at IS NULL'];
  const params = [accountId];
  if (viewerId) { where.push('s.saved_by = ?'); params.push(viewerId); }
  if (tribunal) { where.push('s.tribunal = ?'); params.push(String(tribunal)); }
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) { where.push('s.created_at >= ?'); params.push(`${from} 00:00:00`); }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) { where.push('s.created_at <= ?'); params.push(`${to} 23:59:59`); }
  const term = q && String(q).trim();
  if (term) {
    const digits = term.replace(/\D/g, '');
    const like = `%${term}%`;
    const parts = ['s.numero_cnj LIKE ?', 's.classe LIKE ?', 's.assunto LIKE ?', 's.parties_text LIKE ?', 's.s3_key LIKE ?', 's.file_name LIKE ?'];
    const ps = [like, like, like, like, like, like];
    if (digits.length >= 4) { parts.unshift('s.numero_digits LIKE ?'); ps.unshift(`${digits}%`); }
    where.push(`(${parts.join(' OR ')})`); params.push(...ps);
  }
  return { where: where.join(' AND '), params };
}

async function list(accountId, { q, page = 1, limit = 20, viewerId, tribunal, from, to, sort } = {}) {
  limit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);
  const offset = (Math.max(parseInt(page, 10) || 1, 1) - 1) * limit;
  const { where, params } = _filters(accountId, { q, tribunal, from, to, viewerId });
  const [[{ total }]] = await query(`SELECT COUNT(*) AS total FROM saved_processes s WHERE ${where}`, params);
  const [rows] = await query(
    `SELECT ${COLS} FROM saved_processes s LEFT JOIN users u ON u.id = s.saved_by WHERE ${where} ORDER BY ${SORTS[sort] || SORTS.recent} LIMIT ${limit} OFFSET ${offset}`, params);
  return { data: rows.map(_shape), total, page: Math.floor(offset / limit) + 1, limit };
}

/** Painel: totais e tribunais (para filtros) — tudo do MySQL. */
async function summary(accountId, { viewerId } = {}) {
  const { where, params } = _filters(accountId, { viewerId });
  const [[t]] = await query(`SELECT COUNT(*) AS total, COALESCE(SUM(s.size_bytes),0) AS bytes, COALESCE(SUM(s.pages),0) AS pages, MAX(s.created_at) AS last_saved FROM saved_processes s WHERE ${where}`, params);
  const [tribunais] = await query(`SELECT s.tribunal, COUNT(*) AS total FROM saved_processes s WHERE ${where} GROUP BY s.tribunal ORDER BY total DESC, s.tribunal`, params);
  return { total: t.total, bytes: Number(t.bytes), pages: Number(t.pages), last_saved: t.last_saved, bucket: storage.config().bucket, tribunais };
}

/** Arquivo salvo (stream do S3) — confere a conta antes. */
async function file(accountId, id, viewerId) {
  const meta = await get(accountId, id, viewerId);
  const obj = await storage.getObject(meta.s3_key);
  return { meta, ...obj };
}

async function remove(accountId, id, viewerId) {
  await get(accountId, id, viewerId);
  // exclusão lógica: o objeto fica no S3 (recuperável por suporte); ciclo de vida/expurgo fica para depois
  await query('UPDATE saved_processes SET deleted_at = NOW() WHERE id = ? AND account_id = ?', [id, accountId]);
}

module.exports = {
  summary, search, preview, save, get, list, file, remove };
