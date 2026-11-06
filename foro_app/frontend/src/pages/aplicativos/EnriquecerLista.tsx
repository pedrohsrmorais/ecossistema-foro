import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Upload, FileSpreadsheet, Download, Loader2, CheckCircle2, AlertTriangle, Sparkles, Trash2, Users, ArrowRight } from 'lucide-react'
import { lookupEnrichApi, lookupApi, type EnrichJob, type EnrichFill, type EnrichStats, type ImportBatch, type FileDownload } from '../../api'
import { saveFile } from '../../lib/download'
import { useCan } from '../../hooks/useCan'
import LeadImport from '../../components/LeadImport'
import { QuotaText, ConsultingCta, ddmm } from './ConsultaDocumento'

const errMsg = (e: any, fb: string) => e?.response?.data?.error || fb
async function blobErr(e: any): Promise<string> {
  try { const d = e?.response?.data; if (d instanceof Blob) return JSON.parse(await d.text()).error || 'Falha no download.' } catch { /* segue */ }
  return errMsg(e, 'Falha no download.')
}
const FILL_LABEL: Record<keyof EnrichFill, string> = { phone: 'Telefones', email: 'E-mails', name: 'Nome', address: 'Endereço (cidade, UF, CEP)' }
const STATUS_LABEL: Record<string, string> = { concluida: 'Concluída', interrompida: 'Interrompida', rodando: 'Em andamento', cancelada: 'Cancelada' }

function Stat({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: string }) {
  return (
    <div className={`rounded-lg border p-3 ${tone || 'bg-white'}`}>
      <p className="text-xl font-semibold text-slate-900">{value}</p>
      <p className="text-xs text-slate-600">{label}</p>
      {hint && <p className="text-[11px] text-slate-400">{hint}</p>}
    </div>
  )
}

/** "Enriquecer lista": planilha com CPF/CNPJ → telefones e e-mails, com orçamento antes de gastar. */
export default function EnriquecerLista() {
  const qc = useQueryClient()
  const canCreate = useCan('create_leads')
  const fileRef = useRef<HTMLInputElement>(null)
  const [jobId, setJobId] = useState<string | null>(null)
  const [drag, setDrag] = useState(false)
  const [err, setErr] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [batch, setBatch] = useState<ImportBatch | null>(null)
  const [optFill, setOptFill] = useState<EnrichFill | null>(null) // marcação otimista enquanto recalcula

  const { data: st } = useQuery({ queryKey: ['lookup-status'], queryFn: lookupApi.status, staleTime: 15_000 })
  const { data: history = [], refetch: refetchHistory } = useQuery({ queryKey: ['enrich-history'], queryFn: lookupEnrichApi.history })
  const { data: job } = useQuery({
    queryKey: ['enrich-job', jobId], queryFn: () => lookupEnrichApi.get(jobId!), enabled: !!jobId,
    refetchInterval: q => (q.state.data?.status === 'rodando' ? 1500 : false),
  })
  const refreshMoney = () => { qc.invalidateQueries({ queryKey: ['lookup-status'] }); refetchHistory() }
  const jobStatus = job?.status
  useEffect(() => { if (jobStatus === 'concluida' || jobStatus === 'interrompida') refreshMoney() }, [jobStatus]) // eslint-disable-line react-hooks/exhaustive-deps
  const put = (j: EnrichJob) => qc.setQueryData(['enrich-job', j.id], j)

  const download = async (p: Promise<FileDownload>) => { try { const f = await p; saveFile(f.blob, f.filename) } catch (e) { setErr(await blobErr(e)) } }

  const upload = useMutation({
    mutationFn: (f: File) => lookupEnrichApi.upload(f),
    onSuccess: j => { setErr(''); put(j); setJobId(j.id); setConfirming(false) },
    onError: e => setErr(errMsg(e, 'Não consegui ler o arquivo.')),
  })
  const analyze = useMutation({
    mutationFn: (d: { doc_col?: number; options?: { fill: Partial<EnrichFill> } }) => lookupEnrichApi.analyze(jobId!, d),
    onSuccess: j => { setErr(''); put(j); setConfirming(false); setOptFill(null) },
    onError: e => { setOptFill(null); setErr(errMsg(e, 'Não foi possível recalcular.')) },
  })
  const start = useMutation({
    mutationFn: (n: number) => lookupEnrichApi.start(jobId!, n),
    onSuccess: () => { setErr(''); setConfirming(false); qc.invalidateQueries({ queryKey: ['enrich-job', jobId] }) },
    onError: (e: any) => {
      setConfirming(false)
      setErr(errMsg(e, 'Não foi possível iniciar.'))
      if (e?.response?.data?.code === 'QUOTE_CHANGED') qc.invalidateQueries({ queryKey: ['enrich-job', jobId] })
    },
  })
  const discard = useMutation({
    mutationFn: (id: string) => lookupEnrichApi.discard(id),
    onSuccess: (_d, id) => { if (id === jobId) setJobId(null); qc.removeQueries({ queryKey: ['enrich-job', id] }); refetchHistory() },
    onError: e => setErr(errMsg(e, 'Não foi possível descartar.')),
  })
  const toImport = useMutation({
    mutationFn: () => lookupEnrichApi.toImport(jobId!),
    onSuccess: b => { setErr(''); setBatch(b) },
    onError: e => setErr(errMsg(e, 'Não foi possível abrir no importador.')),
  })

  const pick = (f?: File | null) => { if (f) { setErr(''); upload.mutate(f) } }
  const stats: EnrichStats | undefined = job?.stats ?? job?.analysis
  const fill = optFill ?? job?.options?.fill
  const toggleFill = (k: keyof EnrichFill) => { if (!fill) return; const next = { ...fill, [k]: !fill[k] }; setOptFill(next); analyze.mutate({ options: { fill: next } }) }
  const reset = () => { setJobId(null); setErr(''); setConfirming(false); refetchHistory() }

  if (!canCreate) {
    return <div className="p-6 max-w-2xl"><p className="text-sm text-slate-500">Você não tem permissão para enriquecer listas. Peça acesso a quem administra a conta.</p></div>
  }

  const editable = job && (job.status === 'analisada' || job.status === 'interrompida')

  return (
    <div className="p-6 max-w-3xl animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2"><Sparkles className="w-5 h-5 text-accent-500" /> Enriquecer lista</h1>
        <p className="text-sm text-slate-500 mt-1">
          Suba uma planilha com CPFs (ou CNPJs) e a gente acha telefones e e-mails. Antes de começar você vê quantas consultas a lista vai usar da sua cota semanal.
        </p>
      </div>

      {err && <p className="text-sm text-red-600 mb-4" role="alert" data-testid="enrich-erro">{err} {/Consulting/.test(err) && <ConsultingCta />}</p>}

      {!job && (
        <>
          <div className="card p-5 mb-4">
            <ol className="text-sm text-slate-700 space-y-1.5 list-decimal pl-5 mb-4">
              <li>Baixe a planilha modelo e cole os CPFs/CNPJs (e o que você já tiver de nome, telefone e e-mail).</li>
              <li>Envie o arquivo aqui — a gente conta quantas consultas são necessárias e mostra o valor.</li>
              <li>Confirme, aguarde e baixe a planilha preenchida ou mande direto para o CRM.</li>
            </ol>
            <div className="flex gap-2 flex-wrap">
              <button className="btn-secondary text-sm" data-testid="enrich-modelo-xlsx" onClick={() => download(lookupEnrichApi.template('xlsx'))}><FileSpreadsheet className="w-4 h-4" /> Baixar modelo (.xlsx)</button>
              <button className="btn-secondary text-sm" onClick={() => download(lookupEnrichApi.template('csv'))}><Download className="w-4 h-4" /> Modelo em .csv</button>
            </div>
          </div>

          <div
            onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]) }}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${drag ? 'border-accent-500 bg-accent-50/50' : 'border-slate-300 hover:border-slate-400 bg-white'}`}>
            {upload.isPending ? <Loader2 className="w-6 h-6 mx-auto text-slate-400 animate-spin" /> : <Upload className="w-6 h-6 mx-auto text-slate-400" />}
            <p className="text-sm text-slate-700 mt-2">{upload.isPending ? 'Lendo a planilha...' : 'Arraste a planilha aqui ou clique para escolher'}</p>
            <p className="text-xs text-slate-400 mt-1">.xlsx ou .csv · CPF e CNPJ podem estar misturados</p>
            <input ref={fileRef} type="file" accept=".xlsx,.csv,.txt" className="hidden" data-testid="enrich-file" onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
          </div>

          {history.length > 0 && (
            <div className="mt-6">
              <p className="text-xs font-medium text-slate-500 mb-2">Listas anteriores (ficam disponíveis por 7 dias)</p>
              <div className="card divide-y">
                {history.map(h => (
                  <div key={h.id} className="p-3 flex items-center gap-3 flex-wrap text-sm" data-testid="enrich-hist">
                    <div className="flex-1 min-w-[180px]">
                      <p className="font-medium text-slate-900 truncate">{h.file_name}</p>
                      <p className="text-xs text-slate-500">{STATUS_LABEL[h.status] || h.status} · {new Date(h.created_at).toLocaleDateString('pt-BR')}{h.user_name ? ` · ${h.user_name}` : ''}{h.progress ? ` · ${h.progress.ok} preenchidas · ${h.progress.consultas ?? 0} consultas usadas` : ''}</p>
                    </div>
                    <button className="btn-secondary text-sm" onClick={() => setJobId(h.id)}>Abrir</button>
                    <button className="btn-ghost text-sm text-red-600" aria-label="Descartar" onClick={() => discard.mutate(h.id)}><Trash2 className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {job && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <FileSpreadsheet className="w-4 h-4" /> <span className="font-medium text-slate-900" data-testid="enrich-arquivo">{job.file_name}</span>
            {job.status !== 'rodando' && <button className="text-accent-600 hover:underline ml-2" onClick={reset}>← outra lista</button>}
          </div>

          {job.truncated && (
            <p className="text-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-800 p-3 flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> A planilha tem mais de {job.max_rows} linhas — só as primeiras {job.max_rows} serão usadas.</p>
          )}

          {editable && job.headers && (
            <div className="card p-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Coluna do CPF/CNPJ</label>
                <select className="input max-w-xs" data-testid="enrich-col" value={job.doc_col ?? 0} disabled={analyze.isPending} onChange={e => analyze.mutate({ doc_col: Number(e.target.value) })}>
                  {job.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-600 mb-1.5">O que você quer preencher?</p>
                <div className="flex gap-x-5 gap-y-1.5 flex-wrap">
                  {(Object.keys(FILL_LABEL) as (keyof EnrichFill)[]).map(k => (
                    <label key={k} className="flex items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" data-testid={`enrich-fill-${k}`} checked={!!fill?.[k]} onChange={() => toggleFill(k)} /> {FILL_LABEL[k]}
                    </label>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-1.5">Só entram na conta as linhas em que falta algo marcado aqui. O que você já preencheu na planilha nunca é sobrescrito.</p>
              </div>
            </div>
          )}

          {stats && (job.status === 'analisada' || job.status === 'interrompida') && job.quote && (
            <div className="card p-5" data-testid="enrich-resumo">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
                <Stat label="Linhas na planilha" value={stats.total} />
                <Stat label="Consultas necessárias" value={stats.consultar} hint={`${stats.consultar_cpf} CPF · ${stats.consultar_cnpj} CNPJ`} tone="bg-accent-50/60 border-accent-200" />
                <Stat label="Já estão completas" value={stats.completas} hint="não serão consultadas" />
                <Stat label="Já consultadas antes" value={stats.em_cache} hint="sem custo" />
                <Stat label="CPF/CNPJ inválidos" value={stats.invalidas} />
                <Stat label="Repetidos" value={stats.repetidas} />
              </div>
              <div className="rounded-lg bg-slate-50 p-3 text-sm space-y-1">
                <p className="flex justify-between font-semibold text-slate-900" data-testid="enrich-total"><span>Consultas desta lista</span><span>{job.quote.needed}</span></p>
                <p className="flex justify-between text-slate-500"><span>Disponíveis na sua cota esta semana</span><span data-testid="enrich-disponivel">{job.quote.remaining} de {job.quote.limit}</span></p>
                <p className="flex justify-between text-slate-500"><span>A cota renova em</span><span>{ddmm(job.quote.renews_at)}</span></p>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">Documentos sem resultado na base e os que já foram consultados antes não contam na cota.</p>

              {job.quote.shortfall > 0 && (
                <p className="text-sm text-red-600 mt-3" data-testid="enrich-falta">
                  {job.quote.has_plan
                    ? <>Esta lista precisa de {job.quote.needed} consultas e você tem {job.quote.remaining} nesta semana. Reduza a lista ou, se a sua demanda é maior, <ConsultingCta />.</>
                    : <>Você ainda não tem um plano — peça ao administrador do escritório.</>}
                </p>
              )}
              {job.configured === false && <p className="text-sm text-amber-700 mt-3">As consultas ainda não foram configuradas na plataforma. Fale com o suporte.</p>}

              <div className="mt-4 flex items-center gap-3 flex-wrap">
                {!confirming ? (
                  <button className="btn-primary" data-testid="enrich-preencher"
                    disabled={stats.consultar + stats.em_cache === 0 || job.quote.shortfall > 0 || job.configured === false || analyze.isPending}
                    onClick={() => (stats.consultar === 0 ? start.mutate(0) : setConfirming(true))}>
                    <Sparkles className="w-4 h-4" /> {job.status === 'interrompida' ? 'Retomar preenchimento' : 'Preencher infos'}
                  </button>
                ) : (
                  <>
                    <p className="text-sm text-slate-700">Usar <b>{stats.consultar}</b> das suas {job.quote.remaining} consultas desta semana?</p>
                    <button className="btn-primary" data-testid="enrich-confirmar" disabled={start.isPending} onClick={() => start.mutate(stats.consultar)}>{start.isPending ? 'Iniciando...' : 'Confirmar e consultar'}</button>
                    <button className="btn-ghost" onClick={() => setConfirming(false)}>Cancelar</button>
                  </>
                )}
                {job.status === 'analisada' && <button className="btn-ghost text-red-600 ml-auto" onClick={() => discard.mutate(job.id)}>Descartar</button>}
              </div>
            </div>
          )}

          {job.status === 'rodando' && job.progress && (
            <div className="card p-5" data-testid="enrich-andamento">
              <p className="text-sm font-medium text-slate-900 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Consultando... {job.progress.done} de {job.progress.total}</p>
              <div className="h-2 bg-slate-100 rounded-full mt-3 overflow-hidden"><div className="h-full bg-accent-500 transition-all" style={{ width: `${job.progress.total ? Math.round((job.progress.done / job.progress.total) * 100) : 0}%` }} /></div>
              <p className="text-xs text-slate-500 mt-2">{job.progress.ok} preenchidas · {job.progress.sem_resultado} sem resultado · {job.progress.consultas ?? 0} consultas usadas. Pode sair desta tela — o lote continua rodando.</p>
            </div>
          )}

          {(job.status === 'concluida' || job.status === 'interrompida') && job.progress && (
            <div className={`card p-5 ${job.status === 'concluida' ? '' : 'border-amber-200'}`} data-testid="enrich-resultado">
              <p className="text-sm font-medium text-slate-900 flex items-center gap-2">
                {job.status === 'concluida' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                {job.status === 'concluida' ? 'Lista enriquecida' : 'Lote interrompido — o que já foi consultado está salvo'}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                <Stat label="Preenchidas" value={job.progress.ok} tone="bg-emerald-50" />
                <Stat label="Sem resultado" value={job.progress.sem_resultado} />
                <Stat label="Com erro" value={job.progress.erros} />
                <Stat label="Consultas usadas" value={job.progress.consultas ?? 0} />
              </div>
              {job.progress.mensagem && <p className="text-sm text-amber-700 mt-3">{job.progress.mensagem}</p>}
              <div className="mt-4 flex gap-2 flex-wrap">
                <button className="btn-primary" data-testid="enrich-baixar-xlsx" onClick={() => download(lookupEnrichApi.download(job.id, 'xlsx'))}><Download className="w-4 h-4" /> Baixar .xlsx</button>
                <button className="btn-secondary" onClick={() => download(lookupEnrichApi.download(job.id, 'csv'))}><Download className="w-4 h-4" /> .csv</button>
                <button className="btn-secondary" data-testid="enrich-importar" disabled={toImport.isPending} onClick={() => toImport.mutate()}><Users className="w-4 h-4" /> {toImport.isPending ? 'Preparando...' : 'Importar no CRM'} <ArrowRight className="w-3.5 h-3.5" /></button>
              </div>
              {job.status === 'concluida' && <button className="text-xs text-slate-500 hover:underline mt-3" onClick={reset}>Enriquecer outra lista</button>}
            </div>
          )}
        </div>
      )}

      {batch && <LeadImport initialBatch={batch} onClose={() => setBatch(null)} />}
      {st && !job && <p className="text-[11px] text-slate-400 mt-6"><QuotaText q={st.quota} /> Use estes dados apenas para finalidade legítima, conforme a LGPD.</p>}
    </div>
  )
}
