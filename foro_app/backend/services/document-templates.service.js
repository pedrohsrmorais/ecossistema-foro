/**
 * document-templates.service.js — biblioteca de modelos de documentos.
 *
 * Fontes (a segunda sobrepõe a primeira quando a `key` coincide):
 *   1. Modelos embutidos:  backend/templates/documentos/<area>/<key>.md
 *   2. Modelos do escritório/VPS: pasta em DOCUMENT_TEMPLATES_DIR (mesma estrutura: <area>/<key>.md)
 *
 * Formato: front matter YAML + corpo em Markdown.
 *   key, title, area, version, reviewed (bool), source, legal_basis [ids de referência], description
 *   Corpo: {{placeholders}} preenchidos pelo sistema e [[IA: instrução]] preenchidos pela IA.
 * Ver documentation/documentos-e-modelos.md.
 */
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const areas = require('../configs/legal-areas');

const BUILTIN_DIR = path.join(__dirname, '..', 'templates', 'documentos');
let cache = null;

function _parse(file, origin) {
  const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) throw new Error('front matter ausente');
  const meta = yaml.load(m[1]) || {};
  const body = m[2].trim();
  if (!meta.key || !/^[a-z0-9_]{2,60}$/.test(meta.key)) throw new Error('key inválida (use a-z, 0-9, _)');
  if (!meta.title) throw new Error('title ausente');
  if (!areas.AREA_KEYS.includes(meta.area)) throw new Error(`area inválida: ${meta.area}`);
  if (!body) throw new Error('corpo vazio');
  return {
    key: meta.key, title: String(meta.title), area: meta.area, version: String(meta.version || '1'),
    reviewed: meta.reviewed === true, source: meta.source ? String(meta.source) : null,
    description: meta.description ? String(meta.description) : null,
    legal_basis: Array.isArray(meta.legal_basis) ? meta.legal_basis.map(String) : [],
    origin, body,
    ai_slots: (body.match(new RegExp(require('./document-guard').SLOT_SRC, 'g')) || []).length,
  };
}

function _scan(dir, origin, into, problems) {
  if (!dir || !fs.existsSync(dir)) return;
  for (const area of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!area.isDirectory()) continue;
    for (const f of fs.readdirSync(path.join(dir, area.name))) {
      if (!f.endsWith('.md')) continue;
      const file = path.join(dir, area.name, f);
      try { const t = _parse(file, origin); into.set(t.key, t); }
      catch (e) { problems.push(`${origin}:${area.name}/${f}: ${e.message}`); }
    }
  }
}

function load(force = false) {
  if (cache && !force) return cache;
  const map = new Map(); const problems = [];
  _scan(BUILTIN_DIR, 'embutido', map, problems);
  _scan(process.env.DOCUMENT_TEMPLATES_DIR, 'servidor', map, problems);
  problems.forEach(p => console.warn('[templates] ignorado —', p));
  cache = { map, problems };
  return cache;
}

/** Modelo do escritório (tabela office_templates) no mesmo formato dos de arquivo. */
function fromOffice(r) {
  const legal = typeof r.legal_basis === 'string' ? JSON.parse(r.legal_basis || '[]') : (r.legal_basis || []);
  return {
    id: r.id, key: `o_${r.id}`, title: r.title, area: r.area_key, version: String(r.version), reviewed: !!r.reviewed, source: 'Modelo do escritório',
    description: r.description || null, legal_basis: legal, origin: 'escritório', body: r.body,
    ai_slots: (r.body.match(new RegExp(require('./document-guard').SLOT_SRC, 'g')) || []).length, office_id: r.id, created_by: r.created_by,
  };
}

async function _office(accountId) {
  if (!accountId) return [];
  const { query } = require('../configs/db.config');
  const [rows] = await query('SELECT * FROM office_templates WHERE account_id = ? AND deleted_at IS NULL ORDER BY title', [accountId]);
  return rows.map(fromOffice);
}

/** Modelos visíveis para o escritório: os da plataforma + os próprios do escritório. */
async function list(areaKey, accountId) {
  const all = [...load().map.values(), ...(await _office(accountId))];
  return all.filter(t => !areaKey || t.area === areaKey || t.area === 'geral')
    .map(({ body, ...meta }) => meta).sort((a, b) => (a.origin === 'escritório') - (b.origin === 'escritório') || a.area.localeCompare(b.area) || a.title.localeCompare(b.title));
}
async function get(key, accountId) {
  if (String(key).startsWith('o_')) {
    if (!accountId) return null;
    const { query } = require('../configs/db.config');
    const [rows] = await query('SELECT * FROM office_templates WHERE id = ? AND account_id = ? AND deleted_at IS NULL LIMIT 1', [String(key).slice(2), accountId]);
    return rows[0] ? fromOffice(rows[0]) : null;
  }
  return load().map.get(key) || null;
}

module.exports = { load, list, get, fromOffice, BUILTIN_DIR };
