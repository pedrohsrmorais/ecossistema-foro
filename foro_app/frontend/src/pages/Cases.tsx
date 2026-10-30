import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Search, Plus, ChevronDown, ChevronRight, ExternalLink, Copy, Check, Trash2, Link2Off, Sparkles, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import { casesApi, leadsApi, type Case } from '../api'
import { EditableCell } from '../components/crm'
import { useChat } from '../context/ChatContext'
import { CASE_STATUSES, fmtDate } from '../lib/cases'

const COLS = 'grid-cols-[4px_minmax(230px,2fr)_minmax(130px,1fr)_70px_minmax(110px,1fr)_minmax(110px,1fr)_100px_64px]'

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false)
  return (
    <button title="Copiar número" className="p-1 text-slate-300 hover:text-brand-600 opacity-0 group-hover:opacity-100"
      onClick={e => { e.preventDefault(); navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200) }}>
      {done ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  )
}

export default function Cases() {
  const qc = useQueryClient()
  const { setOpen } = useChat()
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [newNumber, setNewNumber] = useState('')
  const [newLead, setNewLead] = useState('')
  const { data: leadsList } = useQuery({ queryKey: ['leads', 'board'], queryFn: () => leadsApi.list({ limit: 500 }), staleTime: 30_000 })
  const [error, setError] = useState('')

  const { data, isLoading } = useQuery({ queryKey: ['cases', 'all'], queryFn: () => casesApi.list(), staleTime: 15_000 })
  const refresh = () => qc.invalidateQueries({ queryKey: ['cases'] })

  const create = useMutation({
    mutationFn: (v: string) => {
      const looksLikeNumber = /\d{7}/.test(v.replace(/\D/g, '').slice(0, 7)) && v.replace(/\D/g, '').length >= 15
      return casesApi.create({ ...(looksLikeNumber ? { case_number: v } : { title: v }), ...(newLead ? { lead_id: newLead } : {}) })
    },
    onSuccess: () => { setNewNumber(''); setNewLead(''); setError(''); refresh(); qc.invalidateQueries({ queryKey: ['leads'] }) },
    onError: (e: any) => setError(e?.response?.data?.error || 'Não foi possível cadastrar o processo.'),
  })
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => casesApi.update(id, data),
    onSuccess: refresh,
    onError: (e: any) => { setError(e?.response?.data?.error || 'Não foi possível salvar.'); refresh() },
  })
  const remove = useMutation({ mutationFn: (id: string) => casesApi.remove(id), onSuccess: refresh })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const all = data?.data ?? []
    return q ? all.filter(c => [c.case_number, c.title, c.lead_name, c.opposing_party, c.area].some(v => v?.toLowerCase().includes(q))) : all
  }, [data, search])

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Processos</h1>
          <p className="text-sm text-slate-500">{data?.total ?? 0} processo(s) · o link do tribunal fica a um clique</p>
        </div>
        <button className="btn-secondary text-sm" onClick={() => setOpen(true)}><Sparkles className="w-4 h-4 text-accent-500" /> Pedir à IA</button>
      </div>

      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input className="input pl-9" placeholder="Buscar por número, cliente, parte contrária…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <form className="flex gap-2 flex-1 min-w-[300px]" onSubmit={e => { e.preventDefault(); if (newNumber.trim()) create.mutate(newNumber.trim()) }}>
          <input className="input" placeholder="Novo processo: cole o número CNJ (0000000-00.0000.0.00.0000) ou um título" value={newNumber} onChange={e => setNewNumber(e.target.value)} />
          <select className="input max-w-[200px]" value={newLead} onChange={e => setNewLead(e.target.value)} aria-label="Cliente do processo">
            <option value="">Cliente (opcional)</option>
            {leadsList?.data.map(l => <option key={l.id} value={l.id}>{l.name || 'Sem nome'}</option>)}
          </select>
          <button className="btn-primary shrink-0" disabled={!newNumber.trim() || create.isPending}><Plus className="w-4 h-4" /> Adicionar</button>
        </form>
      </div>
      {error && <p className="mb-3 text-sm text-red-600 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" />{error}</p>}

      {isLoading ? <div className="card p-8 text-center text-slate-400">Carregando…</div> : (data?.total ?? 0) === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-slate-600 mb-1">Nenhum processo cadastrado.</p>
          <p className="text-sm text-slate-400">Cole um número CNJ acima — o tribunal é identificado sozinho. Ou diga à IA: “cadastra o processo 0001234-08.2023.8.26.0100 da Maria”.</p>
        </div>
      ) : (
        <div className="space-y-5 overflow-x-auto">
          {CASE_STATUSES.map(st => {
            const rows = filtered.filter(c => c.status === st.key)
            if (rows.length === 0 && st.key !== 'ativo') return null
            const isCollapsed = collapsed[st.key]
            return (
              <section key={st.key} className="card overflow-hidden min-w-[900px]">
                <button onClick={() => setCollapsed(c => ({ ...c, [st.key]: !c[st.key] }))} className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 text-left">
                  {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                  <span className={clsx('w-1 h-5 rounded-full', st.bar)} />
                  <span className="font-semibold text-slate-900">{st.label}</span>
                  <span className="text-xs text-slate-400">{rows.length}</span>
                </button>
                {!isCollapsed && (
                  <>
                    <div className={clsx('grid items-center gap-2 px-3 py-1.5 border-y bg-slate-50 text-xs font-medium text-slate-500', COLS)}>
                      <span /><span>Processo</span><span>Cliente</span><span>Trib.</span><span>Área</span><span>Fase</span><span>Próx. prazo</span><span />
                    </div>
                    {rows.length === 0 && <p className="px-4 py-3 text-sm text-slate-400">Nenhum processo ativo.</p>}
                    {rows.map((c: Case) => (
                      <div key={c.id} className={clsx('group grid items-center gap-2 px-3 py-1.5 border-b last:border-b-0 hover:bg-slate-50/70', COLS)}>
                        <span className={clsx('w-1 h-7 rounded-full', st.bar)} />
                        <div className="min-w-0 flex items-center gap-1">
                          <Link to={`/processos/${c.id}`} className="min-w-0 hover:underline">
                            <p className="text-sm font-medium text-slate-900 font-mono truncate">{c.case_number || c.title || 'Sem número'}</p>
                            {c.case_number && c.title && <p className="text-xs text-slate-500 truncate">{c.title}</p>}
                          </Link>
                          {c.case_number && <CopyButton text={c.case_number} />}
                        </div>
                        <span className="text-sm text-slate-600 truncate px-1">{c.lead_id ? <Link to={`/leads/${c.lead_id}`} className="hover:underline text-brand-700">{c.lead_name}</Link> : '—'}</span>
                        <span className="text-xs font-medium text-slate-600">{c.tribunal || '—'}</span>
                        <EditableCell value={c.area} placeholder="Área" onSave={v => update.mutate({ id: c.id, data: { area: v } })} />
                        <EditableCell value={c.phase} placeholder="Fase" onSave={v => update.mutate({ id: c.id, data: { phase: v } })} />
                        <span className={clsx('text-sm px-1', c.next_deadline ? 'text-amber-700 font-medium' : 'text-slate-300')}>{c.next_deadline ? fmtDate(c.next_deadline) : '—'}</span>
                        <span className="flex items-center justify-end gap-1">
                          {c.court_url
                            ? <a href={c.court_url} target="_blank" rel="noreferrer" title="Abrir processo no tribunal" className="p-1 text-brand-600 hover:text-brand-800"><ExternalLink className="w-4 h-4" /></a>
                            : <Link to={`/processos/${c.id}`} title="Sem link do tribunal — clique para adicionar" className="p-1 text-slate-300 hover:text-amber-600"><Link2Off className="w-4 h-4" /></Link>}
                          <button onClick={() => confirm('Excluir este processo?') && remove.mutate(c.id)} title="Excluir" className="p-1 text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
                        </span>
                      </div>
                    ))}
                  </>
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
