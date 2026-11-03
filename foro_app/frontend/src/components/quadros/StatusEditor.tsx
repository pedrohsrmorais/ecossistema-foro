import { useState } from 'react'
import { X, Plus, Trash2 } from 'lucide-react'
import clsx from 'clsx'
import type { StatusOption } from '../../api'
import { BOARD_COLORS, COLOR_KEYS } from '../../lib/boards'

/** Edita as opções (nome + cor) de uma coluna de Status. */
export default function StatusEditor({ options, onSave, onClose }: { options: StatusOption[]; onSave: (o: StatusOption[]) => void; onClose: () => void }) {
  const [opts, setOpts] = useState(options.map(o => ({ ...o })))
  const set = (i: number, patch: Partial<StatusOption>) => setOpts(l => l.map((o, j) => (j === i ? { ...o, ...patch } : o)))
  const valid = opts.length > 0 && opts.every(o => o.label.trim())
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="card w-full max-w-md p-5 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()} data-testid="status-editor">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900">Opções de status</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Fechar"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-2">
          {opts.map((o, i) => (
            <div key={o.id} className="flex items-center gap-2">
              <div className="flex gap-1 shrink-0">
                {COLOR_KEYS.map(c => (
                  <button key={c} title={c} onClick={() => set(i, { color: c })} aria-label={`Cor ${c}`}
                    className={clsx('w-4 h-4 rounded-full', BOARD_COLORS[c].dot, o.color === c ? 'ring-2 ring-offset-1 ring-slate-700' : 'opacity-60 hover:opacity-100')} />
                ))}
              </div>
              <input className="input !py-1 flex-1 min-w-0" value={o.label} maxLength={40} onChange={e => set(i, { label: e.target.value })} placeholder="Nome da opção" />
              <button className="text-slate-400 hover:text-red-600 disabled:opacity-30" disabled={opts.length <= 1} onClick={() => setOpts(l => l.filter((_, j) => j !== i))} aria-label="Remover opção"><Trash2 className="w-4 h-4" /></button>
            </div>
          ))}
        </div>
        {opts.length < 12 && (
          <button className="btn-ghost text-sm mt-2" onClick={() => setOpts(l => [...l, { id: '', label: '', color: COLOR_KEYS[l.length % COLOR_KEYS.length] }])}><Plus className="w-4 h-4" /> Nova opção</button>
        )}
        <p className="text-xs text-slate-400 mt-2">Ao remover uma opção, os itens que a usavam ficam sem status.</p>
        <div className="flex justify-end gap-2 mt-4">
          <button className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={!valid} onClick={() => onSave(opts.map(o => ({ ...o, label: o.label.trim() })))}>Salvar</button>
        </div>
      </div>
    </div>
  )
}
