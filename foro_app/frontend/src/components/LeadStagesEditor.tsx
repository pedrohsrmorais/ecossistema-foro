import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, ArrowUp, ArrowDown, Trash2, Plus, RotateCcw } from 'lucide-react'
import { leadStagesApi, type LeadStage, type LeadStageKind } from '../api'
import { KIND_LABEL } from '../lib/stages'

const PALETTE = ['#64748b', '#0ea5e9', '#06b6d4', '#6366f1', '#a855f7', '#ec4899', '#ef4444', '#f59e0b', '#22c55e', '#14b8a6']
const KINDS: LeadStageKind[] = ['open', 'proposal', 'won', 'closed']

/** Editor das etapas do funil do CRM (só administrador): criar, renomear, recolorir, reordenar, definir o tipo e apagar. */
export default function LeadStagesEditor({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [err, setErr] = useState('')
  const [label, setLabel] = useState('')
  const [deleting, setDeleting] = useState<{ stage: LeadStage; dest: string } | null>(null)
  const { data: stages = [] } = useQuery({ queryKey: ['lead-stages'], queryFn: leadStagesApi.list })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['lead-stages'] }); qc.invalidateQueries({ queryKey: ['leads'] }); qc.invalidateQueries({ queryKey: ['dashboard'] }); qc.invalidateQueries({ queryKey: ['funnel'] }) }
  const fail = (e: any) => setErr(e?.response?.data?.error || 'Não foi possível salvar.')
  const ok = () => { setErr(''); refresh() }
  const upd = useMutation({ mutationFn: ({ id, d }: { id: string; d: Parameters<typeof leadStagesApi.update>[1] }) => leadStagesApi.update(id, d), onSuccess: ok, onError: fail })
  const add = useMutation({ mutationFn: () => leadStagesApi.create({ label: label.trim() }), onSuccess: () => { setLabel(''); ok() }, onError: fail })
  const reorder = useMutation({ mutationFn: (ids: string[]) => leadStagesApi.reorder(ids), onSuccess: ok, onError: fail })
  const del = useMutation({ mutationFn: ({ id, dest }: { id: string; dest?: string }) => leadStagesApi.remove(id, dest), onSuccess: () => { setDeleting(null); ok() }, onError: fail })
  const reset = useMutation({ mutationFn: () => leadStagesApi.reset(), onSuccess: ok, onError: fail })
  const move = (i: number, dir: -1 | 1) => {
    const ids = stages.map(s => s.id); const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]; reorder.mutate(ids)
  }
  function askDelete(s: LeadStage) {
    if (stages.length <= 1) { setErr('O funil precisa ter pelo menos uma etapa.'); return }
    if (s.leads_count) setDeleting({ stage: s, dest: stages.find(x => x.id !== s.id)!.id })
    else if (confirm(`Excluir a etapa "${s.label}"?`)) del.mutate({ id: s.id })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-label="Editar etapas do funil" data-testid="etapas-editor">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="font-semibold text-slate-900">Etapas do funil — CRM Comercial</h2>
          <button onClick={onClose} className="btn-ghost p-1" aria-label="Fechar"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-xs text-slate-500">Crie, renomeie, reordene e mude a cor das etapas do seu escritório. O <strong>tipo</strong> diz ao Painel como contar cada etapa (convertidos, honorários previstos, leads parados).</p>
          {err && <p className="text-sm text-red-600" role="alert" data-testid="etapas-erro">{err}</p>}
          <ul className="space-y-2.5">
            {stages.map((s, i) => (
              <li key={s.id} className="rounded-lg border p-2.5 space-y-2" data-testid="etapa-item">
                <div className="flex items-center gap-2">
                  <div className="flex flex-col">
                    <button className="text-slate-400 hover:text-slate-700 disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Subir ${s.label}`}><ArrowUp className="w-3.5 h-3.5" /></button>
                    <button className="text-slate-400 hover:text-slate-700 disabled:opacity-30" disabled={i === stages.length - 1} onClick={() => move(i, 1)} aria-label={`Descer ${s.label}`}><ArrowDown className="w-3.5 h-3.5" /></button>
                  </div>
                  <select aria-label="Cor" className="w-8 h-8 rounded border-0 cursor-pointer text-transparent shrink-0" style={{ backgroundColor: s.color }} value={s.color}
                    onChange={e => upd.mutate({ id: s.id, d: { color: e.target.value } })}>
                    {[...new Set([s.color, ...PALETTE])].map(c => <option key={c} value={c} style={{ backgroundColor: c }}>{c}</option>)}
                  </select>
                  <input className="input !py-1 flex-1 min-w-0" defaultValue={s.label} aria-label="Nome da etapa" maxLength={60} key={s.label}
                    onBlur={e => { const v = e.target.value.trim(); if (v && v !== s.label) upd.mutate({ id: s.id, d: { label: v } }); else e.target.value = s.label }}
                    onKeyDown={e => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
                  <span className="text-xs text-slate-400 w-14 text-right shrink-0">{s.leads_count ?? 0} {s.leads_count === 1 ? 'lead' : 'leads'}</span>
                  <button title="Excluir etapa" aria-label={`Excluir ${s.label}`} className="p-1 text-slate-300 hover:text-red-600" onClick={() => askDelete(s)}><Trash2 className="w-4 h-4" /></button>
                </div>
                <select aria-label="Tipo da etapa" className="input !py-1 text-xs" value={s.kind} onChange={e => upd.mutate({ id: s.id, d: { kind: e.target.value as LeadStageKind } })}>
                  {KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
                {deleting?.stage.id === s.id && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-900 space-y-2" data-testid="etapa-mover">
                    <p>Há {s.leads_count} lead(s) em “{s.label}”. Para onde movê-los?</p>
                    <div className="flex gap-2">
                      <select aria-label="Mover leads para" className="input !py-1 text-xs flex-1" value={deleting.dest} onChange={e => setDeleting({ stage: s, dest: e.target.value })}>
                        {stages.filter(x => x.id !== s.id).map(x => <option key={x.id} value={x.id}>{x.label}</option>)}
                      </select>
                      <button className="btn-primary !py-1 text-xs" onClick={() => del.mutate({ id: s.id, dest: deleting.dest })} data-testid="etapa-confirmar-exclusao">Mover e excluir</button>
                      <button className="btn-secondary !py-1 text-xs" onClick={() => setDeleting(null)}>Cancelar</button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <form className="flex gap-2 pt-2 border-t" onSubmit={e => { e.preventDefault(); if (label.trim()) add.mutate() }}>
            <input className="input" placeholder="Nova etapa (ex.: Em análise)" aria-label="Nova etapa" value={label} onChange={e => setLabel(e.target.value)} maxLength={60} />
            <button className="btn-primary shrink-0" disabled={!label.trim() || add.isPending} data-testid="etapa-criar"><Plus className="w-4 h-4" /> Criar</button>
          </form>
          <button className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1" onClick={() => confirm('Restaurar as 5 etapas padrão (Novo, Em contato, Proposta, Convertido, Encerrado)?') && reset.mutate()}><RotateCcw className="w-3 h-3" /> Restaurar padrão</button>
        </div>
      </div>
    </div>
  )
}
