import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ExternalLink, Copy, Check, Plus, Trash2, CheckCircle2, Circle, Video, Sparkles, CalendarPlus, Wand2, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import { casesApi, leadsApi, tasksApi, type Task } from '../api'
import { EditableCell } from '../components/crm'
import EventForm from '../components/EventForm'
import { useChat } from '../context/ChatContext'
import { CASE_STATUSES, caseStatus, EVENT_TYPES, fmtDate, fmtTime } from '../lib/cases'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] items-center gap-2 py-1.5 border-b last:border-0">
      <dt className="text-sm text-slate-500">{label}</dt><dd className="min-w-0">{children}</dd>
    </div>
  )
}

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { setOpen } = useChat()
  const [copied, setCopied] = useState(false)
  const [updText, setUpdText] = useState('')
  const [updDate, setUpdDate] = useState(new Date().toISOString().slice(0, 10))
  const [dlText, setDlText] = useState('')
  const [dlDate, setDlDate] = useState('')
  const [showEvent, setShowEvent] = useState(false)
  const [error, setError] = useState('')
  const [newClient, setNewClient] = useState('')

  const { data: c, isLoading } = useQuery({ queryKey: ['case', id], queryFn: () => casesApi.getById(id!), enabled: !!id })
  const { data: leads } = useQuery({ queryKey: ['leads', 'board'], queryFn: () => leadsApi.list({ limit: 500 }), staleTime: 30_000 })

  const refresh = () => { qc.invalidateQueries({ queryKey: ['case', id] }); qc.invalidateQueries({ queryKey: ['cases'] }); qc.invalidateQueries({ queryKey: ['tasks'] }); qc.invalidateQueries({ queryKey: ['events'] }) }
  const fail = (e: any) => setError(e?.response?.data?.error || 'Não foi possível salvar.')
  const update = useMutation({ mutationFn: (d: Record<string, unknown>) => casesApi.update(id!, d), onSuccess: () => { setError(''); refresh() }, onError: fail })
  const createClient = useMutation({
    mutationFn: async (name: string) => { const l = await leadsApi.create({ name, stage: 'convertido' }); return casesApi.update(id!, { lead_id: l.id }) },
    onSuccess: () => { setNewClient(''); setError(''); qc.invalidateQueries({ queryKey: ['leads'] }); refresh() }, onError: fail,
  })
  const addUpd = useMutation({ mutationFn: () => casesApi.addUpdate(id!, { text: updText.trim(), update_date: updDate }), onSuccess: () => { setUpdText(''); refresh() }, onError: fail })
  const delUpd = useMutation({ mutationFn: (uid: string) => casesApi.deleteUpdate(id!, uid), onSuccess: refresh })
  const addDeadline = useMutation({
    mutationFn: () => tasksApi.create({ description: dlText.trim(), due_date: new Date(dlDate + 'T23:59:00').toISOString(), case_id: id, is_deadline: true }),
    onSuccess: () => { setDlText(''); setDlDate(''); refresh() }, onError: fail,
  })
  const done = useMutation({ mutationFn: (t: Task) => leadsApi.completeTask(t.lead_id || 'sem-lead', t.id), onSuccess: refresh })

  if (isLoading) return <div className="p-6 text-slate-400">Carregando…</div>
  if (!c) return <div className="p-6 text-red-500">Processo não encontrado.</div>
  const st = caseStatus(c.status)

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <button onClick={() => navigate('/processos')} className="btn-ghost p-1.5" title="Voltar"><ArrowLeft className="w-4 h-4" /></button>
        <span className={clsx('w-1 h-10 rounded-full', st.bar)} />
        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-slate-900 font-mono">{c.case_number || c.title || 'Processo sem número'}</h1>
            {c.case_number && (
              <button title="Copiar número" className="text-slate-400 hover:text-brand-600" onClick={() => { navigator.clipboard?.writeText(c.case_number!); setCopied(true); setTimeout(() => setCopied(false), 1200) }}>
                {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
              </button>
            )}
          </div>
          <p className="text-sm text-slate-500">
            {c.tribunal_name || c.tribunal || 'Tribunal não identificado'}
            {c.case_number && c.number_valid === false && <span className="ml-2 text-amber-600"><AlertTriangle className="w-3.5 h-3.5 inline -mt-0.5" /> dígito verificador não confere</span>}
          </p>
        </div>
        <select aria-label="Status" value={c.status} onChange={e => update.mutate({ status: e.target.value })}
          className={clsx('text-sm font-medium px-3 py-1.5 rounded-lg border-0 cursor-pointer', st.pill)}>
          {CASE_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label.replace(/s$/, '')}</option>)}
        </select>
        {c.court_url
          ? <a href={c.court_url} target="_blank" rel="noreferrer" className="btn-primary"><ExternalLink className="w-4 h-4" /> Abrir no tribunal</a>
          : null}
        <button className="btn-secondary text-sm" onClick={() => setOpen(true)}><Sparkles className="w-4 h-4 text-accent-500" /> Pedir à IA</button>
      </div>
      {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

      <div className="grid md:grid-cols-2 gap-5">
        <div className="card p-5">
          <h2 className="font-medium text-slate-900 mb-2">Dados do processo</h2>
          <dl>
            <Row label="Título"><EditableCell value={c.title} placeholder="Apelido interno" onSave={v => update.mutate({ title: v })} /></Row>
            <Row label="Nº CNJ"><EditableCell value={c.case_number} placeholder="0000000-00.0000.0.00.0000" className="font-mono" onSave={v => update.mutate({ case_number: v })} /></Row>
            <Row label="Link do tribunal">
              <EditableCell value={c.court_url} placeholder="Cole o link do processo" onSave={v => update.mutate({ court_url: v })} />
              {!c.court_url && c.suggested_url && (
                <button className="ml-1.5 mt-1 text-xs text-brand-700 hover:underline flex items-center gap-1" onClick={() => update.mutate({ court_url: c.suggested_url })}>
                  <Wand2 className="w-3 h-3" /> Usar link sugerido ({c.tribunal})
                </button>
              )}
              {!c.court_url && !c.suggested_url && <p className="ml-1.5 mt-1 text-xs text-slate-400">Cole o link da consulta do {c.tribunal || 'tribunal'} (a sugestão automática só existe para alguns tribunais).</p>}
            </Row>
            <Row label="Cliente">
              <select className="input !py-1 !text-sm" value={c.lead_id || ''} onChange={e => update.mutate({ lead_id: e.target.value || null })}>
                <option value="">— sem cliente —</option>
                {leads?.data.map(l => <option key={l.id} value={l.id}>{l.name || 'Sem nome'}</option>)}
              </select>
              {c.lead_id ? (
                <div className="mt-1.5 text-xs text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-1">
                  <Link to={`/leads/${c.lead_id}`} className="text-brand-700 hover:underline font-medium">Abrir cliente</Link>
                  {c.lead_phone && <>
                    <a href={`tel:${c.lead_phone}`} className="hover:underline">{c.lead_phone}</a>
                    <a href={`https://wa.me/${c.lead_phone.replace(/\D/g, '').replace(/^(?!55)/, '55')}`} target="_blank" rel="noreferrer" className="text-green-700 hover:underline">WhatsApp</a>
                  </>}
                  {c.lead_email && <a href={`mailto:${c.lead_email}`} className="hover:underline break-all">{c.lead_email}</a>}
                  {!c.lead_phone && !c.lead_email && <span className="text-slate-400">sem telefone/e-mail cadastrado</span>}
                </div>
              ) : (
                <form className="mt-1.5 flex gap-2" onSubmit={e => { e.preventDefault(); if (newClient.trim()) createClient.mutate(newClient.trim()) }}>
                  <input className="input !py-1 !text-sm" placeholder="ou crie um cliente novo: nome" value={newClient} onChange={e => setNewClient(e.target.value)} />
                  <button className="btn-secondary !py-1 text-xs shrink-0" disabled={!newClient.trim() || createClient.isPending}>Criar</button>
                </form>
              )}
            </Row>
            <Row label="Área"><EditableCell value={c.area} placeholder="Ex: Trabalhista" onSave={v => update.mutate({ area: v })} /></Row>
            <Row label="Fase"><EditableCell value={c.phase} placeholder="Ex: Conhecimento" onSave={v => update.mutate({ phase: v })} /></Row>
            <Row label="Polo do cliente"><EditableCell value={c.client_role} placeholder="autor, réu…" onSave={v => update.mutate({ client_role: v })} /></Row>
            <Row label="Parte contrária"><EditableCell value={c.opposing_party} placeholder="Adicionar" onSave={v => update.mutate({ opposing_party: v })} /></Row>
            <Row label="Valor da causa"><EditableCell type="number" value={c.cause_value} placeholder="R$ 0,00" onSave={v => update.mutate({ cause_value: v })} /></Row>
          </dl>
        </div>

        <div className="space-y-5">
          <div className="card p-5">
            <h2 className="font-medium text-slate-900 mb-3">Prazos</h2>
            <form className="flex gap-2 mb-3" onSubmit={e => { e.preventDefault(); if (dlText.trim() && dlDate) addDeadline.mutate() }}>
              <input className="input flex-1" placeholder="Novo prazo (ex: réplica)" value={dlText} onChange={e => setDlText(e.target.value)} />
              <input type="date" className="input !w-36" value={dlDate} onChange={e => setDlDate(e.target.value)} />
              <button className="btn-primary !px-3" disabled={!dlText.trim() || !dlDate}><Plus className="w-4 h-4" /></button>
            </form>
            {c.tasks.length === 0 ? <p className="text-sm text-slate-400">Nenhum prazo ou tarefa neste processo.</p> : (
              <ul className="divide-y">
                {c.tasks.map(t => (
                  <li key={t.id} className="flex items-center gap-2.5 py-2">
                    <button onClick={() => !t.completed_at && done.mutate(t)} disabled={!!t.completed_at}>
                      {t.completed_at ? <CheckCircle2 className="w-5 h-5 text-green-500" /> : <Circle className="w-5 h-5 text-slate-300 hover:text-green-500" />}
                    </button>
                    <span className={clsx('flex-1 text-sm', t.completed_at ? 'line-through text-slate-400' : 'text-slate-800')}>{t.description}</span>
                    {t.is_deadline ? <span className="badge bg-amber-100 text-amber-700 !py-0">Prazo</span> : null}
                    <span className="text-xs text-slate-500">{fmtDate(t.due_date)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium text-slate-900">Compromissos</h2>
              <button className="btn-secondary !py-1 text-xs" onClick={() => setShowEvent(true)}><CalendarPlus className="w-3.5 h-3.5" /> Agendar</button>
            </div>
            {c.events.length === 0 ? <p className="text-sm text-slate-400">Nenhuma reunião ou audiência.</p> : (
              <ul className="divide-y">
                {c.events.map(e => (
                  <li key={e.id} className="flex items-center gap-2 py-2 text-sm">
                    <span className={clsx('badge !py-0', EVENT_TYPES[e.type].pill)}>{EVENT_TYPES[e.type].label}</span>
                    <span className="flex-1 truncate text-slate-800">{e.title}</span>
                    <span className="text-xs text-slate-500">{fmtDate(e.starts_at)} {fmtTime(e.starts_at)}</span>
                    {e.meeting_url && <a href={e.meeting_url} target="_blank" rel="noreferrer" className="text-brand-600" title="Entrar na reunião"><Video className="w-4 h-4" /></a>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      <div className="card p-5 mt-5">
        <h2 className="font-medium text-slate-900 mb-3">Andamentos ({c.updates.length})</h2>
        <form className="flex gap-2 mb-4" onSubmit={e => { e.preventDefault(); if (updText.trim()) addUpd.mutate() }}>
          <input type="date" className="input !w-40" value={updDate} onChange={e => setUpdDate(e.target.value)} />
          <input className="input flex-1" placeholder="Registrar andamento (ex: Juntada de contestação)" value={updText} onChange={e => setUpdText(e.target.value)} />
          <button className="btn-primary" disabled={!updText.trim() || addUpd.isPending}><Plus className="w-4 h-4" /> Registrar</button>
        </form>
        {c.updates.length === 0 ? <p className="text-sm text-slate-400">Nenhum andamento registrado ainda. Em breve o sistema poderá trazê-los do tribunal automaticamente.</p> : (
          <ol className="border-l-2 border-accent-300 ml-1.5 space-y-3">
            {c.updates.map(u => (
              <li key={u.id} className="group pl-4 relative">
                <span className="absolute -left-[7px] top-1.5 w-3 h-3 rounded-full bg-accent-400 border-2 border-white" />
                <p className="text-xs text-slate-400">{fmtDate(u.update_date.slice(0, 10) + 'T12:00:00')}{u.source !== 'manual' && ` · via ${u.source === 'ai_chat' ? 'IA' : u.source}`}</p>
                <div className="flex gap-2">
                  <p className="flex-1 text-sm text-slate-800 whitespace-pre-wrap">{u.text}</p>
                  <button onClick={() => delUpd.mutate(u.id)} title="Excluir" className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
      <p className="mt-4 text-xs text-slate-400"><Link to="/processos" className="underline">Voltar aos processos</Link></p>
      {showEvent && <EventForm onClose={() => setShowEvent(false)} caseId={c.id} leadId={c.lead_id || undefined} />}
    </div>
  )
}
