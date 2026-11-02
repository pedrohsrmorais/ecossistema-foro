import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Sparkles, ShieldCheck, X } from 'lucide-react'
import { documentsApi, areasApi, casesApi, type DocumentTemplate } from '../api'

export default function NovoDocumento({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [pickArea, setPickArea] = useState('')
  const [caseId, setCaseId] = useState('')
  const [error, setError] = useState('')
  const { data: areas = [] } = useQuery({ queryKey: ['areas'], queryFn: areasApi.list, staleTime: 5 * 60_000 })
  const { data: templates = [] } = useQuery({ queryKey: ['doc-templates', pickArea], queryFn: () => documentsApi.templates(pickArea || undefined) })
  const { data: cases } = useQuery({ queryKey: ['cases', 'all'], queryFn: () => casesApi.list(), staleTime: 15_000 })
  const create = useMutation({
    mutationFn: (t: DocumentTemplate | null) => documentsApi.create({ ...(t ? { template_key: t.key } : { title: 'Documento sem título', area_key: pickArea || 'geral' }), case_id: caseId || undefined }),
    onSuccess: d => { qc.invalidateQueries({ queryKey: ['documents'] }); navigate(`/documentos/${d.id}`) },
    onError: (e: any) => setError(e?.response?.data?.error || 'Não foi possível criar o documento.'),
  })
  const areaLabel = (k: string) => areas.find(a => a.key === k)?.short || k

  return (
    <div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}
      <section className="card p-5 mb-5" data-testid="novo-documento">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="font-medium text-slate-900 flex-1">Novo documento</h2>
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label="Fechar"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-slate-500 mb-3">Escolha um modelo (da plataforma ou do seu escritório), vincule o processo e a IA redige só os trechos marcados, sem citar lei fora da lista de referências.</p>

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
    </div>
  )
}
