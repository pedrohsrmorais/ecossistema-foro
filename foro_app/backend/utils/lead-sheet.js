/**
 * lead-sheet.js — lê planilhas (.xlsx e .csv/.txt) e gera .xlsx/.csv para o CRM.
 *
 * Leitura: devolve sempre `rows: string[][]` (texto) e `numeric[r][c]` = a célula era número no Excel
 * (necessário para recompor zeros à esquerda de CPF/CNPJ). Limites configuráveis por ambiente:
 * MAX_IMPORT_MB (5), MAX_IMPORT_ROWS (5000). Arquivos .xls antigos não são lidos (peça para salvar como .xlsx).
 */
const readXlsx = require('read-excel-file/node');
const writeXlsx = require('write-excel-file/node');
const { AppError } = require('../middlewares/error.middleware');

const LIMITS = {
  get bytes() { return (Number(process.env.MAX_IMPORT_MB) || 5) * 1024 * 1024; },
  get rows() { return Number(process.env.MAX_IMPORT_ROWS) || 5000; },
  cols: 60,
  cell: 2000,
  zipUncompressed: 150 * 1024 * 1024,
  zipEntries: 400,
};

const bad = (msg, code = 'BAD_FILE') => new AppError(msg, 422, code);

/** Proteção contra "zip bomb": soma os tamanhos descompactados no diretório central ANTES de abrir o .xlsx. */
function guardZip(buf) {
  const min = Math.max(0, buf.length - 65557);
  let eocd = -1;
  for (let i = buf.length - 22; i >= min; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw bad('O arquivo .xlsx está corrompido (não é um zip válido).');
  const entries = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);
  if (entries > LIMITS.zipEntries) throw bad('O arquivo .xlsx tem estrutura incomum e foi recusado.');
  let total = 0;
  for (let i = 0; i < entries; i++) {
    if (off + 46 > buf.length || buf.readUInt32LE(off) !== 0x02014b50) throw bad('O arquivo .xlsx está corrompido.');
    total += buf.readUInt32LE(off + 24);
    off += 46 + buf.readUInt16LE(off + 28) + buf.readUInt16LE(off + 30) + buf.readUInt16LE(off + 32);
  }
  if (total > LIMITS.zipUncompressed) throw bad('O arquivo .xlsx é grande demais depois de descompactado.');
}

function cellText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) && Math.abs(v) < 1e21 ? v.toFixed(0) : String(v);
  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return '';
    const iso = v.toISOString();
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 19).replace('T', ' ');
  }
  if (typeof v === 'boolean') return v ? 'Sim' : 'Não';
  return String(v);
}

// ─── CSV ─────────────────────────────────────────────────────────────────────
function decodeText(buf) {
  let b = buf;
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b.subarray(2));
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } catch { return new TextDecoder('windows-1252').decode(b); }
}

function detectDelimiter(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim()).slice(0, 8);
  let best = ';'; let bestScore = -1;
  for (const d of [';', ',', '\t', '|']) {
    const counts = lines.map(l => { let n = 0; let q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === d && !q) n++; } return n; });
    if (!counts.length || counts[0] === 0) continue;
    const consistent = counts.filter(c => c === counts[0]).length;
    const score = consistent * 100 + counts[0];
    if (score > bestScore) { bestScore = score; best = d; }
  }
  return best;
}

function parseCsvText(text, delimiter) {
  const rows = []; const lines = []; let row = []; let cell = ''; let q = false; let i = 0; let recNo = 0;
  const pushCell = () => { row.push(cell.length > LIMITS.cell ? cell.slice(0, LIMITS.cell) : cell); cell = ''; };
  const pushRow = () => { pushCell(); recNo++; if (row.some(c => c.trim() !== '')) { rows.push(row); lines.push(recNo); } row = []; };
  while (i < text.length) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"' && cell === '') q = true;
    else if (ch === delimiter) pushCell();
    else if (ch === '\n') pushRow();
    else if (ch === '\r') { if (text[i + 1] === '\n') i++; pushRow(); } else cell += ch;
    if (rows.length > LIMITS.rows + 40) break;
    i++;
  }
  if (cell !== '' || row.length) pushRow();
  return { rows, lines };
}

// ─── Entrada ─────────────────────────────────────────────────────────────────
/**
 * @returns {{ kind, sheets: string[], sheet: number, rows: string[][], numeric: boolean[][], lines: number[], truncated: boolean }}
 *   lines[i] = número da linha original (como o Excel mostra) da linha i
 *   rows inclui a(s) linha(s) de cabeçalho; quem chama escolhe a linha do cabeçalho.
 */
async function readSheet(buf, { sheet = 0 } = {}) {
  if (!Buffer.isBuffer(buf) || !buf.length) throw bad('Envie o arquivo da planilha.', 'NO_FILE');
  if (buf.length > LIMITS.bytes) throw new AppError(`Arquivo acima de ${Math.round(LIMITS.bytes / 1048576)} MB. Divida a planilha em partes.`, 413, 'FILE_TOO_LARGE');
  let rows; let numeric; let sheets = []; let kind; let lines;

  if (buf.readUInt32BE(0) === 0x504b0304) { // zip → .xlsx
    kind = 'xlsx';
    guardZip(buf);
    try {
      sheets = await readXlsx.readSheetNames(buf);
      const idx = Math.min(Math.max(Number(sheet) || 0, 0), Math.max(sheets.length - 1, 0));
      sheet = idx;
      const raw = await readXlsx(buf, { sheet: idx + 1 });
      numeric = raw.slice(0, LIMITS.rows + 40).map(r => r.slice(0, LIMITS.cols).map(v => typeof v === 'number'));
      rows = raw.slice(0, LIMITS.rows + 40).map(r => r.slice(0, LIMITS.cols).map(v => cellText(v).slice(0, LIMITS.cell)));
      if (raw.length > LIMITS.rows + 40) rows.truncatedSource = true;
      lines = rows.map((_, i) => i + 1);
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw bad('Não consegui ler a planilha. Confira se o arquivo abre no Excel e salve de novo como .xlsx.');
    }
  } else if (buf.readUInt32BE(0) === 0xd0cf11e0) {
    throw bad('Este é um arquivo .xls antigo. Abra no Excel e use "Salvar como" → .xlsx (ou CSV).', 'XLS_UNSUPPORTED');
  } else {
    kind = 'csv';
    if (buf.subarray(0, 4096).includes(0)) throw bad('O arquivo não parece uma planilha CSV ou Excel (.xlsx).');
    const text = decodeText(buf);
    const parsed = parseCsvText(text, detectDelimiter(text));
    rows = parsed.rows.map(r => r.slice(0, LIMITS.cols)); lines = parsed.lines;
    numeric = rows.map(r => r.map(() => false));
    sheets = []; sheet = 0;
  }

  // descarta linhas totalmente vazias do começo/meio sem perder a posição relativa útil
  const keep = [];
  rows.forEach((r, i) => { if (r.some(c => String(c).trim() !== '')) keep.push(i); });
  const outRows = keep.map(i => rows[i]);
  const outNum = keep.map(i => numeric[i]);
  const outLines = keep.map(i => lines[i]);
  const width = Math.max(0, ...outRows.map(r => r.length));
  const pad = (r, fill) => (r.length < width ? r.concat(Array(width - r.length).fill(fill)) : r);
  const truncated = outRows.length > LIMITS.rows + 1 || !!rows.truncatedSource;
  return {
    kind, sheets, sheet,
    rows: outRows.slice(0, LIMITS.rows + 1 + 30).map(r => pad(r, '')),
    numeric: outNum.slice(0, LIMITS.rows + 1 + 30).map(r => pad(r, false)),
    lines: outLines.slice(0, LIMITS.rows + 1 + 30),
    truncated,
  };
}

// ─── Saída ───────────────────────────────────────────────────────────────────
/** Evita "injeção de fórmula" ao abrir no Excel: células de texto que começam com = + - @ viram texto literal. */
const safeCell = (v) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /^[=+\-@\t\r]/.test(s) && !/^[+-]?\d[\d.,\s()-]*$/.test(s) ? "'" + s : s;
};

/** CSV para o Excel brasileiro: separador ";", UTF-8 com BOM, CRLF. */
function toCsv(header, rows) {
  const esc = (v) => { const s = safeCell(v); return /[";\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return Buffer.from('﻿' + [header, ...rows].map(r => r.map(esc).join(';')).join('\r\n') + '\r\n', 'utf8');
}

async function toXlsx(header, rows, { sheetName = 'Leads', widths, extraSheet } = {}) {
  const head = header.map(h => ({ value: h, fontWeight: 'bold', backgroundColor: '#e2e8f0' }));
  const body = rows.map(r => r.map(v => ({ value: safeCell(v), type: String })));
  const main = [head, ...body];
  const columns = header.map((h, i) => ({ width: widths?.[i] || Math.min(Math.max(String(h).length + 4, 14), 40) }));
  if (!extraSheet) return writeXlsx(main, { buffer: true, sheet: sheetName, columns, stickyRowsCount: 1 });
  const extra = extraSheet.lines.map((l, i) => [{ value: l, type: String, fontWeight: i === 0 ? 'bold' : undefined }]);
  return writeXlsx([main, extra], { buffer: true, sheets: [sheetName, extraSheet.name], columns: [columns, [{ width: 110 }]], stickyRowsCount: 1 });
}

module.exports = { LIMITS, readSheet, toCsv, toXlsx, safeCell, parseCsvText, detectDelimiter };
