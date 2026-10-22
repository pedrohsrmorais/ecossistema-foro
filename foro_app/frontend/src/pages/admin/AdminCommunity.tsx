import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '../../api'
import { Users2, Sparkles, Trash2 } from 'lucide-react'

export default function AdminCommunity() {
  const qc = useQueryClient()
  const [error, setError] = useState<string | null>(null)
  const { data: posts = [], isLoading } = useQuery({ queryKey: ['admin-community-posts'], queryFn: adminApi.listCommunityPosts })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminApi.deleteCommunityPost(id),
    onSuccess: () => { setError(null); qc.invalidateQueries({ queryKey: ['admin-community-posts'] }) },
    onError: (err: any) => setError(err?.response?.data?.error || 'Erro ao remover o post.'),
  })

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Comunidade — moderação</h1>
      <p className="text-sm text-slate-500 mb-6">
        Posts recentes de todas as contas. O feed de cada escritório só mostra pra ele mesmo — isso aqui é a visão cross-tenant só da equipe intellsn.
      </p>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {isLoading ? (
        <p className="text-sm text-slate-400">Carregando...</p>
      ) : (
        <div className="card divide-y">
          {posts.map(p => (
            <div key={p.id} className={`flex items-start justify-between gap-3 px-4 py-3 ${p.kind === 'conquista' ? 'bg-accent-50/40' : ''}`}>
              <div className="flex items-start gap-3 min-w-0">
                {p.kind === 'conquista' && <Sparkles className="w-4 h-4 text-accent-500 mt-0.5 shrink-0" />}
                <div className="min-w-0">
                  <p className="text-sm text-slate-800">
                    <span className="font-medium text-slate-900">{p.user_name}</span>{' '}
                    <span className="text-slate-400">({p.account_name})</span>{' '}
                    {p.content}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{new Date(p.created_at).toLocaleString('pt-BR')}</p>
                </div>
              </div>
              <button onClick={() => { if (confirm('Remover este post?')) deleteMutation.mutate(p.id) }} className="text-slate-400 hover:text-red-600 shrink-0">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {posts.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-slate-400 flex flex-col items-center gap-2">
              <Users2 className="w-6 h-6 text-slate-300" /> Nenhum post ainda.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
