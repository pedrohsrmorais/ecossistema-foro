// Gera o catálogo de chamadas da API (documentation/frontend-api.md, entre os marcadores "gerado")
// a partir de src/api.ts (funções, verbo, rota, retorno, descrição) e backend/routes/api.routes.js
// (pública/autenticada, módulo, área, permissão, admin). Uso: npm run docs:api   (--check: só confere)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const API = fs.readFileSync(path.join(root, 'frontend/src/api.ts'), 'utf8')
const ROUTES = fs.readFileSync(path.join(root, 'backend/routes/api.routes.js'), 'utf8')
const DOC = path.join(root, 'documentation/frontend-api.md')
const START = '<!-- gerado:inicio -->', END = '<!-- gerado:fim -->'

// ── backend: regras de acesso por rota ──────────────────────────────────────
const arrays = {}
for (const m of ROUTES.matchAll(/^const (\w+)\s*=\s*\[(.*)\];/gm)) arrays[m[1]] = m[2]
const expand = (s) => s.replace(/\.\.\.(\w+)/g, (_, n) => (arrays[n] ? expand(arrays[n]) : ''))
const authLine = ROUTES.split('\n').findIndex(l => /^router\.use\(authenticate\)/.test(l))
const routes = []
ROUTES.split('\n').forEach((line, i) => {
  const m = line.match(/^router\.(get|post|put|patch|delete)\s*\(\s*'([^']+)'\s*,(.*)$/)
  if (!m) return
  const body = expand(m[3])
  const all = (re) => [...body.matchAll(re)].map(x => x[1])
  routes.push({
    method: m[1].toUpperCase(),
    segs: m[2].split('/').map(s => (s.startsWith(':') ? { param: true, allow: (s.match(/\(([^)]*)\)/) || [])[1]?.split('|') } : { lit: s })),
    path: m[2],
    pub: i < authLine,
    modules: all(/requireModule\('(\w+)'\)/g),
    access: all(/requireAccess\('(\w+)'\)/g),
    perms: all(/requirePermission\('(\w+)'\)/g),
    admin: /requireAdmin/.test(body),
    flags: [/requireLookupsEnabled/.test(body) && 'FEATURE_LOOKUPS_ENABLED', /requireProcessLookupEnabled/.test(body) && 'FEATURE_PROCESS_LOOKUP_ENABLED'].filter(Boolean),
  })
})
const findRoute = (method, p) => {
  const segs = p.split('/')
  return routes.find(r => r.method === method && r.segs.length === segs.length && r.segs.every((s, i) =>
    s.lit !== undefined ? (s.lit === segs[i] || segs[i] === ':x') : (segs[i] === ':x' || !s.allow || s.allow.includes(segs[i]))))
}

// ── frontend: objetos *Api do api.ts ────────────────────────────────────────
function block(src, from) { // devolve o texto entre a { em `from` e a } correspondente
  let d = 0
  for (let i = from; i < src.length; i++) {
    if (src[i] === '{') d++
    else if (src[i] === '}') { d--; if (d === 0) return src.slice(from + 1, i) }
  }
  return ''
}
function generic(s, at) { // <...> balanceado a partir de `at`
  if (s[at] !== '<') return null
  let d = 0
  for (let i = at; i < s.length; i++) { if (s[i] === '<') d++; else if (s[i] === '>') { d--; if (d === 0) return s.slice(at + 1, i) } }
  return null
}
const clean = (s) => s.replace(/\s+/g, ' ').trim()
// nome amigável de cada objeto (se faltar, usa o título da seção do api.ts)
const LABEL = {
  authApi: 'Login, cadastro, senha e verificação de e-mail', usersApi: 'Usuários do escritório (convites, papéis, perfil)',
  fieldsApi: 'Campos personalizados dos leads', leadImportApi: 'Importar leads de planilha (assistente)', leadsApi: 'CRM — leads, notas, tarefas, exportação',
  casesApi: 'Meus processos (cases)', areasApi: 'Áreas do direito', leadStagesApi: 'Etapas do funil de leads', stagesApi: 'Etapas dos processos',
  casePeopleApi: 'Pessoas ligadas ao processo', workspacesApi: 'Workspaces (escritórios do usuário)', officeApi: 'Escritório (dados, entrada por código)',
  permissionsApi: 'Permissões disponíveis', officeTemplatesApi: 'Modelos de documento do escritório', documentsApi: 'Documentos (gerar, anexar, baixar)',
  eventsApi: 'Agenda — compromissos', tasksApi: 'Tarefas e prazos (visão geral)', aiLogApi: 'IA — histórico de ações', aiApi: 'IA — chat',
  billingApi: 'Assinatura e assentos por usuário', paymentsApi: 'Pagamentos (checkout/portal)', plansApi: 'Planos', settingsApi: 'Configurações do escritório',
  creditsApi: 'Carteira de créditos (hoje só p/ processos — desligado)', lookupApi: 'Consultas de CPF/CNPJ (cota semanal) e criar lead',
  lookupEnrichApi: 'Enriquecer lista (planilha de CPF/CNPJ)', processSearchApi: 'Pesquisa de processos (DJEN + DataJud)',
  caseTrackingApi: 'Acompanhamento de publicações em Meus processos', savedProcessesApi: 'Processos salvos (sem tela hoje)', modulesApi: 'Módulos ligados na conta',
  educationApi: 'Educação (trilhas/aulas)', quizzesApi: 'Provas de conceito', challengesApi: 'Desafios semanais', communityApi: 'Comunidade',
  adminApi: 'Painel da plataforma (equipe intellsn)', alertsApi: 'Alertas de prazo', dashboardApi: 'Painel (dashboard)', supportApi: 'Suporte',
  boardsApi: 'Quadros personalizáveis', googleApi: 'Integração Google Agenda',
}
const objs = []
let section = ''
const lines = API.split('\n')
let offset = 0
for (const line of lines) {
  const sec = line.match(/^\/\/ ─── (.+?) ─*$/)
  if (sec) section = sec[1].replace(/\s*[—-]\s*$/, '')
  if (/^\/\/ PAINEL ADMINISTRATIVO/.test(line)) section = 'PAINEL ADMINISTRATIVO DA PLATAFORMA'
  const m = line.match(/^export const (\w+Api)\s*=\s*\{/)
  if (m) {
    const body0 = block(API, offset + line.indexOf('{'))
    const body = body0.startsWith('\n') ? body0 : '\n  ' + body0.trim()   // objetos de uma linha só
    const fns = []
    // entradas no 1º nível do objeto (2 espaços) — também as de uma linha só: { list: () => ... }
    const entryRe = /(?:\/\*\*([\s\S]*?)\*\/\s*)?(?:^ {2}|\{\s*)(\w+):\s*(async\s*)?\(([^)]*)\)\s*(?::\s*[^=]+)?=>/gm
    const hits = [...body.matchAll(entryRe)]
    hits.forEach((h, k) => {
      const end = k + 1 < hits.length ? hits[k + 1].index : body.length
      const txt = body.slice(h.index, end)
      const calls = []
      for (const c of txt.matchAll(/(http|httpAdmin)\.(get|post|put|patch|delete)\b/g)) {
        const after = c.index + c[0].length
        const g = generic(txt, after)
        const rest = txt.slice(after + (g !== null ? g.length + 2 : 0))
        const pm = rest.match(/^\(\s*([`'])([^`']+)\1/)
        if (!pm) continue
        const raw = pm[2]
        const norm = raw.replace(/\$\{[^}]+\}/g, ':x').replace(/\?.*$/, '')
        calls.push({ client: c[1], method: c[2].toUpperCase(), path: raw.replace(/\$\{([^}]+)\}/g, ':$1'), norm, ret: g ? clean(g) : null })
      }
      // descrição do JSDoc sem repetir "GET /rota" no começo
      const doc = h[1] ? clean(h[1].replace(/^\s*\*\s?/gm, '')).replace(/^(GET|POST|PUT|PATCH|DELETE)\s+\S+\s*(—|-|:)?\s*/, '') : ''
      const binary = /\.\.\.BIN|fileOf\(|responseType:\s*'blob'|Blob/.test(txt)
      const raw = /application\/octet-stream|application\/pdf|transformRequest/.test(txt)
      fns.push({ name: h[2], params: clean(h[4]), calls, doc, binary, raw })
    })
    objs.push({ name: m[1], section: LABEL[m[1]] || section, fns })
  }
  offset += line.length + 1
}

// ── markdown ────────────────────────────────────────────────────────────────
const esc = (s) => String(s || '').replace(/\|/g, '\\|').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const rules = (r) => {
  if (!r) return '—'
  if (r.pub) return 'pública'
  const out = []
  if (r.admin) out.push('admin do escritório')
  if (r.modules.length) out.push('módulo ' + [...new Set(r.modules)].join(', '))
  if (r.access.length) out.push('área ' + [...new Set(r.access)].join(', '))
  if (r.perms.length) out.push('perm. ' + [...new Set(r.perms)].join(', '))
  out.push(...r.flags)
  return out.join(' · ') || 'logado'
}
let total = 0, unmapped = []
let md = `${START}\n\n_Gerado por \`npm run docs:api\` (frontend/scripts/gen-api-docs.mjs) a partir de \`src/api.ts\` e \`backend/routes/api.routes.js\`. Não edite à mão entre os marcadores._\n\n`
md += '| Objeto | Área |\n|---|---|\n' + objs.map(o => `| [\`${o.name}\`](#${o.name.toLowerCase()}) | ${esc(o.section)} |`).join('\n') + '\n\n'
for (const o of objs) {
  md += `### ${o.name}\n\n_${esc(o.section)}_${o.name === 'adminApi' ? ' — cliente separado (`httpAdmin`, token `foro_admin_token`); só para o painel da plataforma em `/admin`.' : ''}\n\n`
  md += '| Função | Chamada | Retorno | Acesso | Observação |\n|---|---|---|---|---|\n'
  for (const f of o.fns) {
    total++
    const call = f.calls.map(c => `\`${c.method} ${c.path}\``).join('<br>') || '_(sem HTTP)_'
    const ret = f.binary ? 'arquivo (`{ blob, filename }`)' : (f.calls[0]?.ret ? `\`${esc(f.calls[0].ret)}\`` : '—')
    const r = f.calls[0] ? findRoute(f.calls[0].method, f.calls[0].norm) : null
    if (f.calls[0] && !r) unmapped.push(`${o.name}.${f.name} → ${f.calls[0].method} ${f.calls[0].path}`)
    const notes = [f.doc, f.raw && 'corpo = arquivo cru'].filter(Boolean).join(' · ')
    md += `| \`${f.name}(${esc(f.params)})\` | ${call} | ${ret} | ${esc(rules(r))} | ${esc(notes)} |\n`
  }
  md += '\n'
}
md += `_${objs.length} objetos · ${total} funções._\n\n${END}`

const cur = fs.existsSync(DOC) ? fs.readFileSync(DOC, 'utf8') : `${START}\n${END}\n`
const a = cur.indexOf(START), b = cur.indexOf(END)
if (a < 0 || b < 0) { console.error('Marcadores não encontrados em', DOC); process.exit(1) }
const next = cur.slice(0, a) + md + cur.slice(b + END.length)
if (process.argv.includes('--check')) {
  if (next !== cur) { console.error('documentation/frontend-api.md está desatualizado: rode npm run docs:api'); process.exit(1) }
  console.log('frontend-api.md em dia.')
} else {
  fs.writeFileSync(DOC, next)
  console.log(`frontend-api.md: ${objs.length} objetos, ${total} funções.`)
}
if (unmapped.length) console.warn('Sem rota correspondente no backend:\n  ' + unmapped.join('\n  '))
