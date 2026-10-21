import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { adminApi } from '../../api'
import { Plus, GraduationCap } from 'lucide-react'

export default function AdminEducationTrilhas() {
  const queryClient = useQueryClient()
  const { data: trilhas = [], isLoading } = useQuery({ queryKey: ['admin-trilhas'], queryFn: adminApi.listTrilhas })

  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)

  const createMutation = useMutation({
    mutationFn: () => adminApi.createTrilha({ title }),
    onSuccess: () => {
      setTitle(''); setCreating(false)
      queryClient.invalidateQueries({ queryKey: ['admin-trilhas'] })
    },
  })

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-semibold text-slate-900">Educação — trilhas</h1>
        <button onClick={() => setCreating(v => !v)} className="btn-secondary">
          <Plus className="w-4 h-4" /> Nova trilha
        </button>
      </div>
      <p className="text-sm text-slate-500 mb-6">
        Conteúdo visível para todo tenant com o módulo "Educação" ativo. Trilhas/aulas começam como rascunho — publique quando estiverem prontas.
      </p>

      {creating && (
        <form
          onSubmit={e => { e.preventDefault(); if (title.trim()) createMutation.mutate() }}
          className="card p-4 mb-6 flex gap-2"
        >
          <input
            className="input" placeholder="Título da trilha" value={title}
            onChange={e => setTitle(e.target.value)} autoFocus
          />
          <button type="submit" className="btn-primary shrink-0" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Criando...' : 'Criar'}
          </button>
        </form>
      )}

      {isLoading ? (
        <p className="text-sm text-slate-400">Carregando...</p>
      ) : (
        <div className="card divide-y">
          {trilhas.map(t => (
            <Link key={t.id} to={`/admin/education/${t.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
              <div className="flex items-center gap-3">
                <GraduationCap className="w-4 h-4 text-brand-600" />
                <div>
                  <p className="text-sm font-medium text-slate-900">{t.title}</p>
                  <p className="text-xs text-slate-500">{t.total_aulas} {t.total_aulas === 1 ? 'aula' : 'aulas'}</p>
                </div>
              </div>
              <span className={`badge ${t.published ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                {t.published ? 'publicada' : 'rascunho'}
              </span>
            </Link>
          ))}
          {trilhas.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-400">Nenhuma trilha criada ainda.</p>}
        </div>
      )}
    </div>
  )
}
