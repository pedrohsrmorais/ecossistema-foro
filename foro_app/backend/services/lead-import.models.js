/**
 * lead-import.models.js — "modelos" de importação do CRM Comercial e o reconhecimento automático das colunas.
 *
 * Um modelo = um jeito comum de uma lista vir. Cada coluna do arquivo é reconhecida por REGEX sobre o
 * cabeçalho normalizado (minúsculas, sem acento, sinais viram espaço) e, quando o cabeçalho não ajuda, pelo
 * CONTEÚDO (a maioria dos valores parece e-mail, CPF/CNPJ válido, telefone, CEP ou UF).
 *
 * Funções puras (sem banco): detectModel, suggestMapping, buildRecord.
 */
const N = require('../utils/lead-normalize');

/** Para onde cada coluna pode ir. `multi`: várias colunas podem alimentar o mesmo destino. */
const TARGETS = [
  { key: 'name', label: 'Nome', multi: false },
  { key: 'name_last', label: 'Sobrenome (junta ao nome)', multi: false },
  { key: 'document', label: 'CPF/CNPJ', multi: true },
  { key: 'phone', label: 'Telefone / celular', multi: true },
  { key: 'email', label: 'E-mail', multi: true },
  { key: 'company', label: 'Empresa / razão social', multi: false },
  { key: 'address', label: 'Endereço (rua, nº, bairro…)', multi: true },
  { key: 'city', label: 'Cidade', multi: false },
  { key: 'state', label: 'UF / estado', multi: false },
  { key: 'cep', label: 'CEP', multi: false },
  { key: 'stage', label: 'Etapa do funil', multi: false },
  { key: 'source', label: 'Origem', multi: false },
  { key: 'assigned', label: 'Responsável', multi: false },
  { key: 'notes', label: 'Observações (viram uma nota)', multi: true },
  { key: 'free', label: 'Texto livre (extrai nome, telefone, e-mail e CPF/CNPJ)', multi: true },
  { key: 'custom', label: 'Guardar como campo extra (usa o nome da coluna)', multi: true },
  { key: 'ignore', label: 'Ignorar esta coluna', multi: true },
];
const TARGET_KEYS = new Set(TARGETS.map(t => t.key));
const SINGLE = new Set(TARGETS.filter(t => !t.multi).map(t => t.key));

/** [regex do cabeçalho normalizado, destino, destino alternativo se o principal já foi usado] */
const BASE = [
  [/^(nome|nome completo|name|full name|cliente|nome do cliente|nome do contato|nome do lead|contato|titular|pessoa|display name)$/, 'name'],
  [/^(razao social|nome empresarial)$/, 'name', 'company'],
  [/^(primeiro nome|first name|given name)$/, 'name'],
  [/^(sobrenome|ultimo nome|last name|family name|surname)$/, 'name_last'],
  [/^(nome fantasia|fantasia|empresa|organizacao|organization|organization name|company|companhia|nome da empresa|empresa organizacao)$/, 'company'],
  [/^(cpf cnpj|cnpj cpf|cpf ou cnpj|cpf|cnpj|documento|doc|numero do documento|cpf cnpj do cliente|cpf do cliente|cnpj do cliente)$/, 'document'],
  [/^(telefone|telefones|celular|fone|tel|whatsapp|zap|phone|mobile|movel|telefone principal|telefone celular|telefone residencial|telefone comercial|telefone fixo|contato telefonico|mobile phone|home phone|business phone|primary phone)( \d+)?( (valor|value))?$/, 'phone'],
  [/^(e mail|email|mail|correio eletronico|e mail address|email address|e mails|emails)( \d+)?( (valor|value))?$/, 'email'],
  [/^(logradouro|endereco|endereco completo|rua|avenida|address|street|bairro|complemento)$/, 'address'],
  [/^(cidade|municipio|city|localidade)$/, 'city'],
  [/^(uf|estado|state|sigla uf|sigla do estado)$/, 'state'],
  [/^(cep|codigo postal|zip|zip code|postal code)$/, 'cep'],
  [/^(etapa|etapa do funil|estagio|fase|funil|stage|pipeline stage|situacao do lead)$/, 'stage'],
  [/^(origem|origem do lead|fonte|canal|source|como conheceu)$/, 'source'],
  [/^(responsavel|responsavel pelo lead|proprietario|owner|vendedor|atendente|consultor|assigned to|advogado responsavel)$/, 'assigned'],
  [/^(observacao|observacoes|obs|notas|nota|anotacoes|comentarios|comentario|descricao|detalhes|notes|note)$/, 'notes'],
];

/** Colunas que só fazem sentido como parte do endereço em listas cadastrais ("Número", "Complemento"…). */
const CADASTRAL_EXTRA = [
  [/^(numero|num|nro|n)$/, 'address'],
  [/^(tipo logradouro|tipo de logradouro)$/, 'address'],
  [/^(situacao cadastral|data de nascimento|nascimento|nome da mae|mae|sexo|genero|renda|score|cbo|profissao|ocupacao|estado civil|data abertura|data de abertura|cnae|porte|natureza juridica|capital social)$/, 'custom'],
];

const FREE = [[/^(contato|contato livre|dados de contato|dados|informacoes|cliente contato|nome e contato|contato completo)$/, 'free']];

const FORO_HEADERS = ['Nome', 'CPF/CNPJ', 'Telefone', 'E-mail', 'Empresa', 'Cidade', 'UF', 'Origem', 'Etapa', 'Responsável', 'Observações'];

/**
 * `signature`: regex que "assinam" o modelo (quantas colunas batem decide a detecção).
 * `rules`: padrões extras / sobrescritas, valem antes de BASE.
 */
const MODELS = [
  {
    key: 'foro',
    label: 'Modelo Foro',
    description: 'A planilha do próprio Foro: Nome, CPF/CNPJ, Telefone, E-mail, Empresa, Cidade, UF, Origem, Etapa, Responsável e Observações. É o mesmo formato da exportação, então dá para exportar, ajustar e importar de volta.',
    headers: FORO_HEADERS,
    examples: [
      ['(EXEMPLO) Maria Souza', '529.982.247-25', '(51) 99999-0000', 'maria@exemplo.com.br', '', 'Porto Alegre', 'RS', 'Indicação', 'Novo', '', 'Apague as linhas de exemplo antes de importar'],
      ['(EXEMPLO) Alfa Comércio Ltda', '11.222.333/0001-81', '(11) 3333-4444', 'contato@alfa.exemplo.com.br', 'Alfa Comércio Ltda', 'São Paulo', 'SP', 'Lista de eventos', 'Em contato', '', ''],
    ],
    signature: FORO_HEADERS.map(h => new RegExp('^' + N.normHeader(h) + '$')),
    rules: [],
  },
  {
    key: 'lista_cadastral',
    label: 'Lista cadastral (pessoas e empresas)',
    description: 'Listas de bases cadastrais e de empresas especializadas em dados: CPF e CNPJ, razão social, vários telefones e e-mails (Telefone 1, Telefone 2, Celular, E-mail 1, E-mail 2) e endereço em várias colunas (Logradouro, Número, Bairro, Cidade, UF, CEP).',
    headers: ['CPF', 'CNPJ', 'Nome', 'Razão Social', 'Telefone 1', 'Telefone 2', 'Celular', 'E-mail 1', 'E-mail 2', 'Logradouro', 'Número', 'Complemento', 'Bairro', 'Cidade', 'UF', 'CEP'],
    examples: [
      ['529.982.247-25', '', '(EXEMPLO) Maria Souza', '', '(51) 3333-4444', '', '(51) 99999-0000', 'maria@exemplo.com.br', '', 'Rua das Flores', '100', 'Apto 12', 'Centro', 'Porto Alegre', 'RS', '90010-000'],
      ['', '11.222.333/0001-81', '', '(EXEMPLO) Alfa Comércio Ltda', '(11) 3333-4444', '(11) 98888-7777', '', 'contato@alfa.exemplo.com.br', 'fiscal@alfa.exemplo.com.br', 'Av. Paulista', '1000', 'Sala 5', 'Bela Vista', 'São Paulo', 'SP', '01310-100'],
    ],
    signature: [/^(telefone|celular|fone|tel) \d+$/, /^(e mail|email) \d+$/, /^(logradouro|bairro)$/, /^razao social$/, /^cep$/, /^cnpj$/, /^cpf$/],
    rules: CADASTRAL_EXTRA,
  },
  {
    key: 'contatos',
    label: 'Contatos (Google, Outlook, celular)',
    description: 'Exportações de agenda de contatos: nome e sobrenome em colunas separadas, "E-mail 1 - Valor", "Telefone 1 - Valor", Organização. Reconhece os nomes das colunas em inglês e em português.',
    headers: ['Nome', 'Sobrenome', 'E-mail 1 - Valor', 'Telefone 1 - Valor', 'Organização'],
    examples: [
      ['(EXEMPLO) Maria', 'Souza', 'maria@exemplo.com.br', '(51) 99999-0000', ''],
      ['(EXEMPLO) João', 'Pereira', 'joao@exemplo.com.br', '(11) 98888-7777', 'Pereira & Filhos'],
    ],
    signature: [/^(first name|given name|primeiro nome)$/, /^(last name|family name|sobrenome)$/, /^(e mail|email) \d+ (valor|value)$/, /^(phone|telefone) \d+ (valor|value)$/, /^(organization name|organizacao|company)$/, /^(e mail address|email address)$/, /^(mobile phone|home phone|business phone)$/],
    rules: [],
  },
  {
    key: 'texto_livre',
    label: 'Contato numa coluna só',
    description: 'Lista em que nome, telefone, e-mail e CPF/CNPJ estão juntos numa mesma célula (ex.: "Maria Souza - (51) 99999-0000 - maria@x.com - CPF 529.982.247-25"). O Foro separa cada informação por padrões de texto (regex).',
    headers: ['Contato'],
    examples: [
      ['(EXEMPLO) Maria Souza - (51) 99999-0000 - maria@exemplo.com.br - CPF 529.982.247-25'],
      ['(EXEMPLO) Alfa Comércio Ltda, tel 11 3333-4444, contato@alfa.exemplo.com.br, CNPJ 11.222.333/0001-81'],
    ],
    signature: [/^(contato|contato livre|dados de contato|dados|informacoes|contato completo|nome e contato)$/],
    rules: FREE,
  },
  {
    key: 'generico',
    label: 'Planilha genérica / outro CRM',
    description: 'Qualquer planilha com cabeçalho: o Foro procura colunas parecidas com Nome, Telefone/Celular, E-mail, Empresa, Cidade, Estado, Etapa/Estágio, Origem, Responsável/Proprietário e Observações — e olha o conteúdo quando o nome da coluna não ajuda. Serve para exportações de outros CRMs; confira o mapeamento na prévia.',
    headers: ['Nome', 'Empresa', 'E-mail', 'Telefone', 'Cidade', 'Estado', 'Origem', 'Observações'],
    examples: [
      ['(EXEMPLO) Maria Souza', '', 'maria@exemplo.com.br', '(51) 99999-0000', 'Porto Alegre', 'RS', 'Site', ''],
      ['(EXEMPLO) João Pereira', 'Pereira & Filhos', 'joao@exemplo.com.br', '(11) 98888-7777', 'São Paulo', 'SP', 'Indicação', 'Quer revisar contrato de aluguel'],
    ],
    signature: [],
    rules: [],
  },
];
const MODEL_BY_KEY = Object.fromEntries(MODELS.map(m => [m.key, m]));

// ─── Reconhecimento ──────────────────────────────────────────────────────────
function headerTarget(header, model) {
  const h = N.normHeader(header);
  if (!h) return null;
  const rules = [...(MODEL_BY_KEY[model]?.rules || []), ...BASE];
  for (const [re, target, alt] of rules) if (re.test(h)) return { target, alt: alt || null };
  return null;
}

const sampleOf = (rows, col, n = 60) => rows.map(r => String(r[col] ?? '').trim()).filter(Boolean).slice(0, n);
const share = (vals, fn) => (vals.length ? vals.filter(fn).length / vals.length : 0);

/** Descobre o destino olhando os valores da coluna. Devolve null se nada convence (≥ 60 % dos valores). */
function contentTarget(values) {
  if (values.length < 2) return null;
  if (share(values, v => N.isEmail(v)) >= 0.6) return 'email';
  if (share(values, v => { const d = N.normDocument(v); return d && d.valid; }) >= 0.6) return 'document';
  if (share(values, v => { const p = N.normPhone(v); return p && p.valid; }) >= 0.6) return 'phone';
  if (share(values, v => /^\d{5}-?\d{3}$/.test(v)) >= 0.6) return 'cep';
  if (share(values, v => v.length <= 20 && !!N.normUf(v)) >= 0.8) return 'state';
  const rich = share(values, v => { const x = N.extractFromText(v); return (x.emails.length + x.phones.length + x.documents.length) >= 2; });
  if (rich >= 0.6) return 'free';
  return null;
}

/**
 * Quantas colunas "assinam" cada modelo → modelo mais provável.
 * @returns {{ key: string, scores: Record<string, number> }}
 */
function detectModel(headers, rows) {
  const hs = headers.map(N.normHeader);
  const scores = {};
  for (const m of MODELS) scores[m.key] = m.signature.reduce((n, re) => n + (hs.some(h => re.test(h)) ? 1 : 0), 0);
  // o modelo Foro só vale se quase todas as colunas dele estiverem lá
  if (scores.foro < 9) scores.foro = 0;
  // texto livre: poucas colunas e conteúdo "rico" numa delas
  if (scores.texto_livre < 2) {
    const richCol = headers.findIndex((_, c) => contentTarget(sampleOf(rows, c)) === 'free');
    if (richCol >= 0 && headers.length <= 3) scores.texto_livre = 2;
  }
  let best = 'generico'; let top = 1;
  for (const m of MODELS) if (m.key !== 'generico' && scores[m.key] > top) { best = m.key; top = scores[m.key]; }
  if (scores.foro >= 9) best = 'foro';
  return { key: best, scores };
}

/**
 * Sugere o destino de cada coluna. Cabeçalho primeiro; sem cabeçalho conhecido, o conteúdo.
 * Destinos de valor único (nome, cidade…) só são usados uma vez: a 2ª coluna cai no destino alternativo ou "ignore".
 * @returns {{ target: string, via: 'cabecalho'|'conteudo'|null }[]}
 */
function suggestMapping(headers, rows, modelKey = 'generico') {
  const hits = headers.map((h, c) => {
    const hit = headerTarget(h, modelKey);
    // "Contato"/"Nome" cheio de telefone + e-mail + CPF dentro da célula é texto livre, não só o nome
    if (hit && hit.target === 'name' && contentTarget(sampleOf(rows, c)) === 'free') return { target: 'free', alt: null, via: 'conteudo' };
    if (hit) return { ...hit, via: 'cabecalho' };
    const t = contentTarget(sampleOf(rows, c));
    return t ? { target: t, alt: null, via: 'conteudo' } : null;
  });
  const used = new Set(); const out = Array(headers.length).fill(null);
  // 1ª passada: destinos "fortes" (sem alternativa) — ex.: a coluna "Nome" fica com o nome
  hits.forEach((h, c) => {
    if (!h || h.alt) return;
    if (SINGLE.has(h.target)) { if (used.has(h.target)) { out[c] = { target: 'ignore', via: null }; return; } used.add(h.target); }
    out[c] = { target: h.target, via: h.via };
  });
  // 2ª passada: "Razão social" vira o nome se ninguém tomou, senão vira empresa
  hits.forEach((h, c) => {
    if (!h || !h.alt) return;
    let t = h.target;
    if (SINGLE.has(t) && used.has(t)) { t = h.alt; if (SINGLE.has(t) && used.has(t)) t = 'ignore'; }
    if (t !== 'ignore' && SINGLE.has(t)) used.add(t);
    out[c] = { target: t, via: t === 'ignore' ? null : h.via };
  });
  return out.map(o => o || { target: 'ignore', via: null });
}

// ─── Linha → registro ────────────────────────────────────────────────────────
const isExample = (cells) => cells.some(c => /^\(exemplo\)/i.test(String(c || '').trim()));

/**
 * Transforma uma linha em registro limpo. Não consulta o banco (etapa, responsável e duplicados são resolvidos depois).
 * @param {string[]} cells        valores da linha
 * @param {boolean[]} isNum       a célula era número no Excel
 * @param {string[]} headers
 * @param {string[]} mapping      destino por coluna
 * @param {{ properNames?: boolean, defaultDdd?: string|null }} opts
 * @returns {{ rec, issues: {level:'aviso'|'erro', msg:string}[], empty: boolean, example: boolean }}
 */
function buildRecord(cells, isNum, headers, mapping, opts = {}) {
  const issues = []; const warn = (msg) => issues.push({ level: 'aviso', msg });
  const rec = { name: '', document: '', phones: [], emails: [], company: '', address: [], city: '', state: '', cep: '', stage: '', source: '', assigned: '', notes: [], custom: {} };
  if (cells.every(c => String(c ?? '').trim() === '')) return { rec, issues, empty: true, example: false };
  if (isExample(cells)) return { rec, issues, empty: false, example: true };

  const docs = []; let nameLast = '';
  const addPhone = (raw, where) => {
    for (const part of N.splitPhones(raw)) {
      const p = N.normPhone(part, opts);
      if (!p) continue;
      if (!p.valid) { rec.notes.push(`Telefone descartado (${p.reason}): ${part}`); warn(`${where}: ${p.reason} («${part}»)`); continue; }
      if (p.fixed) warn(`${where}: adicionado o 9 inicial em «${part}»`);
      if (!rec.phones.includes(p.value)) rec.phones.push(p.value);
    }
  };
  const addEmail = (raw, where) => {
    for (const part of N.splitEmails(raw)) {
      if (!part.includes('@')) continue;
      if (!N.isEmail(part)) { rec.notes.push(`E-mail descartado (formato inválido): ${part}`); warn(`${where}: e-mail inválido («${part}»)`); continue; }
      const e = part.toLowerCase();
      if (!rec.emails.includes(e)) rec.emails.push(e);
    }
  };
  const addDoc = (d, where, raw) => {
    if (!d) return;
    if (!d.valid) { rec.notes.push(`CPF/CNPJ descartado (dígito verificador não confere): ${raw}`); warn(`${where}: CPF/CNPJ inválido («${raw}»)`); return; }
    if (d.padded) warn(`${where}: zeros à esquerda recompostos no CPF/CNPJ`);
    docs.push(d);
  };

  mapping.forEach((target, c) => {
    const raw = String(cells[c] ?? '').trim();
    if (!raw || !target || target === 'ignore') return;
    const where = headers[c] || `coluna ${c + 1}`;
    switch (target) {
      case 'name': rec.name = rec.name || N.clean(raw); break;
      case 'name_last': nameLast = N.clean(raw); break;
      case 'document': addDoc(N.normDocument(raw, { numeric: !!isNum[c] }), where, raw); break;
      case 'phone': addPhone(raw, where); break;
      case 'email': addEmail(raw, where); break;
      case 'company': rec.company = rec.company || N.clean(raw); break;
      case 'address': rec.address.push(N.clean(raw)); break;
      case 'city': rec.city = rec.city || N.clean(raw); break;
      case 'state': { const uf = N.normUf(raw); if (uf) rec.state = rec.state || uf; else warn(`${where}: UF desconhecida («${raw}»)`); break; }
      case 'cep': { const cep = N.normCep(raw); if (cep) rec.cep = rec.cep || cep; else warn(`${where}: CEP inválido («${raw}»)`); break; }
      case 'stage': rec.stage = rec.stage || N.clean(raw); break;
      case 'source': rec.source = rec.source || N.clean(raw).slice(0, 100); break;
      case 'assigned': rec.assigned = rec.assigned || N.clean(raw); break;
      case 'notes': rec.notes.push(raw.length > 1000 ? raw.slice(0, 1000) + '…' : raw); break;
      case 'custom': { const label = N.clean(headers[c]) || `Coluna ${c + 1}`; rec.custom[label] = rec.custom[label] ? `${rec.custom[label]}; ${N.clean(raw)}` : N.clean(raw); break; }
      case 'free': {
        const x = N.extractFromText(raw, opts);
        if (x.name) rec.name = rec.name || x.name;
        x.phones.forEach(p => { if (!rec.phones.includes(p)) rec.phones.push(p); });
        x.emails.forEach(e => { if (!rec.emails.includes(e)) rec.emails.push(e); });
        x.documents.forEach(d => addDoc(d, where, N.formatDocument(d.digits)));
        if (x.ceps[0]) rec.cep = rec.cep || x.ceps[0];
        if (!x.name && !x.phones.length && !x.emails.length && !x.documents.length) rec.notes.push(`${where}: ${raw.slice(0, 300)}`);
        break;
      }
      default: break;
    }
  });

  if (nameLast) rec.name = rec.name ? `${rec.name} ${nameLast}` : nameLast;
  // sem nome mas com empresa: a empresa serve de nome
  if (!rec.name && rec.company) rec.name = rec.company;
  if (opts.properNames !== false) { rec.name = N.properName(rec.name); rec.company = N.properName(rec.company); }
  rec.name = rec.name.slice(0, 255);
  // primeiro documento válido vira o do lead; os demais viram nota (não se perde dado)
  if (docs.length) {
    rec.document = docs[0].digits;
    for (const d of docs.slice(1)) if (d.digits !== docs[0].digits) rec.notes.push(`Outro ${d.type === 'cnpj' ? 'CNPJ' : 'CPF'}: ${N.formatDocument(d.digits)}`);
  }
  if (!rec.name && !rec.phones.length && !rec.emails.length && !rec.document) {
    issues.push({ level: 'erro', msg: 'Linha sem nome, telefone, e-mail ou CPF/CNPJ aproveitáveis' });
  }
  return { rec, issues, empty: false, example: false };
}

/** Escolhe a linha do cabeçalho entre as 10 primeiras: a que tem mais textos que parecem nome de coluna. */
function guessHeaderRow(rows) {
  let best = 0; let bestScore = -1;
  rows.slice(0, 10).forEach((r, i) => {
    const filled = r.filter(c => String(c).trim()).length;
    if (!filled) return;
    const known = r.filter(c => headerTarget(c, 'generico')).length;
    const textual = r.filter(c => /[A-Za-zÀ-ÿ]/.test(c) && !N.isEmail(c) && String(c).length <= 40).length;
    const score = known * 10 + (textual >= filled * 0.8 ? filled : 0);
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
}

module.exports = { TARGETS, TARGET_KEYS, MODELS, MODEL_BY_KEY, detectModel, suggestMapping, buildRecord, guessHeaderRow, headerTarget, contentTarget };
