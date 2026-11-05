import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Upload, FileSpreadsheet, Download, Undo2, AlertTriangle, CheckCircle2, Loader2, ArrowLeft } from 'lucide-react'
import {
  leadImportApi, usersApi,
  type ImportBatch, type ImportOptions, type ImportPreview, type ImportResult, type ImportRow, type FileDownload,
} from '../api'
import { useLeadStages } from '../lib/stages'
import { saveFile } from '../lib/download'

type Step = 'inicio' | 'colunas' | 'previa' | 'fim'
const errMsg = (e: any, fallback = 'Não foi possível concluir.') => e?.response?.data?.error || fallback
/** Erros de download chegam como Blob; tenta ler a mensagem. */
async function blobErr(e: any): Promise<string> {
  try { const d = e?.response?.data; if (d instanceof Blob) return JSON.parse(await d.text()).error || 'Falha no download.' } catch { /* segue */ }
  return errMsg(e, 'Falha no download.')
}
const STATUS_LABEL: Record<ImportRow['status'], { t: string; c: string }> = {
  novo: { t: 'Novo', c: 'bg-emerald-50 text-emerald-700' },
  atualizar: { t: 'Completar', c: 'bg-sky-50 text-sky-700' },
  duplicada: { t: 'Duplicado', c: 'bg-amber-50 text-amber-700' },
  erro: { t: 'Recusada', c: 'bg-red-50 text-red-700' },
}
const VIA_LABEL: Record<string, string> = { cabecalho: 'pelo título', conteudo: 'pelo conteúdo', manual: 'escolhido' }

/** Assistente de importação de listas (CSV/Excel) do CRM Comercial: arquivo → colunas → prévia → resultado. */
export default function LeadImport({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const { stages } = useLeadStages()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('inicio')
  const [err, setErr] = useState('')
  const [drag, setDrag] = useState(false)
  const [batch, setBatch] = useState<ImportBatch | null>(null)
  const [model, setModel] = useState('generico')
  const [mapping, setMapping] = useState<string[]>([])
  const [vias, setVias] = useState<(string | null)[]>([])
  const [opts, setOpts] = useState<ImportOptions>({ on_duplicate: 'skip', proper_names: true, default_ddd: '' })
  const [prev, setPrev] = useState<ImportPreview | null>(null)
  const [onlyProblems, setOnlyProblems] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [undone, setUndone] = useState<{ removidos: number; mantidos: number } | null>(null)

  const { data: info } = useQuery({ queryKey: ['lead-import-models'], queryFn: leadImportApi.models, staleTime: 300_000 })
  const { data: history = [], refetch: refetchHistory } = useQuery({ queryKey: ['lead-import-history'], queryFn: leadImportApi.history })
  const { data: me } = useQuery({ queryKey: ['me-profile'], queryFn: usersApi.me, staleTime: 60_000 })
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: usersApi.list, enabled: me?.role === 'admin' })
  const ownScope = me?.role !== 'admin' && me?.permissions?.view_scope === 'own'
  const targets = info?.targets ?? []

  const refreshLeads = () => ['leads', 'funnel', 'dashboard', 'lead-stages'].forEach(k => qc.invalidateQueries({ queryKey: [k] }))
  const download = async (p: Promise<FileDownload>) => { try { const f = await p; saveFile(f.blob, f.filename) } catch (e) { setErr(await blobErr(e)) } }

  function adopt(b: ImportBatch, keepModel = false) {
    setBatch(b)
    const m = keepModel ? model : b.model
    setModel(m)
    const list = keepModel && b.suggestions[m] ? b.suggestions[m] : b.mapping
    setMapping(list.map(x => x.target)); setVias(list.map(x => x.via))
    if (b.options && !keepModel) setOpts(o => ({ ...o, ...b.options }))
  }

  const upload = useMutation({
    mutationFn: (f: File) => leadImportApi.upload(f),
    onSuccess: b => { setErr(''); adopt(b); setOpts(o => ({ ...o, stage: o.stage || stages[0]?.stage_key })); setStep('colunas') },
    onError: e => setErr(errMsg(e, 'Não consegui ler o arquivo.')),
  })
  const reparse = useMutation({
    mutationFn: (d: { sheet?: number; header_row?: number }) => leadImportApi.reparse(batch!.id, d),
    onSuccess: b => { setErr(''); adopt(b) },
    onError: e => setErr(errMsg(e)),
  })
  const body = () => ({ model, mapping, options: { ...opts, default_ddd: opts.default_ddd || null } })
  const preview = useMutation({
    mutationFn: () => leadImportApi.preview(batch!.id, body()),
    onSuccess: p => { setErr(''); setPrev(p); setOnlyProblems(false); setStep('previa') },
    onError: e => setErr(errMsg(e)),
  })
  const commit = useMutation({
    mutationFn: () => leadImportApi.commit(batch!.id, body()),
    onSuccess: r => { setErr(''); setResult(r); setStep('fim'); refreshLeads(); refetchHistory() },
    onError: e => setErr(errMsg(e)),
  })
  const undo = useMutation({
    mutationFn: (id: string) => leadImportApi.undo(id),
    onSuccess: (r, id) => { setErr(''); refreshLeads(); refetchHistory(); if (result?.id === id) setUndone({ removidos: r.removidos, mantidos: r.mantidos }) },
    onError: e => setErr(errMsg(e)),
  })

  function pick(f?: File | null) {
    if (!f) return
    setErr('')
    if (!/\.(xlsx|csv|txt)$/i.test(f.name)) { setErr(/\.xls$/i.test(f.name) ? 'Arquivo .xls antigo: abra no Excel e salve como .xlsx ou CSV.' : 'Envie um arquivo .xlsx ou .csv.'); return }
    if (info && f.size > info.limits.max_mb * 1048576) { setErr(`O arquivo passa de ${info.limits.max_mb} MB. Divida a planilha em partes.`); return }
    upload.mutate(f)
  }
  function askUndo(id: string, name: string) {
    if (confirm(`Desfazer a importação "${name}"? Os leads criados por ela serão removidos (os que já têm processo ou tarefa ficam).`)) undo.mutate(id)
  }
  function close() { if (batch && step !== 'fim' && !result) leadImportApi.undo(batch.id).catch(() => { /* rascunho some em 24 h */ }); onClose() }
  function changeModel(m: string) {
    setModel(m)
    const s = batch?.suggestions[m]
    if (s) { setMapping(s.map(x => x.target)); setVias(s.map(x => x.via)) }
  }
  function setTarget(i: number, t: string) {
    setMapping(m => m.map((x, j) => (j === i ? t : x))); setVias(v => v.map((x, j) => (j === i ? 'manual' : x)))
  }

  const used = mapping.filter(t => t !== 'ignore').length
  const canPreview = mapping.some(t => ['name', 'document', 'phone', 'email', 'free', 'company'].includes(t))
  const rows = prev ? (onlyProblems ? prev.problems : prev.rows) : []
  const steps: [Step, string][] = [['inicio', 'Arquivo'], ['colunas', 'Colunas'], ['previa', 'Prévia'], ['fim', 'Resultado']]
  const stepIdx = steps.findIndex(s => s[0] === step)

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-2 sm:p-4" role="dialog" aria-label="Importar leads" data-testid="import-wizard">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[94vh] flex flex-col">
        <div className="flex items-center justify-between gap-3 px-4 sm:px-5 py-3 border-b">
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900">Importar lista de leads</h2>
            <ol className="flex flex-wrap gap-x-3 text-xs mt-0.5" aria-label="Etapas">
              {steps.map(([k, l], i) => <li key={k} className={i === stepIdx ? 'text-brand-700 font-medium' : i < stepIdx ? 'text-slate-500' : 'text-slate-300'}>{i + 1}. {l}</li>)}
            </ol>
          </div>
          <button onClick={close} aria-label="Fechar" className="p-1 text-slate-400 hover:text-slate-700"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 sm:p-5 overflow-auto flex-1 space-y-4 text-sm">
          {err && <div role="alert" data-testid="import-erro" className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 flex gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>{err}</span></div>}

          {/* ───────── 1. ARQUIVO ───────── */}
          {step === 'inicio' && (<>
            <div
              onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]) }}
              className={`rounded-xl border-2 border-dashed p-6 text-center ${drag ? 'border-brand-500 bg-brand-50' : 'border-slate-300'}`}>
              {upload.isPending ? (
                <p className="text-slate-600 flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Lendo a planilha…</p>
              ) : (<>
                <Upload className="w-8 h-8 mx-auto text-slate-400" />
                <p className="mt-2 text-slate-700">Arraste a planilha aqui ou</p>
                <button className="btn-primary text-sm mt-2" onClick={() => fileRef.current?.click()}>Escolher arquivo</button>
                <input ref={fileRef} type="file" accept=".xlsx,.csv,.txt" className="hidden" data-testid="import-file" aria-label="Arquivo da planilha"
                  onChange={e => { pick(e.target.files?.[0]); e.target.value = '' }} />
                <p className="text-xs text-slate-500 mt-2">
                  Excel (.xlsx) ou CSV{info ? ` · até ${info.limits.max_mb} MB e ${info.limits.max_rows.toLocaleString('pt-BR')} linhas por importação` : ''}.
                  O Foro reconhece o modelo e as colunas sozinho; você confere antes de importar.
                </p>
              </>)}
            </div>

            <section>
              <h3 className="font-medium text-slate-800 mb-1">Modelos de planilha</h3>
              <p className="text-xs text-slate-500 mb-2">Não é obrigatório usar um modelo — serve de guia para quem prepara a lista.</p>
              <div className="grid sm:grid-cols-2 gap-2">
                {info?.models.map(m => (
                  <div key={m.key} className="rounded-lg border p-3">
                    <div className="font-medium text-slate-800 flex items-center gap-1.5"><FileSpreadsheet className="w-4 h-4 text-slate-400" />{m.label}</div>
                    <p className="text-xs text-slate-500 mt-1">{m.description}</p>
                    <div className="flex gap-3 mt-2 text-xs">
                      <button className="text-brand-700 hover:underline" onClick={() => download(leadImportApi.template(m.key, 'xlsx'))}>Baixar .xlsx</button>
                      <button className="text-brand-700 hover:underline" onClick={() => download(leadImportApi.template(m.key, 'csv'))}>Baixar .csv</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {history.length > 0 && (
              <section>
                <h3 className="font-medium text-slate-800 mb-1">Importações anteriores</h3>
                <ul className="divide-y rounded-lg border" data-testid="import-historico">
                  {history.map(h => (
                    <li key={h.id} className="p-3 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-800 truncate">{h.file_name}</div>
                        <div className="text-xs text-slate-500">
                          {new Date(h.created_at).toLocaleString('pt-BR')}{h.user_name ? ` · ${h.user_name}` : ''} ·{' '}
                          {h.status === 'desfeita' ? `desfeita (${h.stats.desfeita?.removidos ?? 0} removidos)` : `${h.stats.criados ?? 0} criados, ${h.stats.atualizados ?? 0} completados`}
                        </div>
                      </div>
                      {(h.stats.problemas ?? 0) > 0 && <button className="text-xs text-brand-700 hover:underline" onClick={() => download(leadImportApi.problems(h.id))}>Linhas com problema</button>}
                      {h.status === 'concluida' && <button className="text-xs text-red-600 hover:underline flex items-center gap-1" disabled={undo.isPending} onClick={() => askUndo(h.id, h.file_name)}><Undo2 className="w-3.5 h-3.5" />Desfazer</button>}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>)}

          {/* ───────── 2. COLUNAS ───────── */}
          {step === 'colunas' && batch && (<>
            <div className="rounded-lg bg-slate-50 border p-3 flex flex-wrap gap-x-6 gap-y-2 items-end">
              <div className="min-w-0"><div className="text-xs text-slate-500">Arquivo</div><div className="font-medium truncate max-w-[16rem]">{batch.file_name}</div><div className="text-xs text-slate-500">{batch.total_rows.toLocaleString('pt-BR')} linhas{batch.truncated ? ` (só as primeiras ${batch.max_rows.toLocaleString('pt-BR')} serão lidas)` : ''}</div></div>
              <label className="block"><span className="text-xs text-slate-500">Modelo {batch.detected === model && <em className="not-italic text-emerald-600">(detectado)</em>}</span>
                <select className="input" aria-label="Modelo" value={model} onChange={e => changeModel(e.target.value)}>
                  {info?.models.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
                </select></label>
              {batch.sheets.length > 1 && (
                <label className="block"><span className="text-xs text-slate-500">Aba</span>
                  <select className="input" aria-label="Aba" value={batch.sheet} disabled={reparse.isPending} onChange={e => reparse.mutate({ sheet: Number(e.target.value) })}>
                    {batch.sheets.map((s, i) => <option key={i} value={i}>{s}</option>)}
                  </select></label>
              )}
              <label className="block min-w-0"><span className="text-xs text-slate-500">Linha dos títulos</span>
                <select className="input max-w-[16rem]" aria-label="Linha dos títulos" value={batch.header_row} disabled={reparse.isPending} onChange={e => reparse.mutate({ header_row: Number(e.target.value) })}>
                  {batch.header_candidates.map(c => <option key={c.index} value={c.index}>Linha {c.line}: {c.preview.slice(0, 40) || '(vazia)'}</option>)}
                </select></label>
            </div>

            <section>
              <h3 className="font-medium text-slate-800 mb-1">O que é cada coluna <span className="text-xs font-normal text-slate-500">({used} de {batch.headers.length} serão usadas)</span></h3>
              <ul className="rounded-lg border divide-y" data-testid="import-colunas">
                {batch.headers.map((h, i) => {
                  const samples = batch.sample.map(r => r[i]).filter(Boolean).slice(0, 3)
                  return (
                    <li key={i} className="p-2.5 grid sm:grid-cols-[minmax(0,1fr)_14rem] gap-2 items-center">
                      <div className="min-w-0">
                        <div className="font-medium text-slate-800 truncate">{h || <em className="text-slate-400">(sem título)</em>}</div>
                        <div className="text-xs text-slate-500 truncate">{samples.join(' · ') || 'vazia'}</div>
                      </div>
                      <div>
                        <select className="input" aria-label={`Destino da coluna ${h || i + 1}`} value={mapping[i] ?? 'ignore'} onChange={e => setTarget(i, e.target.value)}>
                          {targets.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                        </select>
                        {mapping[i] !== 'ignore' && vias[i] && <div className="text-[11px] text-slate-400 mt-0.5">{VIA_LABEL[vias[i]!]}</div>}
                      </div>
                    </li>
                  )
                })}
              </ul>
              {!canPreview && <p className="text-xs text-amber-700 mt-1">Escolha ao menos uma coluna de nome, telefone, e-mail ou CPF/CNPJ.</p>}
            </section>

            <section className="grid sm:grid-cols-2 gap-3">
              <label className="block"><span className="text-xs text-slate-500">Etapa dos novos leads</span>
                <select className="input" aria-label="Etapa" value={opts.stage ?? ''} onChange={e => setOpts(o => ({ ...o, stage: e.target.value }))}>
                  {stages.map(s => <option key={s.stage_key} value={s.stage_key}>{s.label}</option>)}
                </select></label>
              {me?.role === 'admin' && (
                <label className="block"><span className="text-xs text-slate-500">Responsável</span>
                  <select className="input" aria-label="Responsável" value={opts.assigned_user_id ?? ''} onChange={e => setOpts(o => ({ ...o, assigned_user_id: e.target.value || undefined }))}>
                    <option value="">Eu mesmo</option>
                    {users.filter(u => u.active).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select></label>
              )}
              {ownScope && <p className="text-xs text-slate-500 self-end pb-2">Os leads importados ficam atribuídos a você.</p>}
              <label className="block"><span className="text-xs text-slate-500">Se o lead já existir (mesmo CPF/CNPJ, e-mail ou telefone)</span>
                <select className="input" aria-label="Duplicados" value={opts.on_duplicate} onChange={e => setOpts(o => ({ ...o, on_duplicate: e.target.value as ImportOptions['on_duplicate'] }))}>
                  <option value="skip">Pular (não mexer no que existe)</option>
                  <option value="merge">Completar só os campos vazios</option>
                  <option value="create">Criar mesmo assim</option>
                </select></label>
              <label className="block"><span className="text-xs text-slate-500">Origem (opcional)</span>
                <input className="input" aria-label="Origem" maxLength={100} placeholder="ex.: Lista Feira 2026" value={opts.source ?? ''} onChange={e => setOpts(o => ({ ...o, source: e.target.value }))} /></label>
              <label className="block"><span className="text-xs text-slate-500">DDD padrão (para telefones sem DDD)</span>
                <input className="input" aria-label="DDD padrão" inputMode="numeric" maxLength={2} placeholder="ex.: 51" value={opts.default_ddd ?? ''} onChange={e => setOpts(o => ({ ...o, default_ddd: e.target.value.replace(/\D/g, '') }))} /></label>
              <label className="flex items-center gap-2 self-end pb-2"><input type="checkbox" checked={opts.proper_names !== false} onChange={e => setOpts(o => ({ ...o, proper_names: e.target.checked }))} /> <span>Ajustar nomes TODOS EM MAIÚSCULAS</span></label>
            </section>
          </>)}

          {/* ───────── 3. PRÉVIA ───────── */}
          {step === 'previa' && prev && (<>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" data-testid="import-stats">
              {[
                ['Novos', prev.stats.novos, 'text-emerald-700'], ['Completar existentes', prev.stats.atualizar, 'text-sky-700'],
                ['Duplicados', prev.stats.duplicadas_crm + prev.stats.duplicadas_arquivo, 'text-amber-700'], ['Recusadas', prev.stats.erros, 'text-red-700'],
              ].map(([l, n, c]) => (
                <div key={l as string} className="rounded-lg border p-3"><div className={`text-2xl font-semibold ${c}`}>{(n as number).toLocaleString('pt-BR')}</div><div className="text-xs text-slate-500">{l}</div></div>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              {prev.stats.total.toLocaleString('pt-BR')} linhas lidas
              {prev.stats.vazias ? ` · ${prev.stats.vazias} vazias` : ''}{prev.stats.exemplo ? ` · ${prev.stats.exemplo} de exemplo ignoradas` : ''}
              {prev.stats.com_aviso ? ` · ${prev.stats.com_aviso} com avisos` : ''}
            </p>
            {prev.limit.exceeded && (
              <div role="alert" className="rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2">
                O plano {prev.limit.plan} permite {prev.limit.max} leads e você já tem {prev.limit.current}. Esta importação criaria {prev.limit.creating}. Remova linhas da planilha ou faça upgrade.
              </div>
            )}
            {prev.truncated && <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2">A planilha passa do limite: só as primeiras {batch?.max_rows.toLocaleString('pt-BR')} linhas serão importadas.</div>}
            {prev.fields_to_create.length > 0 && (
              <div className="rounded-lg bg-sky-50 border border-sky-200 text-sky-800 px-3 py-2">
                Serão criados campos personalizados: <strong>{prev.fields_to_create.join(', ')}</strong>. Aparecem na ficha de cada lead.
              </div>
            )}

            <div className="flex gap-2 text-xs">
              <button className={`px-2.5 py-1 rounded-full border ${!onlyProblems ? 'bg-brand-50 border-brand-300 text-brand-700' : ''}`} onClick={() => setOnlyProblems(false)}>Primeiras {prev.rows.length} linhas</button>
              <button className={`px-2.5 py-1 rounded-full border ${onlyProblems ? 'bg-brand-50 border-brand-300 text-brand-700' : ''}`} onClick={() => setOnlyProblems(true)}>Só com problemas ({prev.problems.length}{prev.problems.length >= 300 ? '+' : ''})</button>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs" data-testid="import-previa">
                <thead className="bg-slate-50 text-slate-500 text-left"><tr>
                  <th className="p-2">Linha</th><th className="p-2">Situação</th><th className="p-2">Nome</th><th className="p-2">CPF/CNPJ</th><th className="p-2">Telefone</th><th className="p-2">E-mail</th><th className="p-2">Cidade</th>
                </tr></thead>
                <tbody className="divide-y">
                  {rows.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-slate-400">Nenhuma linha para mostrar.</td></tr>}
                  {rows.map(r => (
                    <tr key={r.line} className="align-top">
                      <td className="p-2 text-slate-400">{r.line}</td>
                      <td className="p-2 min-w-[9rem]">
                        <span className={`px-1.5 py-0.5 rounded ${STATUS_LABEL[r.status].c}`}>{STATUS_LABEL[r.status].t}</span>
                        {r.motivo && <div className="text-slate-500 mt-0.5">{r.motivo}</div>}
                        {r.issues.map((x, i) => <div key={i} className="text-amber-700 mt-0.5">{x}</div>)}
                      </td>
                      <td className="p-2">{r.name || '—'}</td><td className="p-2 whitespace-nowrap">{r.document || '—'}</td>
                      <td className="p-2 whitespace-nowrap">{r.phone || '—'}</td><td className="p-2 break-all">{r.email || '—'}</td><td className="p-2">{r.city || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>)}

          {/* ───────── 4. RESULTADO ───────── */}
          {step === 'fim' && result && (
            <div className="text-center py-4 space-y-3" data-testid="import-resultado">
              {undone ? (<>
                <Undo2 className="w-10 h-10 mx-auto text-slate-400" />
                <h3 className="text-lg font-semibold text-slate-900">Importação desfeita</h3>
                <p className="text-slate-600">{undone.removidos} leads removidos{undone.mantidos ? `; ${undone.mantidos} foram mantidos por já terem processo ou tarefa` : ''}.</p>
              </>) : (<>
                <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-600" />
                <h3 className="text-lg font-semibold text-slate-900">Importação concluída</h3>
                <p className="text-slate-700"><strong>{result.criados}</strong> leads criados{result.atualizados ? <>, <strong>{result.atualizados}</strong> completados</> : null}.</p>
                <p className="text-xs text-slate-500">
                  {result.duplicadas_crm + result.duplicadas_arquivo > 0 && `${result.duplicadas_crm + result.duplicadas_arquivo} duplicados pulados · `}
                  {result.erros > 0 && `${result.erros} linhas recusadas · `}
                  {result.campos_criados.length > 0 && `campos criados: ${result.campos_criados.join(', ')}`}
                </p>
                <div className="flex flex-wrap justify-center gap-3 text-sm">
                  {result.problemas > 0 && <button className="btn-secondary text-sm" onClick={() => download(leadImportApi.problems(result.id))}><Download className="w-4 h-4" /> Baixar linhas com problema</button>}
                  <button className="btn-secondary text-sm text-red-600" disabled={undo.isPending} onClick={() => askUndo(result.id, 'esta lista')}><Undo2 className="w-4 h-4" /> Desfazer importação</button>
                </div>
              </>)}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-3 border-t">
          <div>
            {step === 'colunas' && <button className="btn-ghost text-sm" onClick={() => { if (batch) leadImportApi.undo(batch.id).catch(() => {}); setBatch(null); setStep('inicio'); refetchHistory() }}><ArrowLeft className="w-4 h-4" /> Trocar arquivo</button>}
            {step === 'previa' && <button className="btn-ghost text-sm" onClick={() => setStep('colunas')}><ArrowLeft className="w-4 h-4" /> Ajustar colunas</button>}
          </div>
          <div className="flex gap-2">
            {step === 'colunas' && <button className="btn-primary text-sm" disabled={!canPreview || preview.isPending || reparse.isPending} onClick={() => preview.mutate()}>{preview.isPending ? 'Analisando…' : 'Ver prévia'}</button>}
            {step === 'previa' && prev && <button className="btn-primary text-sm" data-testid="import-confirmar" disabled={commit.isPending || prev.limit.exceeded || prev.stats.novos + prev.stats.atualizar === 0} onClick={() => commit.mutate()}>
              {commit.isPending ? 'Importando…' : `Importar ${(prev.stats.novos + prev.stats.atualizar).toLocaleString('pt-BR')} leads`}</button>}
            {(step === 'inicio' || step === 'fim') && <button className="btn-secondary text-sm" onClick={close}>Fechar</button>}
          </div>
        </div>
      </div>
    </div>
  )
}
