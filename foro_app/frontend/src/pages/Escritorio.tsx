import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Copy, RefreshCw, Check, X, ShieldCheck, User as UserIcon, Users, Scale, Clock, LogOut, Download, Plus } from 'lucide-react'
import clsx from 'clsx'
import { officeApi, settingsApi, workspacesApi, permissionsApi, type ActivityRow, type Office, type Permissions } from '../api'
import { useAuth } from '../context/AuthContext'
import CreateOffice from '../components/CreateOffice'
import TeamPanel from '../components/TeamPanel'

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']
const LEVEL: Record<ActivityRow['level'], string> = {
  inativo: 'bg-slate-100 text-slate-500', baixo: 'bg-amber-100 text-amber-700', 'médio': 'bg-sky-100 text-sky-700', alto: 'bg-green-100 text-green-700',
}
const fmtDur = (s: number) => { const m = Math.round(s / 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` }
const ago = (iso: string | null) => {
  if (!iso) return 'nunca'
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 2) return 'agora'
  if (m < 60) return `há ${m} min`
  if (m < 1440) return `há ${Math.round(m / 60)} h`
  return `há ${Math.round(m / 1440)} d`
}

const AREAS = ['Trabalhista', 'Previdenciário', 'Cível', 'Família e Sucessões', 'Consumidor', 'Tributário', 'Empresarial', 'Criminal', 'Imobiliário', 'Administrativo', 'Digital / LGPD', 'Ambiental']
function maskCnpj(v: string) {
  const d = v.replace(/\D/g, '').slice(0, 14)
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2')
}
const maskCep = (v: string) => v.replace(/\D/g, '').slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2')

/** Quanto do cadastro do escritório está preenchido (a "ontologia" mínima). */
function completeness(o: Office) {
  const checks: [string, boolean][] = [
    ['Nome', !!o.name], ['CNPJ', !!o.cnpj], ['Razão social', !!o.legal_name], ['Telefone', !!o.phone], ['E-mail', !!o.email],
    ['Endereço', !!o.address && !!o.city && !!o.state], ['Registro OAB da sociedade', !!o.oab_society], ['Áreas de atuação', o.practice_areas.length > 0],
    ['Tamanho da equipe', o.headcount_total != null],
  ]
  return { pct: Math.round((checks.filter(c => c[1]).length / checks.length) * 100), missing: checks.filter(c => !c[1]).map(c => c[0]) }
}

function DadosTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient()
  const { data: o } = useQuery({ queryKey: ['office'], queryFn: officeApi.get })
  type F = { name: string; legal_name: string; cnpj: string; oab_society: string; founded_on: string; office_phone: string; office_email: string; website: string; zip_code: string; address: string; address_number: string; address_complement: string; district: string; city: string; state: string; headcount_total: string; headcount_lawyers: string; notes: string }
  const [f, setF] = useState<F>({ name: '', legal_name: '', cnpj: '', oab_society: '', founded_on: '', office_phone: '', office_email: '', website: '', zip_code: '', address: '', address_number: '', address_complement: '', district: '', city: '', state: '', headcount_total: '', headcount_lawyers: '', notes: '' })
  const [areas, setAreas] = useState<string[]>([])
  const [extra, setExtra] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  useEffect(() => {
    if (!o) return
    setF({ name: o.name || '', legal_name: o.legal_name || '', cnpj: o.cnpj || '', oab_society: o.oab_society || '', founded_on: o.founded_on || '', office_phone: o.phone || '', office_email: o.email || '', website: o.website || '',
      zip_code: o.zip_code || '', address: o.address || '', address_number: o.address_number || '', address_complement: o.address_complement || '', district: o.district || '', city: o.city || '', state: o.state || '',
      headcount_total: o.headcount_total != null ? String(o.headcount_total) : '', headcount_lawyers: o.headcount_lawyers != null ? String(o.headcount_lawyers) : '', notes: o.notes || '' })
    setAreas(o.practice_areas || [])
  }, [o])
  const save = useMutation({
    mutationFn: () => officeApi.update({
      ...f, practice_areas: areas,
      headcount_total: f.headcount_total === '' ? null : Number(f.headcount_total), headcount_lawyers: f.headcount_lawyers === '' ? null : Number(f.headcount_lawyers),
    }),
    onSuccess: () => { setMsg({ ok: true, t: 'Dados salvos.' }); qc.invalidateQueries({ queryKey: ['office'] }); qc.invalidateQueries({ queryKey: ['workspaces'] }) },
    onError: (e: any) => setMsg({ ok: false, t: e?.response?.data?.error || 'Não foi possível salvar.' }),
  })
  const set = (k: keyof F, mask?: (v: string) => string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF(x => ({ ...x, [k]: mask ? mask(e.target.value) : e.target.value }))
  const toggleArea = (a: string) => setAreas(x => x.includes(a) ? x.filter(i => i !== a) : [...x, a])
  if (!o) return null
  const dis = !canEdit
  const L = ({ t, children, wide }: { t: string; children: React.ReactNode; wide?: boolean }) => <label className={clsx('text-sm text-slate-700', wide && 'sm:col-span-2')}>{t}{children}</label>
  return (
    <form className="space-y-5" onSubmit={e => { e.preventDefault(); setMsg(null); save.mutate() }}>
      <div className="card p-5">
        <h2 className="font-medium text-slate-900 mb-3">Identificação</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <L t="Nome do escritório" wide><input className="input mt-1" value={f.name} onChange={set('name')} disabled={dis} required /></L>
          <L t="Razão social"><input className="input mt-1" value={f.legal_name} onChange={set('legal_name')} disabled={dis} /></L>
          <L t="CNPJ"><input className="input mt-1" value={f.cnpj} onChange={set('cnpj', maskCnpj)} disabled={dis} placeholder="00.000.000/0000-00" inputMode="numeric" /></L>
          <L t="Registro da sociedade na OAB"><input className="input mt-1" value={f.oab_society} onChange={set('oab_society')} disabled={dis} placeholder="OAB/RS 1234" /></L>
          <L t="Fundado em"><input type="date" className="input mt-1" value={f.founded_on} onChange={set('founded_on')} disabled={dis} /></L>
        </div>
      </div>
      <div className="card p-5">
        <h2 className="font-medium text-slate-900 mb-3">Contato e endereço</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <L t="Telefone"><input className="input mt-1" value={f.office_phone} onChange={set('office_phone')} disabled={dis} /></L>
          <L t="E-mail do escritório"><input type="email" className="input mt-1" value={f.office_email} onChange={set('office_email')} disabled={dis} /></L>
          <L t="Site" wide><input className="input mt-1" value={f.website} onChange={set('website')} disabled={dis} placeholder="https://" /></L>
          <L t="CEP"><input className="input mt-1" value={f.zip_code} onChange={set('zip_code', maskCep)} disabled={dis} inputMode="numeric" /></L>
          <L t="Logradouro"><input className="input mt-1" value={f.address} onChange={set('address')} disabled={dis} /></L>
          <L t="Número"><input className="input mt-1" value={f.address_number} onChange={set('address_number')} disabled={dis} /></L>
          <L t="Complemento"><input className="input mt-1" value={f.address_complement} onChange={set('address_complement')} disabled={dis} /></L>
          <L t="Bairro"><input className="input mt-1" value={f.district} onChange={set('district')} disabled={dis} /></L>
          <L t="Cidade"><input className="input mt-1" value={f.city} onChange={set('city')} disabled={dis} /></L>
          <L t="UF"><select className="input mt-1" value={f.state} onChange={set('state')} disabled={dis}><option value="">—</option>{UFS.map(u => <option key={u}>{u}</option>)}</select></L>
        </div>
      </div>
      <div className="card p-5">
        <h2 className="font-medium text-slate-900 mb-1">Atuação e tamanho</h2>
        <p className="text-xs text-slate-500 mb-3">Áreas em que o escritório atua e quantas pessoas ele tem (declarado por você). Compare com quem já está na plataforma na Visão geral.</p>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {[...new Set([...AREAS, ...areas])].map(a => (
            <button type="button" key={a} disabled={dis} aria-pressed={areas.includes(a)} onClick={() => toggleArea(a)}
              className={clsx('text-xs px-2.5 py-1 rounded-full border transition-colors', areas.includes(a) ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50')}>{a}</button>
          ))}
        </div>
        {canEdit && (
          <div className="flex gap-2 mb-4">
            <input className="input !w-56" value={extra} onChange={e => setExtra(e.target.value)} placeholder="Outra área…" maxLength={60}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const v = extra.trim(); if (v && !areas.includes(v)) setAreas(x => [...x, v]); setExtra('') } }} />
            <button type="button" className="btn-secondary text-sm" onClick={() => { const v = extra.trim(); if (v && !areas.includes(v)) setAreas(x => [...x, v]); setExtra('') }}><Plus className="w-4 h-4" /> Adicionar</button>
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          <L t="Integrantes no total (declarado)"><input type="number" min={0} className="input mt-1" value={f.headcount_total} onChange={set('headcount_total')} disabled={dis} /></L>
          <L t="Advogados (declarado)"><input type="number" min={0} className="input mt-1" value={f.headcount_lawyers} onChange={set('headcount_lawyers')} disabled={dis} /></L>
          <L t="Observações" wide><textarea rows={3} className="input mt-1" value={f.notes} onChange={set('notes')} disabled={dis} maxLength={2000} /></L>
        </div>
      </div>
      {canEdit && (
        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar dados'}</button>
          {msg && <span className={msg.ok ? 'text-sm text-green-700' : 'text-sm text-red-600'}>{msg.t}</span>}
        </div>
      )}
      <p className="text-xs text-slate-400">O CNPJ é informado por você, conferido apenas pelo dígito verificador e não dá acesso a nada: ninguém entra no escritório digitando o CNPJ.</p>
    </form>
  )
}

function ConviteCard({ o }: { o: Office }) {
  const qc = useQueryClient()
  const [copied, setCopied] = useState(false)
  const regen = useMutation({ mutationFn: officeApi.regenerateCode, onSuccess: () => qc.invalidateQueries({ queryKey: ['office'] }) })
  if (!o.code) return null
  return (
    <div className="card p-5">
      <h2 className="font-medium text-slate-900 mb-1">Como convidar pessoas</h2>
      <p className="text-sm text-slate-500 mb-3">Duas formas: convite por e-mail (abaixo, em Equipe) ou o código. Quem usa o código só entra depois que você aprovar em “Pedidos”. Quem já tem conta no Foro é adicionado direto e passa a ver o escritório no seletor de workspace.</p>
      <div className="flex items-center gap-2 flex-wrap">
        <code className="px-3 py-2 rounded-lg bg-slate-100 text-lg font-mono tracking-[0.25em]" data-testid="office-code">{o.code}</code>
        <button type="button" className="btn-secondary text-sm" onClick={() => { navigator.clipboard?.writeText(o.code || ''); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
          <Copy className="w-4 h-4" /> {copied ? 'Copiado' : 'Copiar'}
        </button>
        <button type="button" className="btn-secondary text-sm" disabled={regen.isPending} onClick={() => confirm('Gerar um novo código? O código atual deixa de funcionar e os pedidos pendentes são recusados.') && regen.mutate()}>
          <RefreshCw className="w-4 h-4" /> Gerar novo código
        </button>
      </div>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, sub }: { icon: any; label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-slate-500 flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" /> {label}</p>
      <p className="text-2xl font-semibold text-slate-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function VisaoTab({ o, setTab }: { o: Office; setTab: (t: any) => void }) {
  const { enterWorkspace } = useAuth()
  const { data: act } = useQuery({ queryKey: ['office-activity', 30], queryFn: () => officeApi.activity(30), enabled: o.is_admin })
  const { data: ws = [] } = useQuery({ queryKey: ['workspaces'], queryFn: workspacesApi.list })
  const me = ws.find(w => w.is_current)
  const leave = useMutation({
    mutationFn: () => workspacesApi.leave(me!.user_id),
    onSuccess: async r => { if (r.switch_to) { const t = await workspacesApi.switchTo(r.switch_to); enterWorkspace(t.token) } },
  })
  const comp = completeness(o)
  const declared = o.headcount_total
  const totalSecs = act?.users.reduce((n, u) => n + u.seconds, 0) || 0
  const totalActions = act?.users.reduce((n, u) => n + u.actions, 0) || 0
  const totalCredits = act?.users.reduce((n, u) => n + u.ai_credits, 0) || 0
  const totalDocs = act?.users.reduce((n, u) => n + u.documents_created, 0) || 0
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={Users} label="Na plataforma" value={o.members_on_platform} sub={declared != null ? `de ${declared} integrantes declarados${declared > o.members_on_platform ? ` · faltam ${declared - o.members_on_platform}` : ''}` : 'Informe o tamanho em Dados'} />
        <Kpi icon={Scale} label="Advogados declarados" value={o.headcount_lawyers ?? '—'} />
        <Kpi icon={Clock} label="Convites aguardando" value={o.pending_invites} sub={o.is_admin ? `${o.pending_requests || 0} pedido(s) por código` : undefined} />
        <Kpi icon={Building2} label="Cadastro completo" value={`${comp.pct}%`} sub={comp.missing.length ? `Falta: ${comp.missing.slice(0, 3).join(', ')}${comp.missing.length > 3 ? '…' : ''}` : 'Tudo preenchido'} />
      </div>

      <div className="card p-5">
        <h2 className="font-medium text-slate-900 mb-2">Perfil</h2>
        <dl className="text-sm grid sm:grid-cols-[10rem_1fr] gap-y-1.5">
          <dt className="text-slate-500">Razão social</dt><dd>{o.legal_name || '—'}</dd>
          <dt className="text-slate-500">CNPJ</dt><dd>{o.cnpj || '—'}</dd>
          <dt className="text-slate-500">OAB da sociedade</dt><dd>{o.oab_society || '—'}</dd>
          <dt className="text-slate-500">Localização</dt><dd>{[o.city, o.state].filter(Boolean).join(' / ') || '—'}</dd>
          <dt className="text-slate-500">Contato</dt><dd>{[o.phone, o.email, o.website].filter(Boolean).join(' · ') || '—'}</dd>
          <dt className="text-slate-500">Áreas de atuação</dt>
          <dd className="flex flex-wrap gap-1.5">{o.practice_areas.length ? o.practice_areas.map(a => <span key={a} className="badge bg-brand-50 text-brand-700">{a}</span>) : '—'}</dd>
        </dl>
        {o.is_admin && <button className="mt-3 text-sm underline text-brand-700" onClick={() => setTab('dados')}>Editar dados</button>}
      </div>

      {o.is_admin && act && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-slate-900">Últimos 30 dias</h2>
            <button className="text-sm underline text-brand-700" onClick={() => setTab('produtividade')}>Ver relatório completo</button>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <div><p className="text-slate-500 text-xs">Tempo ativo da equipe</p><p className="text-lg font-semibold">{fmtDur(totalSecs)}</p></div>
            <div><p className="text-slate-500 text-xs">Ações no CRM</p><p className="text-lg font-semibold">{totalActions}</p></div>
            <div><p className="text-slate-500 text-xs">Créditos de IA usados</p><p className="text-lg font-semibold">{totalCredits.toFixed(1)}</p></div>
            <div><p className="text-slate-500 text-xs">Documentos criados</p><p className="text-lg font-semibold">{totalDocs}</p></div>
          </div>
        </div>
      )}

      {!o.is_admin && (
        <div className="card p-4 text-sm text-slate-600 flex gap-2"><ShieldCheck className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
          As regras deste escritório (o que você pode fazer e o que a IA pode fazer por você) são definidas pelos administradores. O tempo ativo de uso (apenas com a aba aberta e em uso) e a quantidade de ações são visíveis para eles; nenhum conteúdo de tela é gravado.</div>
      )}
      {me && !me.is_owner && (
        <div className="text-right">
          <button className="text-sm text-slate-500 hover:text-red-600 inline-flex items-center gap-1.5" disabled={leave.isPending}
            onClick={() => confirm('Sair deste escritório? Você perde o acesso aos dados dele. Seu espaço pessoal e outros escritórios continuam.') && leave.mutate()}>
            <LogOut className="w-4 h-4" /> Sair deste escritório
          </button>
        </div>
      )}
    </div>
  )
}

function GovernancaTab({ o }: { o: Office }) {
  const qc = useQueryClient()
  const { data: defs = [] } = useQuery({ queryKey: ['perm-defs'], queryFn: permissionsApi.defs, staleTime: 10 * 60_000 })
  const [vals, setVals] = useState<Partial<Permissions>>({})
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  useEffect(() => { if (o.member_defaults) setVals(o.member_defaults) }, [o.member_defaults])
  const save = useMutation({
    mutationFn: () => officeApi.setGovernance(vals),
    onSuccess: () => { setMsg({ ok: true, t: 'Regras salvas. Valem para quem não tem ajuste individual.' }); qc.invalidateQueries({ queryKey: ['office'] }); qc.invalidateQueries({ queryKey: ['team'] }); qc.invalidateQueries({ queryKey: ['me-profile'] }) },
    onError: (e: any) => setMsg({ ok: false, t: e?.response?.data?.error || 'Não foi possível salvar.' }),
  })
  const eff = (d: { key: any; default: boolean }) => (typeof (vals as any)[d.key] === 'boolean' ? (vals as any)[d.key] : d.default)
  const group = (g: 'module' | 'action', title: string) => (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">{title}</p>
      <div className="space-y-1.5">
        {defs.filter(d => d.group === g).map(d => (
          <label key={d.key} className="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" className="mt-0.5 w-4 h-4" checked={eff(d)} onChange={e => setVals(v => ({ ...v, [d.key]: e.target.checked }))} /> {d.label}
          </label>
        ))}
      </div>
    </div>
  )
  return (
    <div className="card p-5 space-y-5" data-testid="governanca">
      <div>
        <h2 className="font-medium text-slate-900">Regras do escritório</h2>
        <p className="text-sm text-slate-500">Valem só dentro de <strong>{o.name}</strong>, para a equipe e para a IA (a IA nunca faz mais do que a pessoa pode fazer). Administradores podem tudo. Em Equipe você abre exceções por pessoa — o ajuste individual vence a regra geral.</p>
      </div>
      {group('module', 'Módulos liberados para membros')}
      {group('action', 'Ações permitidas para membros')}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5">O que membros enxergam</p>
        <select className="input !w-72" value={vals.view_scope || 'all'} onChange={e => setVals(v => ({ ...v, view_scope: e.target.value as 'all' | 'own' }))}>
          <option value="all">Tudo do escritório</option>
          <option value="own">Apenas o que é deles (a IA fica indisponível)</option>
        </select>
      </div>
      <div className="flex items-center gap-3">
        <button className="btn-primary" disabled={save.isPending} onClick={() => { setMsg(null); save.mutate() }}>{save.isPending ? 'Salvando…' : 'Salvar regras'}</button>
        {msg && <span className={msg.ok ? 'text-sm text-green-700' : 'text-sm text-red-600'}>{msg.t}</span>}
      </div>
    </div>
  )
}

function PedidosTab() {
  const qc = useQueryClient()
  const { data = [] } = useQuery({ queryKey: ['office-requests'], queryFn: officeApi.requests })
  const [err, setErr] = useState('')
  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => officeApi.decide(id, approve),
    onSuccess: () => { setErr(''); qc.invalidateQueries({ queryKey: ['office-requests'] }); qc.invalidateQueries({ queryKey: ['office'] }); qc.invalidateQueries({ queryKey: ['team'] }) },
    onError: (e: any) => setErr(e?.response?.data?.error || 'Não foi possível concluir.'),
  })
  return (
    <div className="card p-5">
      <h2 className="font-medium text-slate-900 mb-1">Pedidos de entrada</h2>
      <p className="text-sm text-slate-500 mb-4">Pessoas que usaram o código do escritório. Só aprove quem você conhece: quem entra passa a ver os dados que você liberar.</p>
      {err && <div className="mb-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{err} {/vaga|Limite/.test(err) && <Link to="/planos" className="underline font-medium">Ver planos</Link>}</div>}
      {data.length === 0 ? <p className="text-sm text-slate-400">Nenhum pedido pendente.</p> : (
        <ul className="divide-y border rounded-lg">
          {data.map(r => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0"><p className="text-sm text-slate-900">{r.name}</p><p className="text-xs text-slate-500">{r.email} · {ago(r.created_at)}</p></div>
              <button className="btn-primary text-sm" onClick={() => decide.mutate({ id: r.id, approve: true })} disabled={decide.isPending}><Check className="w-4 h-4" /> Aprovar</button>
              <button className="btn-secondary text-sm" onClick={() => decide.mutate({ id: r.id, approve: false })} disabled={decide.isPending}><X className="w-4 h-4" /> Recusar</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AtividadeTab() {
  const [days, setDays] = useState(30)
  const { data } = useQuery({ queryKey: ['office-activity', days], queryFn: () => officeApi.activity(days), refetchOnMount: 'always' })
  const max = Math.max(1, ...(data?.series.map(s => s.seconds) || [1]))
  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
          <h2 className="font-medium text-slate-900">Produtividade e consumo da equipe</h2>
          <button type="button" className="btn-secondary text-sm" disabled={!data} onClick={() => {
            if (!data) return
            const head = ['Nome', 'E-mail', 'Perfil', 'Tempo ativo (min)', 'Dias ativos', 'Ações', 'Nível', 'Créditos IA', 'Documentos', 'Processos']
            const rows = data.users.map(u => [u.name, u.email, u.role, Math.round(u.seconds / 60), u.active_days, u.actions, u.level, u.ai_credits.toFixed(1), u.documents_created, u.cases_responsible])
            const csv = [head, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')
            const url = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }))
            const a = document.createElement('a'); a.href = url; a.download = `produtividade-${days}d.csv`; a.click(); URL.revokeObjectURL(url)
          }}><Download className="w-4 h-4" /> Exportar CSV</button>
          <select className="input !w-40" aria-label="Período" value={days} onChange={e => setDays(Number(e.target.value))}>
            <option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option><option value={90}>Últimos 90 dias</option>
          </select>
        </div>
        <p className="text-xs text-slate-500 mb-4">Tempo ativo = minutos com a aba aberta e em uso (não conta aba esquecida). Nível: baixo &lt; 10 min/dia, médio &lt; 1 h/dia, alto ≥ 1 h/dia (média do período). Avise sua equipe que esse acompanhamento existe (LGPD).</p>
        {data && data.series.length > 0 && (
          <div className="flex items-end gap-0.5 h-16 mb-4" aria-label="Tempo ativo por dia">
            {data.series.map(s => <div key={String(s.day)} title={`${String(s.day).slice(0, 10)} · ${fmtDur(s.seconds)}`} className="flex-1 max-w-[18px] bg-brand-400/70 rounded-t min-h-[2px]" style={{ height: `${(s.seconds / max) * 100}%` }} />)}
          </div>
        )}
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 border-b text-left text-slate-600">
              {['Usuário', 'Tempo ativo', 'Dias ativos', 'Ações', 'Última atividade', 'Nível', 'Créditos IA', 'Docs', 'Processos'].map(h => <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}
            </tr></thead>
            <tbody>
              {data?.users.map(u => (
                <tr key={u.user_id} className="border-b last:border-0">
                  <td className="px-3 py-2"><div className="text-slate-900">{u.name}</div><div className="text-xs text-slate-500">{u.email}</div></td>
                  <td className="px-3 py-2 whitespace-nowrap">{fmtDur(u.seconds)}</td>
                  <td className="px-3 py-2">{u.active_days}</td>
                  <td className="px-3 py-2">{u.actions}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-slate-600">{ago(u.last_seen_at)}</td>
                  <td className="px-3 py-2"><span className={clsx('badge', LEVEL[u.level])}>{u.level}</span></td>
                  <td className="px-3 py-2">{u.ai_credits.toFixed(1)}</td>
                  <td className="px-3 py-2">{u.documents_created}</td>
                  <td className="px-3 py-2">{u.cases_responsible}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function PlanoTab() {
  const { data: o } = useQuery({ queryKey: ['office'], queryFn: officeApi.get })
  const { data: plan } = useQuery({ queryKey: ['plan'], queryFn: settingsApi.getPlan })
  if (!o) return null
  return (
    <div className="card p-5 space-y-3">
      <h2 className="font-medium text-slate-900">Planos por usuário</h2>
      <dl className="text-sm grid grid-cols-[9rem_1fr] gap-y-2">
        <dt className="text-slate-500">Seu plano</dt><dd className="text-slate-900">{plan?.name || o.plan.name}</dd>
        <dt className="text-slate-500">Usuários</dt><dd className="text-slate-900">{o.seats_used} em uso (cada pessoa tem o próprio plano)</dd>
        <dt className="text-slate-500">Créditos de IA/semana</dt><dd className="text-slate-900">{plan?.ai_credits_week ?? '—'} por usuário</dd>
      </dl>
      <p className="text-sm text-slate-500">Cada pessoa tem o próprio plano. O administrador contrata e melhora o plano de qualquer usuário, mas nunca pode reduzi-lo.</p>
      <div className="flex gap-2 items-center flex-wrap">
        <Link to="/planos" className="btn-primary">Ver e contratar planos</Link>
      </div>
    </div>
  )
}

const TABS = [['visao', 'Visão geral'], ['dados', 'Dados'], ['equipe', 'Equipe e permissões'], ['governanca', 'Governança'], ['pedidos', 'Pedidos'], ['produtividade', 'Produtividade'], ['plano', 'Plano']] as const
type TabKey = (typeof TABS)[number][0]

export default function Escritorio() {
  const { data: o, isLoading } = useQuery({ queryKey: ['office'], queryFn: officeApi.get })
  const { data: plan } = useQuery({ queryKey: ['plan'], queryFn: settingsApi.getPlan })
  const [params, setParams] = useSearchParams()
  const novo = params.get('novo') as 'criar' | 'entrar' | null
  const [tab, setTab] = useState<TabKey>('visao')
  if (isLoading || !o) return <div className="p-6 text-slate-400">Carregando…</div>

  const newCard = novo && (
    <div className="mb-5 relative max-w-md">
      <button className="absolute right-3 top-3 text-slate-400 hover:text-slate-700" aria-label="Fechar" onClick={() => setParams({}, { replace: true })}><X className="w-4 h-4" /></button>
      <CreateOffice initialMode={novo === 'entrar' ? 'join' : 'create'} />
    </div>
  )

  if (o.kind === 'personal') {
    return (
      <div className="p-6 max-w-4xl">
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2 mb-1"><UserIcon className="w-5 h-5 text-accent-500" /> Seu espaço pessoal</h1>
        <p className="text-sm text-slate-500 mb-5">Aqui os dados, as regras e a IA valem só para você. Para trabalhar com uma equipe, crie um escritório ou entre em um com o código — você troca entre os workspaces quando quiser, pelo menu no topo, e cada um tem os próprios dados e regras.</p>
        {novo ? newCard : <CreateOffice initialMode="create" />}
        <p className="text-xs text-slate-400 mt-4">Seu plano e créditos de IA aqui são seus: <Link to="/planos" className="underline">ver planos</Link>.</p>
      </div>
    )
  }

  const admin = o.is_admin
  const tabs = admin ? TABS : TABS.filter(([k]) => k === 'visao' || k === 'dados' || k === 'equipe')
  const active: TabKey = tabs.some(([k]) => k === tab) ? tab : 'visao'
  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2"><Building2 className="w-5 h-5 text-accent-500" /> {o.name}</h1>
        <p className="text-sm text-slate-500">Escritório · {o.members_on_platform} pessoa(s) na plataforma{o.headcount_total != null ? ` de ${o.headcount_total} declaradas` : ''} · você é {admin ? 'administrador' : 'membro'}</p>
      </div>
      {newCard}
      <div className="flex gap-1 border-b mb-5 overflow-x-auto" role="tablist">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={active === k} onClick={() => setTab(k)}
            className={clsx('px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap', active === k ? 'border-brand-600 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800')}>
            {l}{k === 'pedidos' && (o.pending_requests || 0) > 0 && <span className="ml-1.5 badge bg-accent-100 text-accent-700 !py-0">{o.pending_requests}</span>}
          </button>
        ))}
      </div>
      {active === 'visao' && <VisaoTab o={o} setTab={setTab} />}
      {active === 'dados' && <DadosTab canEdit={admin} />}
      {active === 'equipe' && <div className="space-y-5">{admin && <ConviteCard o={o} />}<TeamPanel maxUsers={plan?.max_users ?? undefined} /></div>}
      {active === 'governanca' && admin && <GovernancaTab o={o} />}
      {active === 'pedidos' && admin && <PedidosTab />}
      {active === 'produtividade' && admin && <AtividadeTab />}
      {active === 'plano' && admin && <PlanoTab />}
    </div>
  )
}
