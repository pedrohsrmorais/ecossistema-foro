import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '../../api'
import { ArrowLeft, Plus, Trash2, FlaskConical } from 'lucide-react'

const emptyQuestionForm = { prompt: '', optA: '', optB: '', optC: '', optD: '', correct: 'a' as string }

export default function AdminQuizDetail() {
  const { aulaId } = useParams<{ aulaId: string }>()
  const qc = useQueryClient()
  const { data: quiz, isLoading } = useQuery({
    queryKey: ['admin-quiz', aulaId],
    queryFn: () => adminApi.getQuizForAula(aulaId!),
    enabled: !!aulaId,
  })

  const [createForm, setCreateForm] = useState({ title: '', passing_score_pct: 70, points_awarded: 10 })
  const [settingsForm, setSettingsForm] = useState({ title: '', passing_score_pct: 70, points_awarded: 10 })
  const [loadedSettings, setLoadedSettings] = useState(false)
  if (quiz && !loadedSettings) {
    setSettingsForm({ title: quiz.title, passing_score_pct: quiz.passing_score_pct, points_awarded: quiz.points_awarded })
    setLoadedSettings(true)
  }

  const [showQuestionForm, setShowQuestionForm] = useState(false)
  const [questionForm, setQuestionForm] = useState(emptyQuestionForm)

  const createQuizMutation = useMutation({
    mutationFn: () => adminApi.createQuiz(aulaId!, createForm),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-quiz', aulaId] }),
  })

  const updateQuizMutation = useMutation({
    mutationFn: () => adminApi.updateQuiz(quiz!.id, settingsForm),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-quiz', aulaId] }),
  })

  const deleteQuizMutation = useMutation({
    mutationFn: () => adminApi.deleteQuiz(quiz!.id),
    onSuccess: () => { setLoadedSettings(false); qc.invalidateQueries({ queryKey: ['admin-quiz', aulaId] }) },
  })

  const addQuestionMutation = useMutation({
    mutationFn: () => {
      const options = [
        { id: 'a', label: questionForm.optA },
        { id: 'b', label: questionForm.optB },
        { id: 'c', label: questionForm.optC },
        { id: 'd', label: questionForm.optD },
      ].filter(o => o.label.trim())
      return adminApi.addQuizQuestion(quiz!.id, { prompt: questionForm.prompt, options, correct_option_id: questionForm.correct })
    },
    onSuccess: () => {
      setQuestionForm(emptyQuestionForm); setShowQuestionForm(false)
      qc.invalidateQueries({ queryKey: ['admin-quiz', aulaId] })
    },
  })

  const deleteQuestionMutation = useMutation({
    mutationFn: (questionId: string) => adminApi.deleteQuizQuestion(questionId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin-quiz', aulaId] }),
  })

  if (isLoading) return <div className="p-6 text-sm text-slate-400">Carregando...</div>

  return (
    <div className="p-6 max-w-2xl">
      <Link to="/admin/education" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Educação
      </Link>

      <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2 mb-6">
        <FlaskConical className="w-5 h-5 text-accent-500" /> Prova de conceito
      </h1>

      {!quiz ? (
        <div className="card p-5">
          <p className="text-sm text-slate-500 mb-4">Essa aula ainda não tem uma prova de conceito.</p>
          <form onSubmit={e => { e.preventDefault(); if (createForm.title.trim()) createQuizMutation.mutate() }} className="space-y-3">
            <div>
              <label className="block text-sm text-slate-600 mb-1">Título</label>
              <input className="input" value={createForm.title} onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm text-slate-600 mb-1">Nota mínima (%)</label>
                <input type="number" min={1} max={100} className="input" value={createForm.passing_score_pct} onChange={e => setCreateForm(f => ({ ...f, passing_score_pct: Number(e.target.value) }))} />
              </div>
              <div className="flex-1">
                <label className="block text-sm text-slate-600 mb-1">Pontos ao passar</label>
                <input type="number" min={1} className="input" value={createForm.points_awarded} onChange={e => setCreateForm(f => ({ ...f, points_awarded: Number(e.target.value) }))} />
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={createQuizMutation.isPending}>
              {createQuizMutation.isPending ? 'Criando...' : 'Criar prova de conceito'}
            </button>
          </form>
        </div>
      ) : (
        <>
          {/* Configurações */}
          <div className="card p-5 mb-6">
            <h2 className="font-medium text-slate-900 mb-3">Configurações</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-600 mb-1">Título</label>
                <input className="input" value={settingsForm.title} onChange={e => setSettingsForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm text-slate-600 mb-1">Nota mínima (%)</label>
                  <input type="number" min={1} max={100} className="input" value={settingsForm.passing_score_pct} onChange={e => setSettingsForm(f => ({ ...f, passing_score_pct: Number(e.target.value) }))} />
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-slate-600 mb-1">Pontos ao passar</label>
                  <input type="number" min={1} className="input" value={settingsForm.points_awarded} onChange={e => setSettingsForm(f => ({ ...f, points_awarded: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="flex items-center justify-between pt-1">
                <button onClick={() => updateQuizMutation.mutate()} className="btn-primary" disabled={updateQuizMutation.isPending}>
                  {updateQuizMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
                </button>
                <button
                  onClick={() => { if (confirm('Excluir esta prova de conceito e todas as perguntas?')) deleteQuizMutation.mutate() }}
                  className="text-sm text-red-600 hover:underline"
                >
                  Excluir prova de conceito
                </button>
              </div>
            </div>
          </div>

          {/* Perguntas */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium text-slate-900">Perguntas ({quiz.questions.length})</h2>
              <button onClick={() => setShowQuestionForm(v => !v)} className="btn-secondary">
                <Plus className="w-4 h-4" /> Nova pergunta
              </button>
            </div>

            {showQuestionForm && (
              <form
                onSubmit={e => { e.preventDefault(); if (questionForm.prompt.trim()) addQuestionMutation.mutate() }}
                className="border rounded-lg p-3 mb-4 space-y-2"
              >
                <input className="input" placeholder="Pergunta" value={questionForm.prompt} onChange={e => setQuestionForm(f => ({ ...f, prompt: e.target.value }))} />
                {(['a', 'b', 'c', 'd'] as const).map((letter, i) => {
                  const key = (['optA', 'optB', 'optC', 'optD'] as const)[i]
                  return (
                    <div key={letter} className="flex items-center gap-2">
                      <input
                        type="radio" name="correct" checked={questionForm.correct === letter}
                        onChange={() => setQuestionForm(f => ({ ...f, correct: letter }))}
                        className="accent-brand-700 shrink-0"
                      />
                      <input
                        className="input flex-1"
                        placeholder={`Alternativa ${letter.toUpperCase()}${i < 2 ? ' (obrigatória)' : ' (opcional)'}`}
                        value={questionForm[key]}
                        onChange={e => setQuestionForm(f => ({ ...f, [key]: e.target.value }))}
                      />
                    </div>
                  )
                })}
                <p className="text-xs text-slate-400">Marque com o círculo qual alternativa é a correta.</p>
                <button type="submit" className="btn-primary" disabled={addQuestionMutation.isPending}>
                  {addQuestionMutation.isPending ? 'Adicionando...' : 'Adicionar pergunta'}
                </button>
              </form>
            )}

            <div className="divide-y">
              {quiz.questions.map(q => (
                <div key={q.id} className="flex items-start justify-between py-2.5 gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-slate-900">{q.prompt}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {q.options.map(o => o.id === q.correct_option_id ? `✓ ${o.label}` : o.label).join(' · ')}
                    </p>
                  </div>
                  <button onClick={() => { if (confirm('Excluir esta pergunta?')) deleteQuestionMutation.mutate(q.id) }} className="text-slate-400 hover:text-red-600 shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              {quiz.questions.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Nenhuma pergunta ainda.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
