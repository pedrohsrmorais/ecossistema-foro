import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, LayoutGrid, X, Loader2, Lock } from 'lucide-react'
import clsx from 'clsx'
import { boardsApi } from '../api'
import { useCan } from '../hooks/useCan'

export default function Quadros() {
  const nav = useNavigate()
  const qc = useQueryClient()
  const canManage = useCan('boards_manage')
  const [creating, setCreating] = useState(false)
  const { data: boards = [], isLoading } = useQuery({ queryKey: ['boards'], queryFn: boardsApi.list })
  const { data: templates = [] } = useQuery({ queryKey: ['board-templates'], queryFn: boardsApi.templates, staleTime: 10 * 60_000, enabled: creating })
  const [f, setF] = useState({ name: '', template: 'basico' })
  const [error, setError] = useState('')
  const create = useMutation({
    mutationFn: () => boardsApi.create({ name: f.name.trim(), template: f.template }),
    onSuccess: b => { qc.invalidateQueries({ queryKey: ['boards'] }); nav(`/quadros/${b.id}`) },
    onError: (e: any) => setError(e?.response?.data?.error || 'Não foi possível criar o quadro.'),
  })

  return (
    <div className="p-4 sm:p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Quadros</h1>
          <p className="text-sm text-slate-500">Monte do seu jeito: colunas, status e grupos que combinam com o fluxo do escritório</p>
        </div>
        {canManage
          ? <button className="btn-primary text-sm" onClick={() => { setF({ name: '', template: 'basico' }); setError(''); setCreating(true) }} data-testid="novo-quadro"><Plus className="w-4 h-4" /> Novo quadro</button>
          : <span className="text-xs text-slate-400 flex items-center gap-1" title="O administrador do escritório define quem pode criar quadros"><Lock className="w-3.5 h-3.5" /> Só quem tem permissão cria quadros</span>}
      </div>

      {isLoading ? <div className="card p-8 text-center text-slate-400">Carregando…</div>
        : boards.length === 0 ? (
          <div className="card p-10 text-center">
            <LayoutGrid className="w-8 h-8 mx-auto text-slate-300 mb-2" />
            <p className="text-slate-600 mb-1">Nenhum quadro ainda.</p>
            <p className="text-sm text-slate-400">{canManage ? 'Crie o primeiro: acompanhamento de clientes, prazos da equipe, o que fizer sentido para o escritório.' : 'Peça ao administrador para criar ou liberar a criação de quadros.'}</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {boards.map(b => (
              <Link key={b.id} to={`/quadros/${b.id}`} data-testid="board-card" className="card p-4 hover:border-brand-400 transition-colors">
                <h3 className="font-semibold text-slate-900 truncate">{b.name}</h3>
                {b.description && <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{b.description}</p>}
                <p className="text-xs text-slate-400 mt-3">{b.items_count} {b.items_count === 1 ? 'item' : 'itens'} · {b.columns_count} {b.columns_count === 1 ? 'coluna' : 'colunas'}</p>
              </Link>
            ))}
          </div>
        )}

      {creating && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setCreating(false)}>
          <div className="card w-full max-w-lg p-5 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-900">Novo quadro</h2>
              <button onClick={() => setCreating(false)} className="text-slate-400 hover:text-slate-700" aria-label="Fechar"><X className="w-4 h-4" /></button>
            </div>
            <input className="input" placeholder="Nome do quadro (ex: Prazos da equipe)" value={f.name} maxLength={120} autoFocus onChange={e => setF(x => ({ ...x, name: e.target.value }))} />
            <p className="text-sm font-medium text-slate-700 mt-4 mb-2">Começar com</p>
            <div className="grid gap-2">
              {templates.map(t => (
                <button key={t.id} onClick={() => setF(x => ({ ...x, template: t.id }))}
                  className={clsx('text-left rounded-lg border p-3', f.template === t.id ? 'border-brand-500 bg-brand-50' : 'hover:border-slate-300')}>
                  <span className="font-medium text-slate-900 text-sm">{t.label}</span>
                  <span className="block text-xs text-slate-500 mt-0.5">{t.columns.length ? `Colunas: ${t.columns.join(', ')}` : 'Só o nome do item — você adiciona as colunas'}</span>
                </button>
              ))}
            </div>
            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            <div className="flex justify-end gap-2 mt-4">
              <button className="btn-secondary" onClick={() => setCreating(false)}>Cancelar</button>
              <button className="btn-primary" disabled={!f.name.trim() || create.isPending} onClick={() => { setError(''); create.mutate() }}>
                {create.isPending && <Loader2 className="w-4 h-4 animate-spin" />} Criar quadro
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
