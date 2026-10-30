import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ScrollText, Undo2, Bot } from 'lucide-react'
import clsx from 'clsx'
import { aiLogApi, officeApi, type AiLogRow } from '../api'

const STATUS: Record<AiLogRow['status'], { l: string; c: string }> = {
  done: { l: 'feito', c: 'bg-green-100 text-green-700' }, undone: { l: 'desfeito', c: 'bg-slate-100 text-slate-500' },
  partial: { l: 'desfeito em parte', c: 'bg-amber-100 text-amber-700' }, failed: { l: 'falhou', c: 'bg-red-100 text-red-700' },
}
const OP = { insert: 'criou', update: 'alterou', delete: 'excluiu' } as const
const LINK: Record<string, (id: string) => string> = {
  leads: id => `/leads/${id}`, cases: id => `/processos/${id}`, documents: id => `/documentos/${id}`, events: () => '/agenda', tasks: () => '/tasks',
}

export default function LogIA() {
  const qc = useQueryClient()
  const { data: office } = useQuery({ queryKey: ['office'], queryFn: officeApi.get })
  const [mine, setMine] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const { data } = useQuery({ queryKey: ['ai-log', mine], queryFn: () => aiLogApi.list({ mine: mine ? 1 : 0 }) })
  const [diag, setDiag] = useState<string | null>(null)
  const test = useMutation({
    mutationFn: aiLogApi.diagnose,
    onSuccess: r => setDiag(r.ok ? `Conexão com a IA OK (modelo ${r.model}).` : `Falhou (modelo ${r.model}): ${r.diagnosis}`),
    onError: () => setDiag('Não foi possível rodar o teste.'),
  })
  const undo = useMutation({
    mutationFn: (id: string) => aiLogApi.undo(id),
    onSuccess: r => {
      setMsg({ ok: true, t: r.undo_note || 'Ação desfeita.' })
      for (const k of ['ai-log', 'leads', 'lead', 'funnel', 'tasks', 'cases', 'case', 'events', 'documents']) qc.invalidateQueries({ queryKey: [k] })
    },
    onError: (e: any) => setMsg({ ok: false, t: e?.response?.data?.error || 'Não foi possível desfazer.' }),
  })
  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2"><ScrollText className="w-5 h-5 text-accent-500" /> Log da IA</h1>
          <p className="text-sm text-slate-500">Tudo que o assistente criou, alterou ou excluiu no CRM. Você pode desfazer cada ação.</p>
        </div>
        {office?.is_admin && <button className="btn-secondary text-sm" disabled={test.isPending} onClick={() => test.mutate()}>{test.isPending ? 'Testando…' : 'Testar conexão da IA'}</button>}
        {office?.is_admin && (
          <label className="text-sm flex items-center gap-2"><input type="checkbox" className="w-4 h-4" checked={mine} onChange={e => setMine(e.target.checked)} /> Só as minhas</label>
        )}
      </div>
      {diag && <div className={clsx('mb-3 p-2.5 rounded-lg text-sm border', diag.startsWith('Conexão') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-800')}>{diag}</div>}
      {msg && <div className={clsx('mb-3 p-2.5 rounded-lg text-sm border', msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700')}>{msg.t}</div>}
      {!data ? <div className="card p-8 text-center text-slate-400">Carregando…</div> : data.data.length === 0 ? (
        <div className="card p-10 text-center"><Bot className="w-6 h-6 mx-auto text-slate-300 mb-2" /><p className="text-slate-600">A IA ainda não fez nenhuma alteração.</p></div>
      ) : (
        <ul className="card divide-y" data-testid="ai-log">
          {data.data.map(a => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-slate-900">{a.summary}{a.op && a.status !== 'failed' && <span className="text-slate-400"> · {OP[a.op]}</span>}</p>
                <p className="text-xs text-slate-500">
                  {new Date(a.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                  {office?.is_admin && a.user_name ? ` · ${a.user_name}` : ''}
                  {a.entity && a.entity_id && a.status === 'done' && LINK[a.entity] && <> · <Link className="underline" to={LINK[a.entity](a.entity_id)}>abrir</Link></>}
                  {a.undo_note ? ` · ${a.undo_note}` : ''}
                </p>
              </div>
              <span className={clsx('badge whitespace-nowrap', STATUS[a.status].c)}>{STATUS[a.status].l}</span>
              {a.can_undo && <button className="btn-secondary text-sm" disabled={undo.isPending} onClick={() => undo.mutate(a.id)}><Undo2 className="w-4 h-4" /> Desfazer</button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
