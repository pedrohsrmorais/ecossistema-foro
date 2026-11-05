import { useState, useMemo, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search, ChevronDown, ChevronRight, ExternalLink, Trash2, LayoutList, Columns3, Sparkles, Settings2, Upload, Download } from 'lucide-react'
import clsx from 'clsx'
import { leadsApi, leadImportApi, type Lead, type PaginatedResult } from '../api'
import { saveFile } from '../lib/download'
import LeadImport from '../components/LeadImport'
import { useChat } from '../context/ChatContext'
import { useLeadStages } from '../lib/stages'
import LeadStagesEditor from '../components/LeadStagesEditor'
import { useAuth } from '../context/AuthContext'
import { EditableCell, StagePill } from '../components/crm'
import { useCan } from '../hooks/useCan'

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
  const canCreate = useCan('create_leads')
  const { stageOf } = useLeadStages()
  const [name, setName] = useState('')
  const input = useRef<HTMLInputElement>(null)
  if (!canCreate) return null
  const label = stageOf(stage).label
  function submit() { if (name.trim()) { onCreate(name.trim()); setName('') } else input.current?.focus() }
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-t bg-slate-50/50">
      <button type="button" onClick={submit} aria-label={`Adicionar lead em ${label}`} title={name.trim() ? 'Adicionar' : 'Digite o nome ao lado'}
        className="p-0.5 rounded text-slate-400 hover:text-brand-600 hover:bg-slate-200/60">
        <Plus className="w-4 h-4" />
      </button>
      <input ref={input} value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()}
        placeholder="Adicionar lead (Enter ou +)" title={`Novo lead em "${label}"`}
        className="flex-1 text-sm bg-transparent outline-none placeholder:text-slate-400 py-1" />
    </div>
  )
}

export default function Leads() {
  const canCreate = useCan('create_leads')
  const canDelete = useCan('delete_leads')
  const canExport = useCan('export_leads')
  const [importing, setImporting] = useState(false)
  const [exportMenu, setExportMenu] = useState(false)
  const [exportErr, setExportErr] = useState('')
  const [search, setSearch] = useState('')
  const [view, setView] = useState<'board' | 'kanban'>(() => (localStorage.getItem('foro_leads_view') as any) || 'board')
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [dragId, setDragId] = useState<string | null>(null)
  const { setOpen } = useChat()
  const { stages: STAGES, firstKey } = useLeadStages()
  const { user: me } = useAuth()
  const [editingStages, setEditingStages] = useState(false)
  const { update, move, create, remove } = useBoardMutations()

  const { data, isLoading } = useQuery({ queryKey: ['leads', 'board'], queryFn: () => leadsApi.list({ limit: 500 }), staleTime: 15_000 })

  // O quadro carrega os 500 mais recentes; com mais leads que isso, a busca consulta o servidor.
  const truncated = !!data && data.total > data.data.length
  const term = search.trim()
  const { data: found } = useQuery({
    queryKey: ['leads', 'search', term], queryFn: () => leadsApi.list({ search: term, limit: 200 }),
    enabled: truncated && term.length >= 2, staleTime: 15_000,
  })
  const filtered = useMemo(() => {
    const q = term.toLowerCase()
    const all = data?.data ?? []
    if (!q) return all
    const local = all.filter(l => [l.name, l.phone, l.email, l.document].some(v => v?.toLowerCase().includes(q)))
    if (!truncated) return local
    const seen = new Set(local.map(l => l.id))
    return [...local, ...(found?.data ?? []).filter(l => !seen.has(l.id))]
  }, [data, term, truncated, found])

  async function doExport(format: 'xlsx' | 'csv') {
    setExportMenu(false); setExportErr('')
    try { const f = await leadImportApi.export(format); saveFile(f.blob, f.filename) }
    catch (e: any) {
      let m = 'Não foi possível exportar.'
      try { const d = e?.response?.data; m = (d instanceof Blob ? JSON.parse(await d.text()) : d)?.error || m } catch { /* mantém */ }
      setExportErr(m)
    }
  }

  function setViewMode(v: 'board' | 'kanban') { setView(v); try { localStorage.setItem('foro_leads_view', v) } catch {} }
  const addLead = (stage: string) => (name: string) => create.mutate({ name, stage })
  const del = (l: Lead) => { if (confirm(`Excluir o lead "${l.name || 'sem nome'}"?`)) remove.mutate(l.id) }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">CRM Comercial</h1>
          <p className="text-sm text-slate-500">{data?.total ?? 0} no funil · clique em qualquer campo para editar</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border bg-white p-0.5">
            {([['board', LayoutList, 'Quadro'], ['kanban', Columns3, 'Kanban']] as const).map(([k, Icon, label]) => (
              <button key={k} onClick={() => setViewMode(k)}
                className={clsx('flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md', view === k ? 'bg-brand-600 text-white' : 'text-slate-600 hover:bg-slate-100')}>
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
          {me?.role === 'admin' && <button className="btn-secondary text-sm" onClick={() => setEditingStages(true)} data-testid="etapas-editar"><Settings2 className="w-4 h-4" /> Etapas</button>}
          {canCreate && <button className="btn-secondary text-sm" onClick={() => setImporting(true)} data-testid="leads-importar"><Upload className="w-4 h-4" /> Importar</button>}
          {canExport && (
            <div className="relative">
              <button className="btn-secondary text-sm" onClick={() => setExportMenu(v => !v)} aria-haspopup="menu" aria-expanded={exportMenu} data-testid="leads-exportar"><Download className="w-4 h-4" /> Exportar</button>
              {exportMenu && (
                <div role="menu" className="absolute right-0 mt-1 w-44 rounded-lg border bg-white shadow-lg z-20 py-1 text-sm">
                  <button role="menuitem" className="w-full text-left px-3 py-1.5 hover:bg-slate-50" onClick={() => doExport('xlsx')}>Excel (.xlsx)</button>
                  <button role="menuitem" className="w-full text-left px-3 py-1.5 hover:bg-slate-50" onClick={() => doExport('csv')}>CSV (Excel BR)</button>
                </div>
              )}
            </div>
          )}
          <button className="btn-secondary text-sm" onClick={() => setOpen(true)}><Sparkles className="w-4 h-4 text-accent-500" /> Pedir à IA</button>
          {canCreate && <button className="btn-primary text-sm" onClick={() => create.mutate({ name: 'Novo lead', stage: firstKey })}><Plus className="w-4 h-4" /> Novo lead</button>}
        </div>
      </div>

      {exportErr && <div role="alert" className="mb-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2">{exportErr}</div>}
      {truncated && (
        <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2" data-testid="leads-truncado">
          Mostrando os {data!.data.length} leads mais recentes de {data!.total.toLocaleString('pt-BR')}. A busca abaixo procura em todos; para ter a lista completa, use Exportar.
        </div>
      )}
      <div className="relative max-w-sm mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input className="input pl-9" placeholder="Buscar por nome, telefone, e-mail ou CPF/CNPJ…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="card p-8 text-center text-slate-400">Carregando…</div>
      ) : view === 'board' ? (
        <div className="space-y-5 overflow-x-auto">
          {STAGES.map(st => {
            const rows = filtered.filter(l => (STAGES.some(x => x.stage_key === l.stage) ? l.stage : firstKey) === st.stage_key)
            const isCollapsed = collapsed[st.stage_key]
            return (
              <section key={st.id} className="card overflow-hidden min-w-[860px]" data-testid="etapa-secao">
                <button onClick={() => setCollapsed(c => ({ ...c, [st.stage_key]: !c[st.stage_key] }))}
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-slate-50 text-left">
                  {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                  <span className="w-1 h-5 rounded-full" style={{ backgroundColor: st.color }} />
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
                        <span className="w-1 h-6 rounded-full" style={{ backgroundColor: st.color }} />
                        <EditableCell bold value={l.name} placeholder="Sem nome" onSave={v => update.mutate({ id: l.id, data: { name: v } })} />
                        <EditableCell value={l.phone} placeholder="Telefone" onSave={v => update.mutate({ id: l.id, data: { phone: v } })} />
                        <EditableCell value={l.email} placeholder="E-mail" onSave={v => update.mutate({ id: l.id, data: { email: v } })} />
                        <StagePill stage={l.stage} onChange={s => move.mutate({ id: l.id, stage: s })} />
                        <span className="text-sm text-slate-500 truncate px-1.5">{l.assigned_name || '—'}</span>
                        <span className="text-sm text-slate-500 px-1.5">{new Date(l.created_at).toLocaleDateString('pt-BR')}</span>
                        <span className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link to={`/crm-comercial/${l.id}`} title="Abrir" className="p-1 text-slate-400 hover:text-brand-600"><ExternalLink className="w-4 h-4" /></Link>
                          {canDelete && <button onClick={() => del(l)} title="Excluir" className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>}
                        </span>
                      </div>
                    ))}
                    <AddRow stage={st.stage_key} onCreate={addLead(st.stage_key)} />
                  </>
                )}
              </section>
            )
          })}
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-4">
          {STAGES.map(st => {
            const rows = filtered.filter(l => (STAGES.some(x => x.stage_key === l.stage) ? l.stage : firstKey) === st.stage_key)
            return (
              <div key={st.id} data-testid="etapa-coluna" className="w-72 shrink-0 bg-slate-100/70 rounded-xl p-2"
                onDragOver={e => e.preventDefault()}
                onDrop={() => { if (dragId) move.mutate({ id: dragId, stage: st.stage_key }); setDragId(null) }}>
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: st.color }} />
                  <span className="text-sm font-semibold text-slate-800">{st.label}</span>
                  <span className="text-xs text-slate-400">{rows.length}</span>
                </div>
                <div className="space-y-2 min-h-[40px]">
                  {rows.map(l => (
                    <Link key={l.id} to={`/crm-comercial/${l.id}`} draggable onDragStart={() => setDragId(l.id)} onDragEnd={() => setDragId(null)}
                      className={clsx('block bg-white border rounded-lg p-3 shadow-sm hover:shadow transition-shadow', dragId === l.id && 'opacity-40')}>
                      <p className="text-sm font-medium text-slate-900 truncate">{l.name || 'Sem nome'}</p>
                      <p className="text-xs text-slate-500 truncate">{l.phone || l.email || '—'}</p>
                      <p className="text-[11px] text-slate-400 mt-1.5">{l.assigned_name || 'Sem responsável'} · {new Date(l.created_at).toLocaleDateString('pt-BR')}</p>
                    </Link>
                  ))}
                </div>
                <div className="mt-2 rounded-lg overflow-hidden border bg-white"><AddRow stage={st.stage_key} onCreate={addLead(st.stage_key)} /></div>
              </div>
            )
          })}
        </div>
      )}
      {editingStages && <LeadStagesEditor onClose={() => setEditingStages(false)} />}
      {importing && <LeadImport onClose={() => setImporting(false)} />}
    </div>
  )
}
