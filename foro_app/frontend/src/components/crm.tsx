import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import clsx from 'clsx'
import { useLeadStages, pillStyle } from '../lib/stages'

/** Célula editável: clique para editar, Enter/blur salva, Esc cancela (como no monday). */
export function EditableCell({ value, onSave, placeholder, bold, type = 'text', className }: {
  value: string | null; onSave: (v: string) => void; placeholder?: string; bold?: boolean; type?: string; className?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { setDraft(value ?? '') }, [value])
  useEffect(() => { if (editing) ref.current?.select() }, [editing])

  function commit() {
    setEditing(false)
    if (draft.trim() !== (value ?? '')) onSave(draft.trim())
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Enter') commit()
    if (e.key === 'Escape') { setDraft(value ?? ''); setEditing(false) }
  }

  if (editing) {
    return <input ref={ref} type={type} className={clsx('w-full px-1.5 py-1 text-sm border border-brand-500 rounded bg-white outline-none', className)}
      value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={onKey} />
  }
  return (
    <button onClick={() => setEditing(true)} title="Clique para editar"
      className={clsx('w-full text-left px-1.5 py-1 rounded truncate hover:bg-slate-100 border border-transparent hover:border-slate-200 text-sm', className,
        value ? (bold ? 'font-medium text-slate-900' : 'text-slate-700') : 'text-slate-300')}>
      {value || placeholder || '—'}
    </button>
  )
}

/** Pílula colorida da etapa; o <select> invisível por cima abre o seletor nativo. */
export function StagePill({ stage, onChange, className }: { stage: string; onChange: (s: string) => void; className?: string }) {
  const { stages, stageOf } = useLeadStages()
  const s = stageOf(stage)
  return (
    <div className={clsx('relative w-full', className)}>
      <span className="block text-center text-xs font-medium px-2 py-1 rounded-sm truncate" style={pillStyle(s.color)}>{s.label}</span>
      <select aria-label="Etapa" value={s.stage_key} onChange={e => onChange(e.target.value)}
        className="absolute inset-0 opacity-0 cursor-pointer w-full">
        {stages.map(o => <option key={o.id} value={o.stage_key}>{o.label}</option>)}
      </select>
    </div>
  )
}
