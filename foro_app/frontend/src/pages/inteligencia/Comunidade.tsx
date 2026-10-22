import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users2, Trophy, Sparkles, Send, Trash2 } from 'lucide-react'
import { communityApi } from '../../api'
import { useAuth } from '../../context/AuthContext'

function timeAgo(iso: string) {
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (diffMin < 1) return 'agora'
  if (diffMin < 60) return `${diffMin}min`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `${diffH}h`
  return `${Math.round(diffH / 24)}d`
}

export default function Comunidade() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [content, setContent] = useState('')

  const { data: posts = [], isLoading } = useQuery({ queryKey: ['community-feed'], queryFn: communityApi.listFeed })
  const { data: ranking = [] } = useQuery({ queryKey: ['community-leaderboard'], queryFn: communityApi.leaderboard })

  const [error, setError] = useState<string | null>(null)

  const postMutation = useMutation({
    mutationFn: (text: string) => communityApi.createPost(text),
    onSuccess: () => { setError(null); qc.invalidateQueries({ queryKey: ['community-feed'] }); setContent('') },
    onError: (err: any) => setError(err?.response?.data?.error || 'Erro ao publicar. Tente de novo.'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => communityApi.deletePost(id),
    onSuccess: () => { setError(null); qc.invalidateQueries({ queryKey: ['community-feed'] }) },
    onError: (err: any) => setError(err?.response?.data?.error || 'Erro ao apagar a publicação.'),
  })

  return (
    <div className="p-6 animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
          <Users2 className="w-5 h-5 text-accent-500" />
          Comunidade
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Mural do seu escritório — só vocês veem o que é publicado aqui.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 max-w-4xl">
        {/* Feed */}
        <div className="flex-1 min-w-0">
          <form
            onSubmit={e => { e.preventDefault(); if (content.trim()) postMutation.mutate(content) }}
            className="card p-3 mb-4 flex items-end gap-2"
          >
            <textarea
              className="input flex-1 resize-none"
              rows={2}
              placeholder="Compartilhe algo com o escritório..."
              value={content}
              onChange={e => setContent(e.target.value)}
              maxLength={2000}
            />
            <button type="submit" className="btn-primary shrink-0" disabled={!content.trim() || postMutation.isPending}>
              <Send className="w-4 h-4" />
            </button>
          </form>

          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
          {isLoading && <p className="text-sm text-slate-400">Carregando...</p>}

          {!isLoading && posts.length === 0 && (
            <div className="card p-8 text-center">
              <Users2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm text-slate-500">Ainda não tem nada por aqui — seja o primeiro a publicar.</p>
            </div>
          )}

          <div className="space-y-2">
            {posts.map(p => (
              <div key={p.id} className={`card p-3.5 flex items-start gap-3 ${p.kind === 'conquista' ? 'bg-accent-50/50 border-accent-200' : ''}`}>
                <div className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold shrink-0 mt-0.5">
                  {p.kind === 'conquista' ? <Sparkles className="w-3.5 h-3.5 text-accent-600" /> : p.user_name.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-800">
                    <span className="font-medium text-slate-900">{p.user_name}</span>{' '}
                    {p.content}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{timeAgo(p.created_at)}</p>
                </div>
                {(p.user_id === user?.id || user?.role === 'admin') && (
                  <button
                    onClick={() => deleteMutation.mutate(p.id)}
                    className="p-1 text-slate-300 hover:text-red-500 shrink-0"
                    title="Apagar"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Ranking entre escritórios */}
        <div className="w-full lg:w-72 shrink-0">
          <div className="card p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Trophy className="w-3.5 h-3.5 text-accent-500" /> Ranking entre escritórios
            </p>
            <div className="space-y-1.5">
              {ranking.map(r => (
                <div
                  key={r.account_id}
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm ${r.is_mine ? 'bg-accent-50 font-medium text-accent-800' : 'text-slate-700'}`}
                >
                  <span className="w-5 text-xs text-slate-400 shrink-0">#{r.pos}</span>
                  <span className="flex-1 truncate">{r.is_mine ? `${r.account_name} (você)` : r.account_name}</span>
                  <span className="text-xs text-slate-500 shrink-0">{r.total_points} pts</span>
                </div>
              ))}
              {ranking.length === 0 && <p className="text-xs text-slate-400">Ninguém pontuou ainda.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
