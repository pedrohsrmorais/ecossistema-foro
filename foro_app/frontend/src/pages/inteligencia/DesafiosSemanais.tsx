import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Trophy, CheckCircle2, Paperclip, Sparkles } from 'lucide-react'
import { challengesApi } from '../../api'

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

export default function DesafiosSemanais() {
  const qc = useQueryClient()
  const { data: challenges = [], isLoading } = useQuery({ queryKey: ['challenges'], queryFn: challengesApi.listActive })

  const completeMutation = useMutation({
    mutationFn: (id: string) => challengesApi.complete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['challenges'] }),
  })

  const pontosGanhos = challenges.filter(c => c.completed).reduce((sum, c) => sum + c.points_awarded, 0)

  return (
    <div className="p-6 animate-fade-in">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <Trophy className="w-5 h-5 text-accent-500" />
            Desafios semanais
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Conteúdo escolhido pela equipe. Marque como concluído quando terminar — é por sua conta, sem verificação.
          </p>
        </div>
        {pontosGanhos > 0 && (
          <div className="card px-4 py-2.5 text-center shrink-0">
            <p className="text-xs text-slate-500">Seus pontos</p>
            <p className="text-lg font-semibold text-accent-600">{pontosGanhos}</p>
          </div>
        )}
      </div>

      {isLoading && <p className="text-sm text-slate-400">Carregando...</p>}

      {!isLoading && challenges.length === 0 && (
        <div className="card p-8 text-center">
          <Trophy className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Nenhum desafio publicado ainda.</p>
        </div>
      )}

      <div className="space-y-3 max-w-2xl">
        {challenges.map(c => (
          <div key={c.id} className={`card p-4 ${c.completed ? 'bg-green-50/40 border-green-200' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium text-slate-900">{c.title}</p>
                  {c.is_current && <span className="badge bg-brand-100 text-brand-700">Esta semana</span>}
                </div>
                <p className="text-sm text-slate-600 whitespace-pre-line">{c.description}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                  <span>{formatDate(c.starts_at)} – {formatDate(c.ends_at)}</span>
                  {c.attachment_url && (
                    <a href={c.attachment_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                      <Paperclip className="w-3 h-3" /> Material
                    </a>
                  )}
                  <span className="inline-flex items-center gap-1 text-accent-600">
                    <Sparkles className="w-3 h-3" /> {c.points_awarded} pts
                  </span>
                </div>
              </div>
              <button
                onClick={() => completeMutation.mutate(c.id)}
                disabled={c.completed || completeMutation.isPending}
                className="btn-secondary shrink-0"
              >
                {c.completed ? (
                  <><CheckCircle2 className="w-4 h-4 text-green-600" /> Concluído</>
                ) : (
                  'Marcar como concluído'
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
