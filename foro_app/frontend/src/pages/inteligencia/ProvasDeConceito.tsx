import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { FlaskConical, CheckCircle2, Circle, ArrowRight } from 'lucide-react'
import { quizzesApi } from '../../api'

export default function ProvasDeConceito() {
  const { data: quizzes = [], isLoading } = useQuery({ queryKey: ['quizzes-available'], queryFn: quizzesApi.listAvailable })

  // Agrupa por trilha, só pra organizar a lista visualmente.
  const byTrilha = quizzes.reduce<Record<string, { trilha_title: string; items: typeof quizzes }>>((acc, q) => {
    if (!acc[q.trilha_id]) acc[q.trilha_id] = { trilha_title: q.trilha_title, items: [] }
    acc[q.trilha_id].items.push(q)
    return acc
  }, {})

  return (
    <div className="p-6 animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-accent-500" />
          Provas de conceito
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Pequenos testes pra reforçar o que você viu em Educação — cada um vale pontos na primeira vez que você passa.
        </p>
      </div>

      {isLoading && <p className="text-sm text-slate-400">Carregando...</p>}

      {!isLoading && quizzes.length === 0 && (
        <div className="card p-8 text-center">
          <FlaskConical className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Nenhuma prova de conceito publicada ainda.</p>
        </div>
      )}

      <div className="space-y-6 max-w-2xl">
        {Object.values(byTrilha).map(group => (
          <div key={group.trilha_title}>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{group.trilha_title}</p>
            <div className="card divide-y">
              {group.items.map(q => (
                <Link
                  key={q.quiz_id}
                  to={`/provas-de-conceito/${q.aula_id}`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors first:rounded-t-xl last:rounded-b-xl"
                >
                  {q.best_passed ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-slate-300 shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{q.title}</p>
                    <p className="text-xs text-slate-500">
                      {q.aula_title}
                      {q.best_passed && q.best_score_pct != null && <> · aprovado com {q.best_score_pct}%</>}
                    </p>
                  </div>
                  <span className="badge bg-accent-100 text-accent-700 shrink-0">+{q.points_awarded} pts</span>
                  <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
