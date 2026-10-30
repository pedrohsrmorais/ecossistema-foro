import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Settings2, X, ArrowUp, ArrowDown, Trash2, Plus, RotateCcw, Flag } from 'lucide-react'
import clsx from 'clsx'
import { areasApi, stagesApi, casePeopleApi, casesApi, type Case, type CaseStage } from '../api'
import { fmtDate } from '../lib/cases'

const PALETTE = ['#64748b', '#0ea5e9', '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b', '#10b981', '#14b8a6']

function StagesEditor({ areaKey, areaLabel, onClose }: { areaKey: string; areaLabel: string; onClose: () => void }) {
  const qc = useQueryClient()
  const [err, setErr] = useState('')
  const [label, setLabel] = useState('')
  const { data: stages = [] } = useQuery({ queryKey: ['stages', areaKey], queryFn: () => stagesApi.list(areaKey) })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['stages'] }); qc.invalidateQueries({ queryKey: ['cases'] }) }
  const fail = (e: any) => setErr(e?.response?.data?.error || 'Não foi possível salvar.')
  const upd = useMutation({ mutationFn: ({ id, d }: { id: string; d: Parameters<typeof stagesApi.update>[1] }) => stagesApi.update(id, d), onSuccess: () => { setErr(''); refresh() }, onError: fail })
  const add = useMutation({ mutationFn: () => stagesApi.create({ area_key: areaKey, label: label.trim() }), onSuccess: () => { setLabel(''); setErr(''); refresh() }, onError: fail })
  const reorder = useMutation({ mutationFn: (ids: string[]) => stagesApi.reorder(areaKey, ids), onSuccess: refresh, onError: fail })
  const del = useMutation({
    mutationFn: (s: CaseStage) => {
      const dest = stages.find(x => x.id !== s.id)
      return stagesApi.remove(s.id, s.cases_count ? dest?.id : undefined)
    }, onSuccess: () => { setErr(''); refresh() }, onError: fail,
  })
  const reset = useMutation({ mutationFn: () => stagesApi.reset(areaKey), onSuccess: () => { setErr(''); refresh() }, onError: fail })
  const move = (i: number, dir: -1 | 1) => {
    const ids = stages.map(s => s.id); const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]; reorder.mutate(ids)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-label="Editar etapas">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="font-semibold text-slate-900">Etapas — {areaLabel}</h2>
          <button onClick={onClose} className="btn-ghost p-1" aria-label="Fechar"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-500">Renomeie, reordene, mude a cor ou crie etapas. Marque como <Flag className="w-3 h-3 inline" /> final a etapa que encerra o processo.</p>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <ul className="space-y-2">
            {stages.map((s, i) => (
              <li key={s.id} className="flex items-center gap-2">
                <div className="flex flex-col">
                  <button className="text-slate-400 hover:text-slate-700 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir"><ArrowUp className="w-3.5 h-3.5" /></button>
                  <button className="text-slate-400 hover:text-slate-700 disabled:opacity-30" disabled={i === stages.length - 1} onClick={() => move(i, 1)} aria-label="Descer"><ArrowDown className="w-3.5 h-3.5" /></button>
                </div>
                <select aria-label="Cor" className="w-8 h-8 rounded border-0 cursor-pointer text-transparent" style={{ backgroundColor: s.color }} value={s.color}
                  onChange={e => upd.mutate({ id: s.id, d: { color: e.target.value } })}>
                  {[...new Set([s.color, ...PALETTE])].map(c => <option key={c} value={c} style={{ backgroundColor: c }}>{c}</option>)}
                </select>
                <input className="input !py-1 flex-1" defaultValue={s.label} aria-label="Nome da etapa" maxLength={60}
                  onBlur={e => { const v = e.target.value.trim(); if (v && v !== s.label) upd.mutate({ id: s.id, d: { label: v } }); else e.target.value = s.label }} />
                <button title="Etapa final (encerra o processo)" aria-pressed={!!s.is_final} onClick={() => upd.mutate({ id: s.id, d: { is_final: !s.is_final } })}
                  className={clsx('p-1.5 rounded', s.is_final ? 'bg-brand-100 text-brand-700' : 'text-slate-300 hover:text-slate-600')}><Flag className="w-4 h-4" /></button>
                <span className="text-xs text-slate-400 w-6 text-right">{s.cases_count ?? 0}</span>
                <button title="Excluir etapa" className="p-1 text-slate-300 hover:text-red-600" onClick={() => confirm(s.cases_count ? `Excluir "${s.label}"? Os ${s.cases_count} processo(s) vão para "${stages.find(x => x.id !== s.id)?.label}".` : `Excluir "${s.label}"?`) && del.mutate(s)}><Trash2 className="w-4 h-4" /></button>
              </li>
            ))}
          </ul>
          <form className="flex gap-2 pt-2 border-t" onSubmit={e => { e.preventDefault(); if (label.trim()) add.mutate() }}>
            <input className="input" placeholder="Nova etapa" value={label} onChange={e => setLabel(e.target.value)} maxLength={60} />
            <button className="btn-primary shrink-0" disabled={!label.trim() || add.isPending}><Plus className="w-4 h-4" /> Criar</button>
          </form>
          <button className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1" onClick={() => confirm('Restaurar as etapas padrão desta área? Processos serão realocados.') && reset.mutate()}><RotateCcw className="w-3 h-3" /> Restaurar padrão</button>
        </div>
      </div>
    </div>
  )
}

export default function CaseBoard({ search, isAdmin }: { search: string; isAdmin: boolean }) {
  const qc = useQueryClient()
  const [areaKey, setAreaKey] = useState('civel')
  const [editing, setEditing] = useState(false)
  const [overStage, setOverStage] = useState<string | null>(null)
  const [error, setError] = useState('')
  const { data: areas = [] } = useQuery({ queryKey: ['areas'], queryFn: areasApi.list, staleTime: 5 * 60_000 })
  const { data: stages = [] } = useQuery({ queryKey: ['stages', areaKey], queryFn: () => stagesApi.list(areaKey) })
  const { data: cases } = useQuery({ queryKey: ['cases', 'board', areaKey], queryFn: () => casesApi.list({ area_key: areaKey }) })
  const area = areas.find(a => a.key === areaKey)
  const move = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: string }) => casePeopleApi.moveStage(id, stage),
    onSuccess: () => { setError(''); qc.invalidateQueries({ queryKey: ['cases'] }); qc.invalidateQueries({ queryKey: ['stages'] }) },
    onError: (e: any) => setError(e?.response?.data?.error || 'Não foi possível mover.'),
  })
  const q = search.trim().toLowerCase()
  const list = (cases?.data ?? []).filter(c => !q || [c.case_number, c.title, c.lead_name, c.opposing_party].some(v => v?.toLowerCase().includes(q)))

  return (
    <div>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="flex gap-1 flex-wrap" role="tablist" aria-label="Área">
          {areas.map(a => (
            <button key={a.key} role="tab" aria-selected={a.key === areaKey} onClick={() => setAreaKey(a.key)}
              className={clsx('px-3 py-1.5 rounded-lg text-sm', a.key === areaKey ? 'bg-brand-600 text-white' : 'bg-white border text-slate-600 hover:bg-slate-50')}>{a.short}</button>
          ))}
        </div>
        {isAdmin && <button className="btn-secondary text-sm ml-auto" onClick={() => setEditing(true)}><Settings2 className="w-4 h-4" /> Editar etapas</button>}
      </div>
      {area && <p className="text-xs text-slate-500 mb-3">{area.description}</p>}
      {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
      <div className="flex gap-3 overflow-x-auto pb-3">
        {stages.map(st => {
          const col = list.filter((c: Case) => c.stage_id === st.id)
          return (
            <div key={st.id} data-stage={st.label}
              onDragOver={e => { e.preventDefault(); setOverStage(st.id) }} onDragLeave={() => setOverStage(null)}
              onDrop={e => { e.preventDefault(); setOverStage(null); const id = e.dataTransfer.getData('text/case'); if (id) move.mutate({ id, stage: st.id }) }}
              className={clsx('w-64 shrink-0 rounded-xl bg-slate-100/70 p-2 border-2', overStage === st.id ? 'border-brand-400' : 'border-transparent')}>
              <div className="flex items-center gap-2 px-1 py-1.5">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: st.color }} />
                <span className="text-sm font-semibold text-slate-800 flex-1 truncate">{st.label}</span>
                {st.is_final ? <Flag className="w-3 h-3 text-slate-400" /> : null}
                <span className="text-xs text-slate-400">{col.length}</span>
              </div>
              <div className="space-y-2 min-h-[40px]">
                {col.map(c => (
                  <Link key={c.id} to={`/processos/${c.id}`} draggable onDragStart={e => e.dataTransfer.setData('text/case', c.id)}
                    className="block bg-white rounded-lg border p-2.5 hover:shadow-sm cursor-grab active:cursor-grabbing">
                    <p className="text-sm font-medium text-slate-900 truncate">{c.title || c.case_number || 'Sem título'}</p>
                    {c.case_number && c.title && <p className="text-[11px] font-mono text-slate-400 truncate">{c.case_number}</p>}
                    <p className="text-xs text-slate-500 truncate mt-1">{c.lead_name || 'Sem cliente'}</p>
                    <div className="flex items-center justify-between mt-1.5 text-[11px]">
                      <span className="text-slate-400 truncate">{c.responsible_name || '—'}</span>
                      {c.next_deadline && <span className="text-amber-700 font-medium">{fmtDate(c.next_deadline)}</span>}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )
        })}
      </div>
      {editing && area && <StagesEditor areaKey={areaKey} areaLabel={area.label} onClose={() => setEditing(false)} />}
    </div>
  )
}
