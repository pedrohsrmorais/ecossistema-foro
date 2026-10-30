import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { Archive, Search, FileText, Download, Trash2, X, Copy, Check, Database, ChevronLeft, ChevronRight } from 'lucide-react'
import { savedProcessesApi, SavedProcess } from '../../api'

const LIMIT = 15
const errMsg = (e: any, f: string) => e?.response?.data?.error || f
const fmtSize = (n: number) => (n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB')
const fmtDate = (d?: string | null) => { if (!d) return '—'; const x = new Date(d.length <= 10 ? d + 'T12:00:00' : d); return isNaN(x.getTime()) ? d : x.toLocaleDateString('pt-BR') }
const fmtDateTime = (d?: string | null) => { if (!d) return '—'; const x = new Date(d); return isNaN(x.getTime()) ? d : x.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) }

function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v)
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t) }, [v, ms])
  return d
}

function CopyBtn({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  return (
    <button className="btn-ghost p-1" aria-label={label} title={label} onClick={async e => {
      e.stopPropagation()
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500) } catch { /* sem permissão de área de transferência */ }
    }}>{done ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}</button>
  )
}

function download(blob: Blob, name: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

function PdfModal({ p, onClose }: { p: SavedProcess; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let u: string | null = null
    savedProcessesApi.file(p.id).then(b => { u = URL.createObjectURL(b); setUrl(u) }).catch(e => setError(errMsg(e, 'Não foi possível abrir o documento.')))
    return () => { if (u) URL.revokeObjectURL(u) }
  }, [p.id])
  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
          <FileText className="w-4 h-4 text-accent-500" /><p className="text-sm font-medium flex-1 truncate">{p.numero_cnj}</p>
          <button onClick={onClose} className="btn-ghost p-1.5" aria-label="Fechar documento"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 bg-slate-100 rounded-b-xl overflow-hidden">
          {error ? <p className="p-6 text-sm text-red-600">{error}</p> : url ? <iframe title="Documento do processo" src={url} className="w-full h-full" /> : <p className="p-6 text-sm text-slate-500">Carregando documento…</p>}
        </div>
      </div>
    </div>
  )
}

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return <div><dt className="text-[11px] uppercase tracking-wide text-slate-400">{label}</dt><dd className={`text-sm text-slate-800 break-all ${mono ? 'font-mono text-xs' : ''}`}>{children}</dd></div>
}

function Detail({ p, onClose, onOpen }: { p: SavedProcess; onClose: () => void; onOpen: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex justify-end" onClick={onClose}>
      <aside className="bg-white w-full max-w-md h-full shadow-xl overflow-y-auto p-5" onClick={e => e.stopPropagation()} data-testid="detalhe">
        <div className="flex items-start gap-2 mb-4">
          <div className="flex-1"><p className="text-xs text-slate-400">Processo salvo</p><h2 className="font-semibold text-slate-900">{p.numero_cnj}</h2></div>
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label="Fechar detalhes"><X className="w-4 h-4" /></button>
        </div>
        <dl className="space-y-3">
          <Field label="Tribunal">{p.tribunal}</Field>
          <Field label="Classe">{p.classe || '—'}</Field>
          <Field label="Assunto">{p.assunto || '—'}</Field>
          <Field label="Partes">{p.parties.length ? p.parties.map((x, i) => <span key={i} className="block">{x.papel}: {x.nome}</span>) : '—'}</Field>
          <Field label="Distribuição">{fmtDate(p.distributed_at)}</Field>
          <Field label="Última movimentação">{p.last_movement || '—'} ({fmtDate(p.last_movement_at)})</Field>
          <hr className="border-slate-200" />
          <Field label="Salvo em">{fmtDateTime(p.created_at)}{p.saved_by_name ? ` · ${p.saved_by_name}` : ''}</Field>
          <Field label="Origem da consulta">{p.source}{p.search_query ? ` · “${p.search_query}”` : ''}</Field>
          <Field label="Arquivo">{p.file_name} · {p.pages ?? '?'} pág. · {fmtSize(p.size_bytes)}</Field>
          <Field label="Bucket" mono>{p.s3_bucket}</Field>
          <Field label="Caminho no S3 (chave)" mono>{p.s3_key} <CopyBtn text={p.s3_key} label="Copiar caminho" /></Field>
          <Field label="SHA-256" mono>{p.sha256}</Field>
          <Field label="ID" mono>{p.id}</Field>
        </dl>
        <div className="flex gap-2 mt-5">
          <button className="btn-primary" onClick={onOpen}><FileText className="w-4 h-4" /> Abrir PDF</button>
          <button className="btn-secondary" onClick={async () => download(await savedProcessesApi.file(p.id), p.file_name)}><Download className="w-4 h-4" /> Baixar</button>
        </div>
      </aside>
    </div>
  )
}

export default function ProcessosSalvos() {
  const qc = useQueryClient()
  const [q, setQ] = useState('')
  const [tribunal, setTribunal] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState('recent')
  const [page, setPage] = useState(1)
  const [detail, setDetail] = useState<SavedProcess | null>(null)
  const [pdf, setPdf] = useState<SavedProcess | null>(null)
  const [error, setError] = useState<string | null>(null)
  const dq = useDebounced(q)
  useEffect(() => { setPage(1) }, [dq, tribunal, from, to, sort])

  const summary = useQuery({ queryKey: ['saved-processes', 'summary'], queryFn: savedProcessesApi.summary })
  const list = useQuery({
    queryKey: ['saved-processes', 'list', dq, tribunal, from, to, sort, page],
    queryFn: () => savedProcessesApi.list({ q: dq || undefined, tribunal: tribunal || undefined, from: from || undefined, to: to || undefined, sort, page, limit: LIMIT }),
    placeholderData: keepPreviousData,
  })
  const remove = useMutation({
    mutationFn: (id: string) => savedProcessesApi.remove(id),
    onSuccess: () => { setDetail(null); qc.invalidateQueries({ queryKey: ['saved-processes'] }) },
    onError: e => setError(errMsg(e, 'Não foi possível remover.')),
  })

  const total = list.data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / LIMIT))
  const s = summary.data

  return (
    <div className="p-6 max-w-6xl animate-fade-in">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2"><Archive className="w-5 h-5 text-accent-500" /> Processos salvos</h1>
        <p className="text-sm text-slate-500 mt-1">Tudo que foi salvo no armazenamento. Os dados e o caminho de cada arquivo ficam no banco, então a busca é rápida.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5" data-testid="resumo">
        {[['Processos', s ? String(s.total) : '—'], ['Páginas', s ? String(s.pages) : '—'], ['Espaço usado', s ? fmtSize(s.bytes) : '—'], ['Último salvo', s ? fmtDateTime(s.last_saved) : '—']].map(([l, v]) => (
          <div key={l} className="card p-4"><p className="text-[11px] uppercase tracking-wide text-slate-400">{l}</p><p className="text-lg font-semibold text-slate-900 mt-0.5">{v}</p></div>
        ))}
      </div>
      {s && <p className="text-xs text-slate-500 mb-4 flex items-center gap-1.5"><Database className="w-3.5 h-3.5" /> Bucket: <code className="font-mono">{s.bucket}</code></p>}

      <div className="card p-4 mb-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="text-xs font-medium text-slate-600 mb-1 block">Buscar</label>
          <div className="relative"><Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input className="input pl-9" placeholder="Número, parte, classe, assunto ou caminho" value={q} onChange={e => setQ(e.target.value)} /></div>
        </div>
        <div><label className="text-xs font-medium text-slate-600 mb-1 block">Tribunal</label>
          <select className="input" value={tribunal} onChange={e => setTribunal(e.target.value)} aria-label="Tribunal">
            <option value="">Todos</option>{s?.tribunais.map(t => <option key={t.tribunal} value={t.tribunal}>{t.tribunal} ({t.total})</option>)}
          </select></div>
        <div><label className="text-xs font-medium text-slate-600 mb-1 block">Salvo de</label><input type="date" className="input" value={from} onChange={e => setFrom(e.target.value)} aria-label="Salvo de" /></div>
        <div><label className="text-xs font-medium text-slate-600 mb-1 block">até</label><input type="date" className="input" value={to} onChange={e => setTo(e.target.value)} aria-label="Salvo até" /></div>
        <div><label className="text-xs font-medium text-slate-600 mb-1 block">Ordenar</label>
          <select className="input" value={sort} onChange={e => setSort(e.target.value)} aria-label="Ordenar">
            <option value="recent">Mais recentes</option><option value="oldest">Mais antigos</option><option value="number">Número</option><option value="tribunal">Tribunal</option><option value="size">Maiores</option>
          </select></div>
      </div>

      {error && <p className="text-sm text-red-600 mb-3" role="alert">{error}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm" data-testid="tabela">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-200">
            <th className="p-3">Processo</th><th className="p-3">Partes</th><th className="p-3">Salvo</th><th className="p-3">Arquivo</th><th className="p-3">Local no S3</th><th className="p-3 w-24" />
          </tr></thead>
          <tbody>
            {list.data?.data.map(p => (
              <tr key={p.id} data-testid="linha" className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer" onClick={() => setDetail(p)}>
                <td className="p-3 align-top"><p className="font-medium text-slate-900">{p.numero_cnj}</p><p className="text-xs text-slate-500">{p.tribunal} · {p.classe}</p></td>
                <td className="p-3 align-top text-xs text-slate-600">{p.parties.map((x, i) => <span key={i} className="block">{x.nome}</span>)}</td>
                <td className="p-3 align-top text-xs text-slate-600">{fmtDateTime(p.created_at)}<span className="block text-slate-400">{p.saved_by_name}</span></td>
                <td className="p-3 align-top text-xs text-slate-600">{p.pages ?? '?'} pág.<span className="block text-slate-400">{fmtSize(p.size_bytes)}</span></td>
                <td className="p-3 align-top"><div className="flex items-start gap-1 max-w-[260px]"><code className="font-mono text-[11px] text-slate-600 break-all">{p.s3_bucket}/{p.s3_key}</code><CopyBtn text={`${p.s3_bucket}/${p.s3_key}`} label="Copiar bucket e caminho" /></div></td>
                <td className="p-3 align-top"><div className="flex gap-1 justify-end">
                  <button className="btn-ghost p-1.5" aria-label="Abrir PDF" title="Abrir PDF" onClick={e => { e.stopPropagation(); setPdf(p) }}><FileText className="w-4 h-4" /></button>
                  <button className="btn-ghost p-1.5" aria-label="Baixar" title="Baixar" onClick={async e => { e.stopPropagation(); download(await savedProcessesApi.file(p.id), p.file_name) }}><Download className="w-4 h-4" /></button>
                  <button className="btn-ghost p-1.5 text-red-600" aria-label="Remover" title="Remover da lista" onClick={e => { e.stopPropagation(); if (window.confirm(`Remover ${p.numero_cnj} da lista? O arquivo continua no armazenamento.`)) remove.mutate(p.id) }}><Trash2 className="w-4 h-4" /></button>
                </div></td>
              </tr>
            ))}
            {list.data && list.data.data.length === 0 && <tr><td colSpan={6} className="p-6 text-center text-slate-500">{total === 0 && !dq && !tribunal && !from && !to ? 'Nenhum processo salvo ainda. Pesquise em “Consulta processual” e clique em Salvar.' : 'Nada encontrado com esses filtros.'}</td></tr>}
            {list.isLoading && <tr><td colSpan={6} className="p-6 text-center text-slate-500">Carregando…</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-3 text-sm text-slate-600">
        <span>{total} processo(s)</span>
        <div className="flex items-center gap-2">
          <button className="btn-secondary p-1.5" disabled={page <= 1} onClick={() => setPage(p => p - 1)} aria-label="Página anterior"><ChevronLeft className="w-4 h-4" /></button>
          <span>Página {page} de {pages}</span>
          <button className="btn-secondary p-1.5" disabled={page >= pages} onClick={() => setPage(p => p + 1)} aria-label="Próxima página"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      {detail && <Detail p={detail} onClose={() => setDetail(null)} onOpen={() => setPdf(detail)} />}
      {pdf && <PdfModal p={pdf} onClose={() => setPdf(null)} />}
    </div>
  )
}
