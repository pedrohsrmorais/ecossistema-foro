import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Gavel, Search, X, Loader2, ListTree, BookmarkPlus, CheckCircle2, CalendarRange } from 'lucide-react'
import { processSearchApi, ProcessSearchResult, ProcessSearchResponse, ProcessSnapshot, type ProcessDateFilter } from '../../api'
import ProcessSnapshotView, { SourceChips, fmtDate } from '../../components/ProcessSnapshotView'
import { useCan } from '../../hooks/useCan'

const errMsg = (e: any, fallback: string) => e?.response?.data?.error || fallback

/** Janela com os andamentos (DataJud) e publicações (DJEN) do processo. Só leitura: nada é gravado. */
function SnapshotModal({ title, load, onClose }: { title: string; load: () => Promise<ProcessSnapshot>; onClose: () => void }) {
  const [snap, setSnap] = useState<ProcessSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    load().then(setSnap).catch(e => setError(errMsg(e, 'Não foi possível consultar os andamentos.')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[88vh] flex flex-col" onClick={e => e.stopPropagation()} role="dialog" aria-label="Andamentos do processo">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
          <ListTree className="w-4 h-4 text-accent-500" />
          <p className="text-sm font-medium text-slate-900 flex-1 truncate">{title}</p>
          <button onClick={onClose} className="btn-ghost p-1.5" aria-label="Fechar andamentos"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {error ? <p className="text-sm text-red-600" role="alert">{error}</p>
            : snap ? <ProcessSnapshotView snap={snap} />
            : <p className="text-sm text-slate-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Consultando DataJud e DJEN…</p>}
        </div>
      </div>
    </div>
  )
}

/** Botão "Salvar em Meus processos" de um resultado: cria/vincula o processo e guarda as publicações. */
function SaveButton({ r }: { r: ProcessSearchResult }) {
  const qc = useQueryClient()
  const [done, setDone] = useState<{ caseId: string; created: boolean } | null>(null)
  const [err, setErr] = useState('')
  const save = useMutation({
    mutationFn: () => processSearchApi.save(r.ref),
    onSuccess: d => { setErr(''); setDone({ caseId: d.case_id!, created: !!d.case_created }); qc.invalidateQueries({ queryKey: ['cases'] }) },
    onError: e => setErr(errMsg(e, 'Não foi possível salvar.')),
  })
  if (done) {
    return (
      <p className="text-sm text-emerald-700 flex items-center gap-1.5 flex-wrap" data-testid="salvo">
        <CheckCircle2 className="w-4 h-4" /> {done.created ? 'Salvo em Meus processos.' : 'Publicações salvas no processo que você já tinha.'}
        <Link to={`/monitoramento-processual/${done.caseId}`} className="underline">Abrir processo</Link>
      </p>
    )
  }
  return (
    <>
      <button className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending} data-testid="salvar-processo">
        <BookmarkPlus className="w-4 h-4" /> {save.isPending ? 'Salvando…' : 'Salvar em Meus processos'}
      </button>
      {err && <p className="text-sm text-red-600 w-full" role="alert">{err}</p>}
    </>
  )
}

export default function ConsultaProcessual() {
  const [term, setTerm] = useState('')
  const [meta, setMeta] = useState<ProcessSearchResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [andamentos, setAndamentos] = useState<ProcessSearchResult | null>(null)
  const [periodo, setPeriodo] = useState<ProcessDateFilter>({})
  const [usedPeriodo, setUsedPeriodo] = useState<ProcessDateFilter>({})
  const canSave = useCan('create_cases')

  const search = useMutation({
    mutationFn: () => { setUsedPeriodo(periodo); return processSearchApi.search(term.trim(), periodo) },
    onSuccess: d => { setMeta(d); setError(null) },
    onError: e => { setError(errMsg(e, 'Erro ao pesquisar.')); setMeta(null) },
  })

  const results = meta?.results ?? null
  // "Ver andamentos" só existe com a consulta real (DataJud/DJEN); o provedor de teste não tem esse detalhe
  const hasDetail = meta?.capabilities?.documento === false

  return (
    <div className="p-6 max-w-3xl animate-fade-in">
      <div className="mb-5">
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2"><Gavel className="w-5 h-5 text-accent-500" /> Pesquisar processo</h1>
        <p className="text-sm text-slate-500 mt-1">Basta o número do processo: consultamos o DJEN (publicações e intimações) e o DataJud (andamentos), sem custo. Salve para acompanhar em Meus processos.</p>
      </div>

      {error && <p className="text-sm text-red-600 mb-4" role="alert">{error}</p>}

      <form onSubmit={e => { e.preventDefault(); search.mutate() }} className="card p-5 mb-5 space-y-3">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <label className="text-xs font-medium text-slate-600 mb-1 block" htmlFor="proc-term">Número do processo (CNJ), OAB ou nome da parte</label>
            <input id="proc-term" className="input" placeholder="Ex.: 0001234-56.2023.8.26.0100 · OAB/RS 12345 · nome da parte" value={term} onChange={e => setTerm(e.target.value)} maxLength={120} />
          </div>
          <button type="submit" className="btn-primary" disabled={search.isPending || term.trim().length < 3}>
            <Search className="w-4 h-4" />{search.isPending ? 'Buscando…' : 'Pesquisar'}
          </button>
        </div>
        <div className="flex items-end gap-3 flex-wrap" data-testid="filtro-datas">
          <CalendarRange className="w-4 h-4 text-slate-400 mb-2.5" />
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block" htmlFor="proc-de">Publicações de</label>
            <input id="proc-de" type="date" className="input !w-40" value={periodo.de || ''} max={periodo.ate || undefined} onChange={e => setPeriodo(p => ({ ...p, de: e.target.value || undefined }))} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600 mb-1 block" htmlFor="proc-ate">até</label>
            <input id="proc-ate" type="date" className="input !w-40" value={periodo.ate || ''} min={periodo.de || undefined} onChange={e => setPeriodo(p => ({ ...p, ate: e.target.value || undefined }))} />
          </div>
          {(periodo.de || periodo.ate)
            ? <button type="button" className="btn-ghost text-sm mb-0.5" onClick={() => setPeriodo({})}>Limpar datas</button>
            : <p className="text-xs text-slate-400 mb-2.5">Sem datas = todo o histórico (desde 1990).</p>}
        </div>
      </form>

      {results && meta && (
        <div className="space-y-3">
          {meta.aviso && <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2" data-testid="aviso">{meta.aviso}</p>}
          {meta.kind === 'cnj' && <SourceChips fontes={meta.fontes} />}
          {meta.periodo?.filtrado && <p className="text-xs text-slate-500" data-testid="periodo-busca">Período: {fmtDate(meta.periodo.de)} a {fmtDate(meta.periodo.ate)}</p>}
          {results.length === 0 && <p className="text-sm text-slate-500">Nenhum processo encontrado nas fontes consultadas{meta.periodo?.filtrado ? ' no período escolhido' : ''}.</p>}
          {meta.provider === 'mock' && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">Ambiente de teste: os processos são fictícios.</p>}
          {results.map(r => (
            <div key={r.ref} className="card p-4" data-testid="resultado">
              <p className="font-medium text-slate-900 text-sm">{r.numero_cnj}</p>
              <p className="text-xs text-slate-500 mt-0.5">{[r.tribunal, r.classe, r.assunto, r.orgao].filter(x => x && x !== '—').join(' · ')}</p>
              <p className="text-xs text-slate-600 mt-2">{r.partes.map(p => `${p.papel}: ${p.nome}`).join(' × ')}</p>
              <p className="text-sm text-slate-700 mt-2">{r.ultima_movimentacao} <span className="text-xs text-slate-400">({fmtDate(r.data_ultima_movimentacao)})</span></p>
              {hasDetail && (r.movimentos_total != null || r.comunicacoes_total != null) && (
                <p className="text-xs text-slate-400 mt-1">{r.movimentos_total != null ? `${r.movimentos_total} movimentações` : 'movimentações não consultadas'} · {r.comunicacoes_total ?? 0} publicações</p>
              )}
              {hasDetail && (
                <div className="mt-3 flex gap-2 flex-wrap items-center">
                  <button className="btn-secondary" onClick={() => setAndamentos(r)}><ListTree className="w-4 h-4" /> Ver publicações e andamentos</button>
                  {canSave && <SaveButton key={r.ref} r={r} />}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {andamentos && <SnapshotModal title={andamentos.numero_cnj} load={() => processSearchApi.detail(andamentos.ref, usedPeriodo)} onClose={() => setAndamentos(null)} />}
    </div>
  )
}
