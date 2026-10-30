import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Gavel, Search, FileText, Save, Download, Trash2, X, CheckCircle2, Loader2 } from 'lucide-react'
import { processSearchApi, savedProcessesApi, ProcessSearchResult, SavedProcess } from '../../api'

const errMsg = (e: any, fallback: string) => e?.response?.data?.error || fallback

function fmtDate(d?: string | null) {
  if (!d) return '—'
  const dt = new Date(d.length <= 10 ? d + 'T12:00:00' : d)
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('pt-BR')
}
function fmtSize(n: number) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB' }

/** Painel com o PDF (blob autenticado → iframe). */
function PdfModal({ title, load, onClose, actions }: { title: string; load: () => Promise<Blob>; onClose: () => void; actions?: React.ReactNode }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let revoked: string | null = null
    load().then(b => { revoked = URL.createObjectURL(b); setUrl(revoked) }).catch(e => setError(errMsg(e, 'Não foi possível abrir o documento.')))
    return () => { if (revoked) URL.revokeObjectURL(revoked) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
          <FileText className="w-4 h-4 text-accent-500" />
          <p className="text-sm font-medium text-slate-900 flex-1 truncate">{title}</p>
          {actions}
          <button onClick={onClose} className="btn-ghost p-1.5" aria-label="Fechar"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 bg-slate-100 rounded-b-xl overflow-hidden">
          {error ? <p className="p-6 text-sm text-red-600">{error}</p>
            : url ? <iframe title="Documento do processo" src={url} className="w-full h-full" />
            : <p className="p-6 text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando documento…</p>}
        </div>
      </div>
    </div>
  )
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

export default function ConsultaProcessual() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'pesquisar' | 'salvos'>('pesquisar')
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<ProcessSearchResult[] | null>(null)
  const [provider, setProvider] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [savedRefs, setSavedRefs] = useState<Record<string, SavedProcess>>({})
  const [viewing, setViewing] = useState<{ title: string; load: () => Promise<Blob>; ref?: ProcessSearchResult; saved?: SavedProcess } | null>(null)
  const [filter, setFilter] = useState('')

  const search = useMutation({
    mutationFn: () => processSearchApi.search(term.trim()),
    onSuccess: d => { setResults(d.results); setProvider(d.provider); setError(null); setNotice(null) },
    onError: e => { setError(errMsg(e, 'Erro ao pesquisar.')); setResults(null) },
  })

  const save = useMutation({
    mutationFn: (r: ProcessSearchResult) => processSearchApi.save(r.ref).then(s => ({ r, s })),
    onSuccess: ({ r, s }) => {
      setSavedRefs(m => ({ ...m, [r.ref]: s }))
      setError(null)
      setNotice(s.already_saved ? `O processo ${s.numero_cnj} já estava salvo.` : `Processo ${s.numero_cnj} salvo no armazenamento.`)
      qc.invalidateQueries({ queryKey: ['saved-processes'] })
    },
    onError: e => { setError(errMsg(e, 'Não foi possível salvar o processo.')); setNotice(null) },
  })

  const saved = useQuery({ queryKey: ['saved-processes', filter], queryFn: () => savedProcessesApi.list({ q: filter || undefined, limit: 50 }), enabled: tab === 'salvos' })
  const remove = useMutation({
    mutationFn: (id: string) => savedProcessesApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-processes'] }),
    onError: e => setError(errMsg(e, 'Não foi possível remover.')),
  })

  const SaveBtn = ({ r }: { r: ProcessSearchResult }) => {
    const done = savedRefs[r.ref]
    const busy = save.isPending && save.variables?.ref === r.ref
    return done
      ? <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600"><CheckCircle2 className="w-4 h-4" /> Salvo</span>
      : <button className="btn-primary" disabled={busy} onClick={() => save.mutate(r)}><Save className="w-4 h-4" />{busy ? 'Salvando…' : 'Salvar processo'}</button>
  }

  return (
    <div className="p-6 max-w-3xl animate-fade-in">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2"><Gavel className="w-5 h-5 text-accent-500" /> Consulta processual</h1>
        <p className="text-sm text-slate-500 mt-1">Pesquise um processo, confira o documento e salve no armazenamento do escritório.</p>
      </div>

      <div className="flex gap-1 mb-5 border-b border-slate-200">
        {([['pesquisar', 'Pesquisar'], ['salvos', 'Salvos']] as const).map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 ${tab === k ? 'border-accent-500 text-accent-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>{l}</button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600 mb-4" role="alert">{error}</p>}
      {notice && <p className="text-sm text-emerald-700 mb-4" role="status">{notice}</p>}

      {tab === 'pesquisar' && (
        <>
          <form onSubmit={e => { e.preventDefault(); search.mutate() }} className="card p-5 flex items-end gap-3 mb-5">
            <div className="flex-1">
              <label className="text-xs font-medium text-slate-600 mb-1 block">Número do processo, nome da parte ou CPF/CNPJ</label>
              <input className="input" placeholder="Ex.: 0001234-56.2023.8.26.0100" value={term} onChange={e => setTerm(e.target.value)} maxLength={120} />
            </div>
            <button type="submit" className="btn-primary" disabled={search.isPending || term.trim().length < 3}>
              <Search className="w-4 h-4" />{search.isPending ? 'Buscando…' : 'Pesquisar'}
            </button>
          </form>

          {results && (
            <div className="space-y-3">
              {provider === 'mock' && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Ambiente de teste: os processos e o PDF são fictícios.</p>}
              {results.map(r => (
                <div key={r.ref} className="card p-4" data-testid="resultado">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 text-sm">{r.numero_cnj}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{r.tribunal} · {r.classe} · {r.assunto}</p>
                      <p className="text-xs text-slate-600 mt-2">{r.partes.map(p => `${p.papel}: ${p.nome}`).join(' × ')}</p>
                      <p className="text-sm text-slate-700 mt-2">{r.ultima_movimentacao} <span className="text-xs text-slate-400">({fmtDate(r.data_ultima_movimentacao)})</span></p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    <button className="btn-secondary" onClick={() => setViewing({ title: r.numero_cnj, load: () => processSearchApi.preview(r.ref), ref: r })}><FileText className="w-4 h-4" /> Ver documento</button>
                    <SaveBtn r={r} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'salvos' && (
        <>
          <input className="input mb-4" placeholder="Filtrar por número, tribunal, classe ou parte" value={filter} onChange={e => setFilter(e.target.value)} />
          {saved.isLoading && <p className="text-sm text-slate-500">Carregando…</p>}
          {saved.data && saved.data.data.length === 0 && <div className="card p-5 text-sm text-slate-500">Nenhum processo salvo ainda. Pesquise e clique em “Salvar processo”.</div>}
          <div className="space-y-3">
            {saved.data?.data.map(p => (
              <div key={p.id} className="card p-4" data-testid="salvo">
                <p className="font-medium text-slate-900 text-sm">{p.numero_cnj}</p>
                <p className="text-xs text-slate-500 mt-0.5">{p.tribunal} · {p.classe} · {p.assunto}</p>
                <p className="text-xs text-slate-400 mt-1">Salvo em {fmtDate(p.created_at)}{p.saved_by_name ? ` por ${p.saved_by_name}` : ''} · {p.pages ?? '?'} pág. · {fmtSize(p.size_bytes)}</p>
                <div className="flex items-center gap-3 mt-3">
                  <button className="btn-secondary" onClick={() => setViewing({ title: p.numero_cnj, load: () => savedProcessesApi.file(p.id), saved: p })}><FileText className="w-4 h-4" /> Abrir</button>
                  <button className="btn-ghost" onClick={async () => download(await savedProcessesApi.file(p.id), p.file_name)}><Download className="w-4 h-4" /> Baixar</button>
                  <button className="btn-ghost text-red-600 ml-auto" onClick={() => { if (window.confirm(`Remover ${p.numero_cnj} da lista?`)) remove.mutate(p.id) }}><Trash2 className="w-4 h-4" /> Remover</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {viewing && (
        <PdfModal
          title={viewing.title}
          load={viewing.load}
          onClose={() => setViewing(null)}
          actions={viewing.ref ? <SaveBtn r={viewing.ref} /> : undefined}
        />
      )}
    </div>
  )
}
