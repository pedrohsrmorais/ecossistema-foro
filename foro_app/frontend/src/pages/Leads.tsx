import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search, ChevronDown, ChevronRight, ExternalLink, Trash2, LayoutList, Columns3, Sparkles } from 'lucide-react'
import clsx from 'clsx'
import { leadsApi, type Lead, type PaginatedResult } from '../api'
import { useChat } from '../context/ChatContext'
import { STAGES, stageOf } from '../lib/stages'
import { EditableCell, StagePill } from '../components/crm'

const COLS = 'grid-cols-[28px_minmax(180px,2fr)_minmax(120px,1fr)_minmax(160px,1.4fr)_130px_minmax(100px,1fr)_100px_56px]'

type BoardData = PaginatedResult<Lead>

function useBoardMutations() {
  const qc = useQueryClient()
  const key = ['leads', 'board']
  const patch = (id: string, change: Partial<Lead>) =>
    qc.setQueryData<BoardData>(key, old => old && { ...old, data: old.data.map(l => (l.id === id ? { ...l, ...change } : l)) })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['funnel'] }) }

  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Lead> }) => leadsApi.update(id, data),
    onMutate: ({ id, data }) => patch(id, data),
    onError: refresh,
  })
  const move = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) => leadsApi.moveStage(id, stage),
    onMutate: ({ id, stage }) => patch(id, { stage }),
    onSettled: refresh,
  })
  const create = useMutation({ mutationFn: (d: Partial<Lead>) => leadsApi.create(d), onSuccess: refresh })
  const remove = useMutation({ mutationFn: (id: string) => leadsApi.delete(id), onSuccess: refresh })
  return { update, move, create, remove }
}

function AddRow({ stage, onCreate }: { stage: string; onCreate: (name: string) => void }) {
  const [name, setName] = useState('')
  function submit() { if (name.trim()) { onCreate(name.trim()); setName('') } }
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-t bg-slate-50/50">
      <Plus className="w-3.5 h-3.5 text-slate-400" />
      <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()}
        placeholder="Adicionar lead (Enter)" title={`Novo lead em "${stageOf(stage).label}"`}
        className="flex-1 text-sm bg-transparent outline-none placeholder:text-slate-400 py-1" />
    </div>
  )
}

export default function Leads() {
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'board' | 'kanban'>(() => (localStorage.getItem('foro_leads_view') as any) || 'board')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [dragId, setDragId] = useState<string | null>(null)
  const { setOpen } = useChat()
  const { update, move, create, remove } = useBoardMutations()

  const { data, isLoading } = useQuery({ queryKey: ['leads', 'board'], queryFn: () => leadsApi.list({ limit: 500 }), staleTime: 15_000 })

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const all = data?.data ?? []
    return q ? all.filter(l => [l.name, l.phone, l.email].some(v => v?.toLowerCase().includes(q))) : all
  }, [data, search])

  function setViewMode(v: 'board' | 'kanban') { setView(v); try { localStorage.setItem('foro_leads_view', v) } catch {} }
  const addLead = (stage: string) => (name: string) => create.mutate({ name, stage })
  const del = (l: Lead) => { if (confirm(`Excluir o lead "${l.name || 'sem nome'}"?`)) remove.mutate(l.id) }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Leads</h1>
          <p className="text-sm text-slate-500">{data?.total ?? 0} no funil · clique em qualquer campo para editar</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border bg-white p-0.5">
            {([['board', LayoutList, 'Quadro'], ['kanban', Columns3, 'Kanban']] as const).map(([k, Icon, label]) => (
              <button key={k} onClick={() => setViewMode(k)}
                className={clsx('flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md', view === k ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100')}>
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
          <button className="btn-secondary text-sm" onClick={() => setOpen(true)}><Sparkles className="w-4 h-4 text-accent-500" /> Pedir à IA</button>
          <button className="btn-primary text-sm" onClick={() => create.mutate({ name: 'Novo lead', stage: 'novo' })}><Plus className="w-4 h-4" /> Novo lead</button>
        </div>
      </div>

      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input className="input pl-9" placeholder="Buscar por nome, telefone ou e-mail…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="card p-8 text-center text-slate-400">Carregando…</div>
      ) : view === 'board' ? (
        <div className="space-y-5 overflow-x-auto">
          {STAGES.map(st => {
            const rows = filtered.filter(l => l.stage === st.key)
            const isCollapsed = collapsed[st.key]
            return (
              <section key={st.key} className="card overflow-hidden min-w-[860px]">
                <button onClick={() => setCollapsed(c => ({ ...c, [st.key]: !c[st.key] }))}
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 text-left">
                  {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                  <span className={clsx('w-1 h-5 rounded-full', st.bar)} />
                  <span className="font-semibold text-slate-900">{st.label}</span>
                  <span className="text-xs text-slate-400">{rows.length} {rows.length === 1 ? 'lead' : 'leads'}</span>
                </button>
                {!isCollapsed && (
                  <>
                    <div className={clsx('grid items-center gap-2 px-3 py-1.5 border-y bg-slate-50 text-xs font-medium text-slate-500', COLS)}>
                      <span /><span>Nome</span><span>Telefone</span><span>E-mail</span><span className="text-center">Etapa</span><span>Responsável</span><span>Criado</span><span />
                    </div>
                    {rows.map(l => (
                      <div key={l.id} className={clsx('group grid items-center gap-2 px-3 py-1 border-b last:border-b-0 hover:bg-slate-50/70', COLS)}>
                        <span className={clsx('w-1 h-6 rounded-full', st.bar)} />
                        <EditableCell bold value={l.name} placeholder="Sem nome" onSave={v => update.mutate({ id: l.id, data: { name: v } })} />
                        <EditableCell value={l.phone} placeholder="Telefone" onSave={v => update.mutate({ id: l.id, data: { phone: v } })} />
                        <EditableCell value={l.email} placeholder="E-mail" onSave={v => update.mutate({ id: l.id, data: { email: v } })} />
                        <StagePill stage={l.stage} onChange={s => move.mutate({ id: l.id, stage: s })} />
                        <span className="text-sm text-slate-500 truncate px-1.5">{l.assigned_name || '—'}</span>
                        <span className="text-sm text-slate-500 px-1.5">{new Date(l.created_at).toLocaleDateString('pt-BR')}</span>
                        <span className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link to={`/leads/${l.id}`} title="Abrir" className="p-1 text-slate-400 hover:text-brand-600"><ExternalLink className="w-4 h-4" /></Link>
                          <button onClick={() => del(l)} title="Excluir" className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                        </span>
                      </div>
                    ))}
                    <AddRow stage={st.key} onCreate={addLead(st.key)} />
                  </>
                )}
              </section>
            )
          })}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.map(st => {
            const rows = filtered.filter(l => l.stage === st.key)
            return (
              <div key={st.key} className="w-72 shrink-0 bg-slate-100/70 rounded-xl p-2"
                onDragOver={e => e.preventDefault()}
                onDrop={() => { if (dragId) move.mutate({ id: dragId, stage: st.key }); setDragId(null) }}>
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <span className={clsx('w-2.5 h-2.5 rounded-full', st.bar)} />
                  <span className="text-sm font-semibold text-slate-800">{st.label}</span>
                  <span className="text-xs text-slate-400">{rows.length}</span>
                </div>
                <div className="space-y-2 min-h-[40px]">
                  {rows.map(l => (
                    <Link key={l.id} to={`/leads/${l.id}`} draggable onDragStart={() => setDragId(l.id)} onDragEnd={() => setDragId(null)}
                      className={clsx('block bg-white border rounded-lg p-3 shadow-sm hover:shadow transition-shadow', dragId === l.id && 'opacity-40')}>
                      <p className="text-sm font-medium text-slate-900 truncate">{l.name || 'Sem nome'}</p>
                      <p className="text-xs text-slate-500 truncate">{l.phone || l.email || '—'}</p>
                      <p className="text-[11px] text-slate-400 mt-1.5">{l.assigned_name || 'Sem responsável'} · {new Date(l.created_at).toLocaleDateString('pt-BR')}</p>
                    </Link>
                  ))}
                </div>
                <div className="mt-2 rounded-lg overflow-hidden border bg-white"><AddRow stage={st.key} onCreate={addLead(st.key)} /></div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
