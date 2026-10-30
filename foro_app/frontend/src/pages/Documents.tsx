import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Sparkles, AlertTriangle, Trash2, Wand2, Briefcase } from 'lucide-react'
import clsx from 'clsx'
import { documentsApi, areasApi, usersApi, type DocumentSummary } from '../api'
import { fmtDate } from '../lib/cases'

export const DOC_STATUS: Record<string, { label: string; pill: string }> = {
  rascunho: { label: 'Rascunho', pill: 'bg-slate-100 text-slate-600' },
  revisado: { label: 'Revisado', pill: 'bg-sky-100 text-sky-700' },
  final: { label: 'Final', pill: 'bg-green-100 text-green-700' },
}

export default function Documents() {
  const qc = useQueryClient()
  const { data: me } = useQuery({ queryKey: ['me-profile'], queryFn: usersApi.me })
  const canDelete = me?.permissions?.delete_records !== false
  const [area, setArea] = useState('')
  const [search, setSearch] = useState('')
  const { data: areas = [] } = useQuery({ queryKey: ['areas'], queryFn: areasApi.list, staleTime: 5 * 60_000 })
  const { data: docs = [], isLoading } = useQuery({ queryKey: ['documents', area, search], queryFn: () => documentsApi.list({ area_key: area || undefined, search: search || undefined }) })
  const remove = useMutation({ mutationFn: (id: string) => documentsApi.remove(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }) })
  const areaLabel = (k: string) => areas.find(a => a.key === k)?.short || k

  // agrupa por processo (ordem: a do servidor, por última edição); sem processo vai por último
  const groups: { key: string; caseId: string | null; label: string; docs: DocumentSummary[] }[] = []
  for (const d of docs) {
    const key = d.case_id || '_none'
    let g = groups.find(x => x.key === key)
    if (!g) { g = { key, caseId: d.case_id || null, label: d.case_id ? (d.case_number || d.case_title || 'Processo sem título') : 'Sem processo vinculado', docs: [] }; groups.push(g) }
    g.docs.push(d)
  }
  groups.sort((a, b) => (a.caseId ? 0 : 1) - (b.caseId ? 0 : 1))

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Documentos</h1>
          <p className="text-sm text-slate-500">Os documentos do escritório, organizados por processo.</p>
        </div>
        <Link to="/gerador-documentos" className="btn-primary"><Wand2 className="w-4 h-4" /> Gerar documento</Link>
      </div>

      <div className="flex gap-2 mb-3 flex-wrap">
        <input className="input max-w-xs" placeholder="Buscar por título" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="input !w-48" aria-label="Filtrar por área" value={area} onChange={e => setArea(e.target.value)}>
          <option value="">Todas as áreas</option>{areas.map(a => <option key={a.key} value={a.key}>{a.short}</option>)}
        </select>
      </div>

      {isLoading ? <div className="card p-8 text-center text-slate-400">Carregando…</div> : docs.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-slate-600 mb-1">Nenhum documento ainda.</p>
          <p className="text-sm text-slate-400">Use o <Link to="/gerador-documentos" className="underline">Gerador de documentos</Link>, escolha um modelo e vincule o processo.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map(g => (
            <section key={g.key} className="card overflow-hidden" data-testid="doc-group">
              <header className="flex items-center gap-2 px-4 py-2 bg-slate-50 border-b text-sm">
                <Briefcase className="w-4 h-4 text-slate-400" />
                {g.caseId ? <Link to={`/processos/${g.caseId}`} className="font-medium text-slate-800 hover:underline">{g.label}</Link> : <span className="font-medium text-slate-600">{g.label}</span>}
                <span className="text-xs text-slate-400">{g.docs.length} documento(s)</span>
              </header>
              <ul className="divide-y">
                {g.docs.map(d => (
                  <li key={d.id} className="group flex items-center gap-3 px-4 py-2.5">
                    <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <Link to={`/documentos/${d.id}`} className="text-sm font-medium text-slate-900 hover:underline truncate block">{d.title}</Link>
                      <p className="text-xs text-slate-500 truncate">{areaLabel(d.area_key)}</p>
                    </div>
                    {d.ai_generated ? <span title="Rascunho com IA"><Sparkles className="w-3.5 h-3.5 text-accent-500" /></span> : null}
                    {d.open_flags > 0 && <span className="badge bg-amber-100 text-amber-700 !py-0 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{d.open_flags}</span>}
                    <span className={clsx('badge !py-0', DOC_STATUS[d.status].pill)}>{DOC_STATUS[d.status].label}</span>
                    <span className="text-xs text-slate-400 w-20 text-right">{fmtDate(d.updated_at)}</span>
                    {canDelete && <button onClick={() => confirm(`Excluir "${d.title}"?`) && remove.mutate(d.id)} title="Excluir" className="text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
