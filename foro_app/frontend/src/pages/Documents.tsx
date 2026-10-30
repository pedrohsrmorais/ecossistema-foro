import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Plus, Sparkles, AlertTriangle, Trash2, ShieldCheck, Library } from 'lucide-react'
import clsx from 'clsx'
import { documentsApi, areasApi, casesApi, usersApi, type DocumentTemplate } from '../api'
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
  const navigate = useNavigate()
  const [area, setArea] = useState('')
  const [search, setSearch] = useState('')
  const [picking, setPicking] = useState(false)
  const [pickArea, setPickArea] = useState('')
  const [caseId, setCaseId] = useState('')
  const [error, setError] = useState('')
  const { data: areas = [] } = useQuery({ queryKey: ['areas'], queryFn: areasApi.list, staleTime: 5 * 60_000 })
  const { data: docs = [], isLoading } = useQuery({ queryKey: ['documents', area, search], queryFn: () => documentsApi.list({ area_key: area || undefined, search: search || undefined }) })
  const { data: templates = [] } = useQuery({ queryKey: ['doc-templates', pickArea], queryFn: () => documentsApi.templates(pickArea || undefined), enabled: picking })
  const { data: cases } = useQuery({ queryKey: ['cases', 'all'], queryFn: () => casesApi.list(), enabled: picking, staleTime: 15_000 })

  const create = useMutation({
    mutationFn: (t: DocumentTemplate | null) => documentsApi.create({ ...(t ? { template_key: t.key } : { title: 'Documento sem título', area_key: pickArea || 'geral' }), case_id: caseId || undefined }),
    onSuccess: d => { qc.invalidateQueries({ queryKey: ['documents'] }); navigate(`/documentos/${d.id}`) },
    onError: (e: any) => setError(e?.response?.data?.error || 'Não foi possível criar o documento.'),
  })
  const remove = useMutation({ mutationFn: (id: string) => documentsApi.remove(id), onSuccess: () => qc.invalidateQueries({ queryKey: ['documents'] }) })
  const areaLabel = (k: string) => areas.find(a => a.key === k)?.short || k

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Documentos</h1>
          <p className="text-sm text-slate-500">Peças e documentos a partir de modelos prontos. A IA só redige os trechos marcados e nunca cita lei fora da lista de referências.</p>
        </div>
        <div className="flex gap-2">
          <Link to="/documentos/modelos" className="btn-secondary"><Library className="w-4 h-4" /> Modelos do escritório</Link>
          <button className="btn-primary" onClick={() => setPicking(p => !p)}><Plus className="w-4 h-4" /> Novo documento</button>
        </div>
      </div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      {picking && (
        <section className="card p-5 mb-5">
          <div className="flex gap-2 flex-wrap mb-3">
            <select className="input !w-52" aria-label="Área dos modelos" value={pickArea} onChange={e => setPickArea(e.target.value)}>
              <option value="">Todas as áreas</option>{areas.map(a => <option key={a.key} value={a.key}>{a.short}</option>)}
            </select>
            <select className="input flex-1 min-w-[220px]" aria-label="Processo vinculado" value={caseId} onChange={e => setCaseId(e.target.value)}>
              <option value="">Sem processo vinculado</option>
              {cases?.data.map(c => <option key={c.id} value={c.id}>{c.case_number || c.title || 'Sem título'}{c.title && c.case_number ? ` — ${c.title}` : ''}</option>)}
            </select>
          </div>
          <p className="text-xs text-slate-500 mb-3">Vincule um processo para o sistema preencher partes, vara, comarca, valor e dados da área automaticamente.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {templates.map(t => (
              <button key={t.key} onClick={() => create.mutate(t)} disabled={create.isPending}
                className="text-left border rounded-lg p-3 hover:border-brand-400 hover:bg-brand-50/30 transition-colors">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-brand-600 shrink-0" />
                  <span className="font-medium text-slate-900 text-sm flex-1">{t.title}</span>
                  <span className="badge bg-slate-100 text-slate-600 !py-0">{areaLabel(t.area)}</span>
                </div>
                {t.description && <p className="text-xs text-slate-500 mt-1">{t.description}</p>}
                <p className="text-[11px] mt-1.5 flex items-center gap-1.5 text-slate-400">
                  {t.reviewed ? <span className="text-green-700 flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> revisado</span> : <span className="text-amber-700">não revisado · confira antes de usar</span>}
                  <span className={t.origin === 'escritório' ? 'text-brand-700 font-medium' : ''}>· {t.origin === 'escritório' ? 'do seu escritório' : t.origin === 'servidor' ? 'da plataforma' : 'modelo-base Foro'}</span>
                  {t.ai_slots > 0 && <span className="flex items-center gap-0.5"><Sparkles className="w-3 h-3" /> {t.ai_slots} trecho(s) IA</span>}
                </p>
              </button>
            ))}
          </div>
          <button className="mt-3 text-xs text-slate-500 hover:underline" onClick={() => create.mutate(null)}>ou começar com um documento em branco</button>
        </section>
      )}

      <div className="flex gap-2 mb-3 flex-wrap">
        <input className="input max-w-xs" placeholder="Buscar por título" value={search} onChange={e => setSearch(e.target.value)} />
        <select className="input !w-48" aria-label="Filtrar por área" value={area} onChange={e => setArea(e.target.value)}>
          <option value="">Todas as áreas</option>{areas.map(a => <option key={a.key} value={a.key}>{a.short}</option>)}
        </select>
      </div>

      {isLoading ? <div className="card p-8 text-center text-slate-400">Carregando…</div> : docs.length === 0 ? (
        <div className="card p-10 text-center">
          <p className="text-slate-600 mb-1">Nenhum documento ainda.</p>
          <p className="text-sm text-slate-400">Clique em “Novo documento”, escolha um modelo e vincule o processo.</p>
        </div>
      ) : (
        <ul className="card divide-y">
          {docs.map(d => (
            <li key={d.id} className="group flex items-center gap-3 px-4 py-2.5">
              <FileText className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <Link to={`/documentos/${d.id}`} className="text-sm font-medium text-slate-900 hover:underline truncate block">{d.title}</Link>
                <p className="text-xs text-slate-500 truncate">{areaLabel(d.area_key)}{d.case_id ? <> · <Link to={`/processos/${d.case_id}`} className="hover:underline">{d.case_number || d.case_title}</Link></> : ''}</p>
              </div>
              {d.ai_generated ? <span title="Rascunho com IA"><Sparkles className="w-3.5 h-3.5 text-accent-500" /></span> : null}
              {d.open_flags > 0 && <span className="badge bg-amber-100 text-amber-700 !py-0 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{d.open_flags}</span>}
              <span className={clsx('badge !py-0', DOC_STATUS[d.status].pill)}>{DOC_STATUS[d.status].label}</span>
              <span className="text-xs text-slate-400 w-20 text-right">{fmtDate(d.updated_at)}</span>
              {canDelete && <button onClick={() => confirm(`Excluir "${d.title}"?`) && remove.mutate(d.id)} title="Excluir" className="text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
