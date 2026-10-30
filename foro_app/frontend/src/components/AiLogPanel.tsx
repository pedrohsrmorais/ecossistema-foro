import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Undo2, Bot } from 'lucide-react'
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

/** Log do que a IA fez, dentro do painel do assistente (aba "Log"). */
export default function AiLogPanel() {
  const qc = useQueryClient()
  const { data: office } = useQuery({ queryKey: ['office'], queryFn: officeApi.get })
  const [mine, setMine] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const [diag, setDiag] = useState<string | null>(null)
  const { data } = useQuery({ queryKey: ['ai-log', mine], queryFn: () => aiLogApi.list({ mine: mine ? 1 : 0 }) })
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
  const admin = !!office?.is_admin
  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2.5" data-testid="ai-log-panel">
      {admin && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <label className="flex items-center gap-1.5 text-slate-600"><input type="checkbox" checked={mine} onChange={e => setMine(e.target.checked)} /> Só as minhas</label>
          <button className="text-slate-500 underline" disabled={test.isPending} onClick={() => test.mutate()}>{test.isPending ? 'Testando…' : 'Testar conexão da IA'}</button>
        </div>
      )}
      {diag && <div className={clsx('p-2 rounded-lg text-xs border', diag.startsWith('Conexão') ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-800')}>{diag}</div>}
      {msg && <div className={clsx('p-2 rounded-lg text-xs border', msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700')}>{msg.t}</div>}
      {!data ? <p className="text-center text-xs text-slate-400 py-8">Carregando…</p> : data.data.length === 0 ? (
        <div className="text-center py-10"><Bot className="w-5 h-5 mx-auto text-slate-300 mb-2" /><p className="text-xs text-slate-500">A IA ainda não fez nenhuma alteração.</p></div>
      ) : (
        <ul className="space-y-2" data-testid="ai-log">
          {data.data.map(a => (
            <li key={a.id} className="border rounded-lg p-2.5 bg-white">
              <div className="flex items-start justify-between gap-2">
                <p className="text-xs text-slate-900 leading-snug">{a.summary}{a.op && a.status !== 'failed' && <span className="text-slate-400"> · {OP[a.op]}</span>}</p>
                <span className={clsx('badge whitespace-nowrap !text-[10px]', STATUS[a.status].c)}>{STATUS[a.status].l}</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                {new Date(a.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}
                {admin && a.user_name ? ` · ${a.user_name}` : ''}
                {a.entity && a.entity_id && a.status === 'done' && LINK[a.entity] && <> · <Link className="underline" to={LINK[a.entity](a.entity_id)}>abrir</Link></>}
                {a.undo_note ? ` · ${a.undo_note}` : ''}
              </p>
              {a.can_undo && (
                <button className="mt-1.5 text-xs inline-flex items-center gap-1 px-2 py-1 rounded-md border hover:bg-slate-50" disabled={undo.isPending} onClick={() => undo.mutate(a.id)}>
                  <Undo2 className="w-3 h-3" /> Desfazer
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
