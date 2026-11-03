import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, X, Check } from 'lucide-react'
import clsx from 'clsx'
import { leadsApi, casesApi, type BoardColumn, type BoardCell, type User } from '../../api'
import { colorOf } from '../../lib/boards'
import Popover from './Popover'

interface Props { col: BoardColumn; value: BoardCell; canEdit: boolean; users: User[]; onChange: (v: BoardCell) => void }

const cellInput = 'w-full bg-transparent px-2 py-1.5 text-sm outline-none rounded focus:bg-white focus:ring-2 focus:ring-brand-300 disabled:cursor-default'

/** Texto/número/link com edição direta: grava ao sair do campo ou com Enter. */
function TextLike({ type, value, canEdit, onChange, placeholder }: { type: 'text' | 'number' | 'link'; value: BoardCell; canEdit: boolean; onChange: (v: BoardCell) => void; placeholder?: string }) {
  const initial = value == null ? '' : String(value)
  const [v, setV] = useState(initial)
  useEffect(() => setV(initial), [initial])
  const commit = () => { if (v.trim() !== initial) onChange(v.trim() === '' ? null : v.trim()) }
  return (
    <div className="flex items-center">
      <input className={cellInput} type={type === 'number' ? 'number' : 'text'} step="any" value={v} disabled={!canEdit} placeholder={canEdit ? placeholder : ''}
        inputMode={type === 'number' ? 'decimal' : undefined}
        onChange={e => setV(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setV(initial); (e.target as HTMLInputElement).blur() } }} />
      {type === 'link' && initial && /^https?:\/\//i.test(initial) && (
        <a href={initial} target="_blank" rel="noopener noreferrer" className="px-1 text-slate-400 hover:text-brand-600" title="Abrir link"><ExternalLink className="w-3.5 h-3.5" /></a>
      )}
    </div>
  )
}

function StatusCell({ col, value, canEdit, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const opts = col.settings?.options || []
  const cur = opts.find(o => o.id === value)
  return (
    <>
      <button ref={btn} disabled={!canEdit} onClick={() => setOpen(o => !o)} data-testid="status-cell"
        className={clsx('w-full h-full min-h-[2rem] px-2 text-sm font-medium truncate', cur ? colorOf(cur.color).solid : 'bg-slate-100 text-slate-400', canEdit && 'hover:opacity-90')}>
        {cur ? cur.label : canEdit ? '—' : ''}
      </button>
      {open && (
        <Popover anchor={btn.current} onClose={() => setOpen(false)} width={190}>
          {opts.map(o => (
            <button key={o.id} role="menuitem" className="w-full px-2 py-1 flex" onClick={() => { onChange(o.id); setOpen(false) }}>
              <span className={clsx('flex-1 text-center rounded px-2 py-1 text-sm font-medium', colorOf(o.color).solid)}>{o.label}</span>
            </button>
          ))}
          {cur && <button role="menuitem" className="w-full text-left px-3 py-1.5 text-slate-500 hover:bg-slate-50" onClick={() => { onChange(null); setOpen(false) }}>Limpar</button>}
        </Popover>
      )}
    </>
  )
}

function PersonCell({ value, canEdit, users, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const person = users.find(u => u.id === value)
  const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()
  return (
    <>
      <button ref={btn} disabled={!canEdit} onClick={() => setOpen(o => !o)} className={clsx('w-full flex items-center gap-2 px-2 py-1.5 text-sm text-left min-h-[2rem]', canEdit && 'hover:bg-slate-50')}>
        {person ? <><span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-[10px] font-semibold flex items-center justify-center shrink-0">{initials(person.name)}</span><span className="truncate">{person.name}</span></>
          : value ? <span className="text-slate-400">Ex-membro</span> : <span className="text-slate-300">{canEdit ? '—' : ''}</span>}
      </button>
      {open && (
        <Popover anchor={btn.current} onClose={() => setOpen(false)}>
          {users.filter(u => u.active).map(u => (
            <button key={u.id} role="menuitem" className="w-full text-left px-3 py-1.5 hover:bg-slate-50 flex items-center gap-2" onClick={() => { onChange(u.id); setOpen(false) }}>
              <span className="truncate flex-1">{u.name}</span>{u.id === value && <Check className="w-3.5 h-3.5 text-brand-600" />}
            </button>
          ))}
          {value && <button role="menuitem" className="w-full text-left px-3 py-1.5 text-slate-500 hover:bg-slate-50" onClick={() => { onChange(null); setOpen(false) }}>Limpar</button>}
        </Popover>
      )}
    </>
  )
}

/** Vínculo com contato do CRM ou processo: guarda { id, label } e leva para a ficha. */
function RefCell({ col, value, canEdit, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const btn = useRef<HTMLButtonElement>(null)
  const isLead = col.type === 'lead'
  const { data: leads } = useQuery({ queryKey: ['leads', 'board'], queryFn: () => leadsApi.list({ limit: 500 }), staleTime: 30_000, enabled: open && isLead })
  const { data: cases } = useQuery({ queryKey: ['cases', 'all'], queryFn: () => casesApi.list(), staleTime: 30_000, enabled: open && !isLead })
  const ref = value && typeof value === 'object' ? value : null
  const all: { id: string; label: string }[] = isLead
    ? (leads?.data || []).map(l => ({ id: l.id, label: l.name || 'Sem nome' }))
    : (cases?.data || []).map(c => ({ id: c.id, label: c.case_number || c.title || 'Sem título' }))
  const options = all.filter(o => o.label.toLowerCase().includes(q.toLowerCase())).slice(0, 60)
  return (
    <>
      <div className="flex items-center min-h-[2rem] px-2 gap-1">
        {ref ? <Link to={isLead ? `/crm-comercial/${ref.id}` : `/monitoramento-processual/${ref.id}`} className="text-sm text-brand-600 hover:underline truncate flex-1">{ref.label}</Link> : <span className="flex-1" />}
        {canEdit && <button ref={btn} className="text-xs text-slate-400 hover:text-brand-600 shrink-0" onClick={() => { setQ(''); setOpen(o => !o) }}>{ref ? 'trocar' : 'vincular'}</button>}
        {canEdit && ref && <button className="text-slate-300 hover:text-red-500" title="Remover vínculo" onClick={() => onChange(null)}><X className="w-3.5 h-3.5" /></button>}
      </div>
      {open && (
        <Popover anchor={btn.current} onClose={() => setOpen(false)} width={260}>
          <div className="px-2 pb-1"><input autoFocus className="input !py-1 text-sm" placeholder={isLead ? 'Buscar contato…' : 'Buscar processo…'} value={q} onChange={e => setQ(e.target.value)} /></div>
          {options.length === 0 && <p className="px-3 py-2 text-slate-400 text-xs">Nada encontrado.</p>}
          {options.map(o => <button key={o.id} role="menuitem" className="w-full text-left px-3 py-1.5 hover:bg-slate-50 truncate" onClick={() => { onChange(o.id); setOpen(false) }}>{o.label}</button>)}
        </Popover>
      )}
    </>
  )
}

export default function Cell(props: Props) {
  const { col, value, canEdit, onChange } = props
  switch (col.type) {
    case 'status': return <StatusCell {...props} />
    case 'person': return <PersonCell {...props} />
    case 'lead': case 'case': return <RefCell {...props} />
    case 'checkbox':
      return <div className="flex items-center justify-center min-h-[2rem]"><input type="checkbox" className="w-4 h-4 accent-brand-600" checked={value === true} disabled={!canEdit} onChange={e => onChange(e.target.checked ? true : null)} aria-label={col.name} /></div>
    case 'date':
      return <input type="date" className={cellInput} value={typeof value === 'string' ? value : ''} disabled={!canEdit} onChange={e => onChange(e.target.value || null)} />
    case 'number': return <TextLike type="number" value={value} canEdit={canEdit} onChange={onChange} />
    case 'link': return <TextLike type="link" value={value} canEdit={canEdit} onChange={onChange} placeholder="https://…" />
    default: return <TextLike type="text" value={value} canEdit={canEdit} onChange={onChange} />
  }
}
