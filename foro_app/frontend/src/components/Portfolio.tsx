import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { type Case } from '../api'
import { caseStatus, fmtDate } from '../lib/cases'

type Queue = 'all' | 'overdue' | 'deadline' | 'untracked'
type Order = 'deadline' | 'movement' | 'name'

function withinWeek(value: string | null, today: Date) {
  if (!value) return false
  const start = new Date(today)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(end.getDate() + 7)
  const date = new Date(value)
  return date >= start && date < end
}

export default function Portfolio({ rows, loading }: { rows: Case[]; loading: boolean }) {
  const [queue, setQueue] = useState<Queue>('all')
  const [order, setOrder] = useState<Order>('deadline')
  const [tribunal, setTribunal] = useState('')
  const today = new Date()
  const queues: { key: Queue; label: string; matches: (c: Case) => boolean }[] = [
    { key: 'all', label: 'Processos na lista', matches: () => true },
    { key: 'overdue', label: 'Com prazo vencido', matches: c => !!c.overdue_deadline },
    { key: 'deadline', label: 'Com prazo em 7 dias', matches: c => withinWeek(c.next_deadline, today) },
    { key: 'untracked', label: 'Sem consulta salva', matches: c => !c.tracking_checked_at },
  ]
  const tribunais = Array.from(new Set(rows.map(c => c.tribunal).filter((v): v is string => !!v))).sort()
  const visible = rows.filter(c => (!tribunal || c.tribunal === tribunal) && queues.find(q => q.key === queue)!.matches(c))
  visible.sort((a, b) => {
    if (order === 'name') return (a.title || a.case_number || '').localeCompare(b.title || b.case_number || '', 'pt-BR')
    if (order === 'movement') return (b.last_movement_at || '').localeCompare(a.last_movement_at || '')
    return (a.overdue_deadline || a.next_deadline || '9999').localeCompare(b.overdue_deadline || b.next_deadline || '9999')
  })
  if (loading) return <p role="status" className="card p-6">Carregando processos…</p>
  return <section aria-label="Triagem da carteira">
    <div className="queue-filters">{queues.map(q => <button key={q.key} aria-pressed={q.key === queue} onClick={() => setQueue(q.key)}>
      <span>{q.label}</span><strong>{rows.filter(q.matches).length}</strong>
    </button>)}</div>
    <div className="portfolio-tools">
      <h2>{queue === 'all' ? 'Todos os processos' : queues.find(q => q.key === queue)?.label}</h2>
      <label>Tribunal<select value={tribunal} onChange={e => setTribunal(e.target.value)}><option value="">Todos</option>{tribunais.map(t => <option key={t}>{t}</option>)}</select></label>
      <label>Ordenar por<select value={order} onChange={e => setOrder(e.target.value as Order)}>
        <option value="deadline">Próximo prazo</option><option value="movement">Movimentação recente</option><option value="name">Nome do processo</option>
      </select></label>
    </div>
    <div className="portfolio-list">
      <div className="portfolio-row portfolio-caption" aria-hidden><span>Processo / cliente</span><span>Última movimentação</span><span>Responsável</span><span>Próximo prazo</span><span /></div>
      {visible.map(c => <Link className="portfolio-row portfolio-record" to={'/monitoramento-processual/' + c.id} key={c.id}>
        <div><span className="process-chip">{c.tribunal || 'Tribunal a definir'}</span><strong>{c.title || c.case_number || 'Processo sem título'}</strong>
          <small>{[c.title && c.case_number, c.lead_name].filter(Boolean).join(' · ') || caseStatus(c.status).label.replace(/s$/, '')}</small></div>
        <div><span>{c.last_movement || (c.tracking_checked_at ? 'Sem movimento na consulta' : 'Sem consulta salva')}</span>
          {c.last_movement_at && <small>Movimento de {fmtDate(c.last_movement_at)}</small>}
          {c.tracking_checked_at && <small>Consultado em {fmtDate(c.tracking_checked_at)}</small>}</div>
        <div><small className="mobile-cell-label">Responsável</small>{c.responsible_name || 'A definir'}</div>
        <div><small className="mobile-cell-label">Próximo prazo</small><span className={c.overdue_deadline ? 'deadline-late' : withinWeek(c.next_deadline, today) ? 'deadline-near' : ''}>{c.overdue_deadline ? 'Vencido · ' + fmtDate(c.overdue_deadline) : c.next_deadline ? fmtDate(c.next_deadline) : 'Sem prazo'}</span></div>
        <ChevronRight size={16} aria-hidden />
      </Link>)}
      {!visible.length && <div className="portfolio-empty"><strong>Nenhum processo nesta seleção.</strong><p>Revise os filtros ou cadastre um processo pelo número CNJ ou título.</p></div>}
    </div>
  </section>
}
