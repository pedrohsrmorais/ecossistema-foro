import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { ArrowLeft, FlaskConical, CheckCircle2, XCircle, Sparkles } from 'lucide-react'
import { quizzesApi, QuizAttemptResult } from '../../api'

export default function QuizTake() {
  const { aulaId } = useParams<{ aulaId: string }>()
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<QuizAttemptResult | null>(null)

  const { data: quiz, isLoading } = useQuery({
    queryKey: ['quiz-for-aula', aulaId],
    queryFn: () => quizzesApi.getForAula(aulaId!),
    enabled: !!aulaId,
  })

  const submitMutation = useMutation({
    mutationFn: () => quizzesApi.submitAttempt(quiz!.id, Object.entries(answers).map(([question_id, option_id]) => ({ question_id, option_id }))),
    onSuccess: setResult,
  })

  if (isLoading) return <div className="p-6 text-sm text-slate-400">Carregando...</div>

  if (!quiz) {
    return (
      <div className="p-6 max-w-2xl">
        <Link to="/provas-de-conceito" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-4">
          <ArrowLeft className="w-4 h-4" /> Provas de conceito
        </Link>
        <div className="card p-8 text-center">
          <FlaskConical className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Essa aula ainda não tem uma prova de conceito.</p>
        </div>
      </div>
    )
  }

  const allAnswered = quiz.questions.every(q => answers[q.id])

  return (
    <div className="p-6 max-w-2xl animate-fade-in">
      <Link to="/provas-de-conceito" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Provas de conceito
      </Link>

      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-accent-500" />
          {quiz.title}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Acerte pelo menos {quiz.passing_score_pct}% das perguntas pra ganhar {quiz.points_awarded} pontos.
          {quiz.best_attempt?.passed && <> Você já passou nessa prova antes (melhor nota: {quiz.best_attempt.score_pct}%) — pode refazer, mas os pontos só valem uma vez.</>}
        </p>
      </div>

      {result ? (
        <div className={`card p-6 text-center animate-scale-in ${result.passed ? 'bg-green-50/50 border-green-200' : 'bg-amber-50/50 border-amber-200'}`}>
          {result.passed ? (
            <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-3" />
          ) : (
            <XCircle className="w-10 h-10 text-amber-600 mx-auto mb-3" />
          )}
          <h2 className="font-semibold text-slate-900 mb-1">
            {result.passed ? 'Você passou!' : 'Quase lá'}
          </h2>
          <p className="text-sm text-slate-600 mb-3">
            {result.correct_count} de {result.total_questions} corretas ({result.score_pct}%)
          </p>
          {result.points_awarded > 0 && (
            <p className="badge bg-accent-100 text-accent-700 inline-flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> +{result.points_awarded} pontos
            </p>
          )}
          <div className="mt-4">
            <button
              onClick={() => { setResult(null); setAnswers({}) }}
              className="btn-secondary"
            >
              Tentar de novo
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={e => { e.preventDefault(); submitMutation.mutate() }} className="space-y-4">
          {quiz.questions.map((q, i) => (
            <div key={q.id} className="card p-4">
              <p className="text-sm font-medium text-slate-900 mb-3">{i + 1}. {q.prompt}</p>
              <div className="space-y-1.5">
                {q.options.map(opt => (
                  <label key={opt.id} className="flex items-center gap-2.5 px-3 py-2 rounded-lg border cursor-pointer hover:bg-slate-50 has-[:checked]:bg-brand-50 has-[:checked]:border-brand-300">
                    <input
                      type="radio"
                      name={q.id}
                      value={opt.id}
                      checked={answers[q.id] === opt.id}
                      onChange={() => setAnswers(a => ({ ...a, [q.id]: opt.id }))}
                      className="accent-brand-600"
                    />
                    <span className="text-sm text-slate-700">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
          <button type="submit" className="btn-primary" disabled={!allAnswered || submitMutation.isPending}>
            {submitMutation.isPending ? 'Enviando...' : 'Enviar respostas'}
          </button>
        </form>
      )}
    </div>
  )
}
