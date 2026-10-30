import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Save, Sparkles, Download, Printer, AlertTriangle, History, ShieldCheck, Eye, Pencil } from 'lucide-react'
import clsx from 'clsx'
import { documentsApi, usersApi } from '../api'
import { MdLite } from '../lib/mdLite'
import { DOC_STATUS } from './Documents'
import { fmtDate } from '../lib/cases'

export default function DocumentEditor() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: doc, isLoading } = useQuery({ queryKey: ['document', id], queryFn: () => documentsApi.get(id!), enabled: !!id })
  const { data: me } = useQuery({ queryKey: ['me-profile'], queryFn: usersApi.me })
  const canAi = me?.permissions?.ai_drafts !== false
  const [content, setContent] = useState('')
  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<'editar' | 'ver'>('ver')
  const [instr, setInstr] = useState('')
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [showVersions, setShowVersions] = useState(false)

  useEffect(() => { if (doc) { setContent(doc.content); setTitle(doc.title) } }, [doc?.id, doc?.updated_at]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = !!doc && (content !== doc.content || title !== doc.title)
  const flags = useMemo(() => (content.match(/\[(?:PREENCHER|CONFERIR)[^\]]*\]/g) || []).length, [content])
  const slots = useMemo(() => (content.match(/\[\[IA:(?:[^[\]]|\[[^[\]]*\])*\]\]/g) || []).length, [content])

  const done = (d: unknown) => { qc.setQueryData(['document', id], d); qc.invalidateQueries({ queryKey: ['documents'] }); qc.invalidateQueries({ queryKey: ['case'] }) }
  const fail = (e: any) => setMsg({ ok: false, text: e?.response?.data?.error || 'Não foi possível concluir.' })
  const save = useMutation({ mutationFn: () => documentsApi.update(id!, { title, content }), onSuccess: d => { done(d); setMsg({ ok: true, text: 'Salvo.' }) }, onError: fail })
  const setStatus = useMutation({ mutationFn: (s: string) => documentsApi.update(id!, { status: s }), onSuccess: done, onError: fail })
  const draft = useMutation({
    mutationFn: async () => { if (dirty) await documentsApi.update(id!, { title, content }); return documentsApi.draft(id!, instr || undefined) },
    onSuccess: r => {
      done(r.document); qc.invalidateQueries({ queryKey: ['ai-credits'] })
      const parts = [`Rascunho gerado (${r.credits_used.toFixed(1)} crédito(s)).`]
      if (r.flagged_citations.length) parts.push(`${r.flagged_citations.length} citação(ões) fora da lista de referências foram marcadas [CONFERIR].`)
      if (r.unfilled_slots) parts.push(`${r.unfilled_slots} trecho(s) não vieram — gere de novo.`)
      setMsg({ ok: !r.flagged_citations.length && !r.unfilled_slots, text: parts.join(' ') }); setMode('ver')
    }, onError: fail,
  })
  const restore = useMutation({ mutationFn: (n: number) => documentsApi.restore(id!, n), onSuccess: d => { done(d); setMsg({ ok: true, text: 'Versão restaurada.' }) }, onError: fail })

  if (isLoading) return <div className="p-6 text-slate-400">Carregando…</div>
  if (!doc) return <div className="p-6 text-red-500">Documento não encontrado.</div>
  const filename = `${title.replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 60) || 'documento'}.docx`

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center gap-3 mb-4 flex-wrap print:hidden">
        <button onClick={() => navigate(-1)} className="btn-ghost p-1.5" title="Voltar"><ArrowLeft className="w-4 h-4" /></button>
        <input className="input !text-lg !font-semibold flex-1 min-w-[240px]" value={title} onChange={e => setTitle(e.target.value)} aria-label="Título do documento" maxLength={255} />
        <select aria-label="Status do documento" className={clsx('text-sm font-medium px-3 py-1.5 rounded-lg border-0 cursor-pointer', DOC_STATUS[doc.status].pill)} value={doc.status} onChange={e => setStatus.mutate(e.target.value)}>
          {Object.entries(DOC_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button className="btn-secondary text-sm" onClick={() => setMode(m => m === 'ver' ? 'editar' : 'ver')}>{mode === 'ver' ? <><Pencil className="w-4 h-4" /> Editar</> : <><Eye className="w-4 h-4" /> Visualizar</>}</button>
        <button className="btn-primary" onClick={() => save.mutate()} disabled={!dirty || save.isPending}><Save className="w-4 h-4" /> Salvar</button>
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-5">
        <div>
          {mode === 'editar'
            ? <textarea className="input font-mono !text-sm w-full min-h-[70vh]" value={content} onChange={e => setContent(e.target.value)} aria-label="Conteúdo do documento" spellCheck />
            : <div className="card p-8 min-h-[70vh] bg-white"><MdLite text={content || '*Documento em branco. Clique em Editar.*'} /></div>}
        </div>

        <aside className="space-y-4 print:hidden">
          {msg && <p className={clsx('text-sm rounded-lg p-3', msg.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700')} role="status">{msg.text}</p>}

          <section className="card p-4">
            <h2 className="font-medium text-slate-900 text-sm mb-2 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-accent-500" /> Redação com IA</h2>
            {slots > 0 ? (
              <>
                <p className="text-xs text-slate-500 mb-2">{slots} trecho(s) em roxo serão redigidos com os dados do processo e só com as referências legais liberadas para este modelo.</p>
                <textarea className="input !text-sm min-h-[70px] mb-2" placeholder="Instruções extras (opcional): ex.: destacar o dano moral…" value={instr} onChange={e => setInstr(e.target.value)} maxLength={2000} />
                {!canAi && <p className="text-xs text-amber-700 mb-2">O administrador não liberou a redação com IA para o seu usuário.</p>}
                <button className="btn-primary w-full justify-center" onClick={() => draft.mutate()} disabled={draft.isPending || !canAi}>{draft.isPending ? 'Redigindo…' : 'Gerar rascunho'}</button>
              </>
            ) : <p className="text-xs text-slate-500">Nenhum trecho pendente para a IA neste documento.</p>}
          </section>

          <section className="card p-4 text-sm">
            <h2 className="font-medium text-slate-900 mb-2">Conferência</h2>
            <p className={clsx('flex items-center gap-1.5', flags ? 'text-amber-700' : 'text-green-700')}>
              {flags ? <><AlertTriangle className="w-4 h-4" /> {flags} pendência(s): [PREENCHER] / [CONFERIR]</> : <><ShieldCheck className="w-4 h-4" /> Sem marcadores pendentes</>}
            </p>
            {doc.template && (
              <div className="mt-2 text-xs text-slate-500 space-y-1">
                <p>Modelo: <b>{doc.template.title}</b> ({doc.template.origin === 'escritório' ? 'do escritório' : doc.template.origin === 'servidor' ? 'da plataforma' : 'modelo-base Foro'})</p>
                {!doc.template.reviewed && <p className="text-amber-700">Modelo ainda não marcado como revisado. Revise antes de protocolar.</p>}
                {doc.template.source && <p>Fonte: {doc.template.source}</p>}
                {doc.template.legal_basis.length > 0 && <p>Base legal permitida à IA: {doc.template.legal_basis.join('; ')}</p>}
              </div>
            )}
            {doc.case_id && <p className="mt-2 text-xs"><Link to={`/processos/${doc.case_id}`} className="text-brand-700 hover:underline">Abrir processo</Link></p>}
          </section>

          <section className="card p-4">
            <h2 className="font-medium text-slate-900 text-sm mb-2">Exportar</h2>
            <div className="flex gap-2">
              <button className="btn-secondary text-sm flex-1 justify-center" disabled={dirty} title={dirty ? 'Salve antes de exportar' : ''} onClick={() => documentsApi.exportDocx(doc.id, filename)}><Download className="w-4 h-4" /> Word</button>
              <button className="btn-secondary text-sm flex-1 justify-center" onClick={() => { setMode('ver'); setTimeout(() => window.print(), 50) }}><Printer className="w-4 h-4" /> PDF</button>
            </div>
            {dirty && <p className="text-xs text-amber-700 mt-1">Há alterações não salvas.</p>}
          </section>

          <section className="card p-4">
            <button className="font-medium text-slate-900 text-sm flex items-center gap-1.5 w-full" onClick={() => setShowVersions(v => !v)}><History className="w-4 h-4 text-slate-400" /> Versões ({doc.versions.length})</button>
            {showVersions && (
              <ul className="mt-2 divide-y text-xs">
                {doc.versions.map(v => (
                  <li key={v.version_no} className="py-1.5 flex items-center gap-2">
                    <span className="flex-1 min-w-0"><b>v{v.version_no}</b> · {fmtDate(v.created_at)}<span className="block text-slate-400 truncate">{v.note}</span></span>
                    <button className="text-brand-700 hover:underline" onClick={() => confirm(`Restaurar a v${v.version_no}? O texto atual vira uma nova versão.`) && restore.mutate(v.version_no)}>Restaurar</button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
