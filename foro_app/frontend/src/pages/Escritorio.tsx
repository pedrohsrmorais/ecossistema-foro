import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Building2, Copy, RefreshCw, Check, X, ShieldCheck } from 'lucide-react'
import clsx from 'clsx'
import { officeApi, settingsApi, type ActivityRow } from '../api'
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

function DadosTab({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient()
  const { data: o } = useQuery({ queryKey: ['office'], queryFn: officeApi.get })
  const [f, setF] = useState({ name: '', cnpj: '', address: '', city: '', state: '', office_phone: '' })
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [copied, setCopied] = useState(false)
  useEffect(() => { if (o) setF({ name: o.name || '', cnpj: o.cnpj || '', address: o.address || '', city: o.city || '', state: o.state || '', office_phone: o.phone || '' }) }, [o])
  const save = useMutation({
    mutationFn: () => officeApi.update(f),
    onSuccess: () => { setMsg({ ok: true, t: 'Dados salvos.' }); qc.invalidateQueries({ queryKey: ['office'] }); qc.invalidateQueries({ queryKey: ['settings'] }) },
    onError: (e: any) => setMsg({ ok: false, t: e?.response?.data?.error || 'Não foi possível salvar.' }),
  })
  const regen = useMutation({ mutationFn: officeApi.regenerateCode, onSuccess: () => qc.invalidateQueries({ queryKey: ['office'] }) })
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF(x => ({ ...x, [k]: e.target.value }))
  if (!o) return null
  return (
    <div className="space-y-5">
      <form className="card p-5" onSubmit={e => { e.preventDefault(); setMsg(null); save.mutate() }}>
        <h2 className="font-medium text-slate-900 mb-3">Dados do escritório</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          <label className="sm:col-span-2 text-sm">Nome<input className="input mt-1" value={f.name} onChange={set('name')} disabled={!canEdit} required /></label>
          <label className="text-sm">CNPJ (opcional)<input className="input mt-1" value={f.cnpj} onChange={set('cnpj')} disabled={!canEdit} placeholder="00.000.000/0000-00" /></label>
          <label className="text-sm">Telefone<input className="input mt-1" value={f.office_phone} onChange={set('office_phone')} disabled={!canEdit} /></label>
          <label className="sm:col-span-2 text-sm">Endereço<input className="input mt-1" value={f.address} onChange={set('address')} disabled={!canEdit} /></label>
          <label className="text-sm">Cidade<input className="input mt-1" value={f.city} onChange={set('city')} disabled={!canEdit} /></label>
          <label className="text-sm">UF
            <select className="input mt-1" value={f.state} onChange={set('state')} disabled={!canEdit}><option value="">—</option>{UFS.map(u => <option key={u}>{u}</option>)}</select>
          </label>
        </div>
        {canEdit && (
          <div className="mt-4 flex items-center gap-3">
            <button className="btn-primary" disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar'}</button>
            {msg && <span className={msg.ok ? 'text-sm text-green-700' : 'text-sm text-red-600'}>{msg.t}</span>}
          </div>
        )}
        <p className="text-xs text-slate-400 mt-3">O CNPJ é informado por você, conferido apenas pelo dígito verificador e não dá acesso a nada: ninguém entra no escritório digitando o CNPJ.</p>
      </form>

      {canEdit && (
        <div className="card p-5">
          <h2 className="font-medium text-slate-900 mb-1">Como convidar pessoas</h2>
          <p className="text-sm text-slate-500 mb-3">Duas formas: convite por e-mail (aba Equipe) ou o código abaixo. Quem usa o código só entra depois que você aprovar em “Pedidos”.</p>
          <div className="flex items-center gap-2 flex-wrap">
            <code className="px-3 py-2 rounded-lg bg-slate-100 text-lg font-mono tracking-[0.25em]" data-testid="office-code">{o.code}</code>
            <button className="btn-secondary text-sm" onClick={() => { navigator.clipboard?.writeText(o.code || ''); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
              <Copy className="w-4 h-4" /> {copied ? 'Copiado' : 'Copiar'}
            </button>
            <button className="btn-secondary text-sm" disabled={regen.isPending} onClick={() => confirm('Gerar um novo código? O código atual deixa de funcionar e os pedidos pendentes são recusados.') && regen.mutate()}>
              <RefreshCw className="w-4 h-4" /> Gerar novo código
            </button>
          </div>
        </div>
      )}
      {!canEdit && (
        <div className="card p-4 text-sm text-slate-600 flex gap-2"><ShieldCheck className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
          O administrador do escritório mede o tempo ativo de uso da plataforma (apenas enquanto a aba está aberta e em uso) e a quantidade de ações. Nenhum conteúdo de tela é gravado.</div>
      )}
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
  const { data } = useQuery({ queryKey: ['office-activity', days], queryFn: () => officeApi.activity(days) })
  const max = Math.max(1, ...(data?.series.map(s => s.seconds) || [1]))
  return (
    <div className="space-y-5">
      <div className="card p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
          <h2 className="font-medium text-slate-900">Atividade e consumo da equipe</h2>
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

const TABS = [['dados', 'Dados'], ['equipe', 'Equipe e permissões'], ['pedidos', 'Pedidos'], ['atividade', 'Atividade'], ['plano', 'Plano']] as const

export default function Escritorio() {
  const { data: o, isLoading } = useQuery({ queryKey: ['office'], queryFn: officeApi.get })
  const { data: plan } = useQuery({ queryKey: ['plan'], queryFn: settingsApi.getPlan })
  const [tab, setTab] = useState<(typeof TABS)[number][0]>('dados')
  if (isLoading || !o) return <div className="p-6 text-slate-400">Carregando…</div>
  if (!o.configured) return <div className="p-6 flex justify-center"><CreateOffice /></div>
  const admin = o.is_admin
  const tabs = admin ? TABS : TABS.filter(([k]) => k === 'dados' || k === 'equipe')
  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2"><Building2 className="w-5 h-5 text-accent-500" /> {o.name}</h1>
        <p className="text-sm text-slate-500">Escritório · {o.seats_used} usuário(s){o.plan.max_users ? ` de ${o.plan.max_users}` : ''}</p>
      </div>
      <div className="flex gap-1 border-b mb-5 overflow-x-auto" role="tablist">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={clsx('px-3 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap', tab === k ? 'border-brand-600 text-brand-800' : 'border-transparent text-slate-500 hover:text-slate-800')}>
            {l}{k === 'pedidos' && (o.pending_requests || 0) > 0 && <span className="ml-1.5 badge bg-accent-100 text-accent-700 !py-0">{o.pending_requests}</span>}
          </button>
        ))}
      </div>
      {tab === 'dados' && <DadosTab canEdit={admin} />}
      {tab === 'equipe' && <TeamPanel maxUsers={plan?.max_users ?? undefined} />}
      {tab === 'pedidos' && admin && <PedidosTab />}
      {tab === 'atividade' && admin && <AtividadeTab />}
      {tab === 'plano' && admin && <PlanoTab />}
    </div>
  )
}
