import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { educationApi, quizzesApi, type Aula } from '../api'
import { ArrowLeft, CheckCircle2, Circle, PlayCircle, FlaskConical } from 'lucide-react'

function embedUrl(aula: Aula) {
  if (aula.video_provider === 'vimeo') return `https://player.vimeo.com/video/${aula.video_id}`
  if (aula.video_provider === 'youtube') return `https://www.youtube.com/embed/${aula.video_id}`
  return aula.video_id // provider 'url': usado como link direto, não embutido
}

export default function TrilhaDetail() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const { data: trilha, isLoading } = useQuery({
    queryKey: ['education-trilha', id],
    queryFn: () => educationApi.getTrilha(id!),
    enabled: !!id,
  })
  const [selectedAulaId, setSelectedAulaId] = useState<string | null>(null)

  const completeMutation = useMutation({
    mutationFn: (aulaId: string) => educationApi.updateProgress(aulaId, { completed: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['education-trilha', id] }),
  })

  const aulaAtual = trilha?.aulas.find(a => a.id === selectedAulaId) || trilha?.aulas[0]

  // Só busca se existe prova de conceito pra essa aula quando ela está selecionada
  // (evita N chamadas pra todas as aulas da trilha de uma vez).
  const { data: quiz } = useQuery({
    queryKey: ['quiz-for-aula', aulaAtual?.id],
    queryFn: () => quizzesApi.getForAula(aulaAtual!.id),
    enabled: !!aulaAtual?.id,
  })

  if (isLoading) return <div className="p-6 text-sm text-slate-400">Carregando...</div>
  if (!trilha) return null

  const aula = aulaAtual

  return (
    <div className="p-6">
      <Link to="/education" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Trilhas
      </Link>

      <h1 className="text-xl font-semibold text-slate-900 mb-1">{trilha.title}</h1>
      {trilha.description && <p className="text-sm text-slate-500 mb-6 max-w-2xl">{trilha.description}</p>}

      {trilha.aulas.length === 0 ? (
        <p className="text-sm text-slate-400">Nenhuma aula publicada nesta trilha ainda.</p>
      ) : (
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Player */}
          <div className="flex-1 min-w-0">
            {aula && (
              <>
                <div className="aspect-video bg-black rounded-lg overflow-hidden mb-4">
                  {aula.video_provider === 'url' ? (
                    <a href={embedUrl(aula)} target="_blank" rel="noreferrer" className="flex items-center justify-center h-full text-white gap-2">
                      <PlayCircle className="w-6 h-6" /> Abrir vídeo
                    </a>
                  ) : (
                    <iframe
                      key={aula.id}
                      src={embedUrl(aula)}
                      className="w-full h-full"
                      allow="autoplay; fullscreen; picture-in-picture"
                      allowFullScreen
                      title={aula.title}
                    />
                  )}
                </div>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-medium text-slate-900 mb-1">{aula.title}</h2>
                    {aula.description && <p className="text-sm text-slate-500">{aula.description}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {quiz && (
                      <Link to={`/provas-de-conceito/${aula.id}`} className="btn-secondary">
                        <FlaskConical className="w-4 h-4 text-accent-500" />
                        {quiz.best_attempt?.passed ? 'Ver prova de conceito' : 'Fazer prova de conceito'}
                      </Link>
                    )}
                    <button
                      onClick={() => completeMutation.mutate(aula.id)}
                      disabled={!!aula.completed_at || completeMutation.isPending}
                      className="btn-secondary"
                    >
                      {aula.completed_at ? (
                        <><CheckCircle2 className="w-4 h-4 text-green-600" /> Concluída</>
                      ) : (
                        'Marcar como concluída'
                      )}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Lista de aulas */}
          <div className="w-full lg:w-72 shrink-0">
            <div className="card divide-y">
              {trilha.aulas.map(a => (
                <button
                  key={a.id}
                  onClick={() => setSelectedAulaId(a.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm transition-colors first:rounded-t-lg last:rounded-b-lg ${
                    a.id === aula?.id ? 'bg-brand-50 text-brand-800 font-medium' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {a.completed_at ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-slate-300 shrink-0" />
                  )}
                  <span className="flex-1 truncate">{a.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
