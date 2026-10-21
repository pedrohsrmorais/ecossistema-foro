import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { educationApi } from '../api'
import { GraduationCap, PlayCircle } from 'lucide-react'

export default function Education() {
  const { data: trilhas = [], isLoading } = useQuery({ queryKey: ['education-trilhas'], queryFn: educationApi.listTrilhas })

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900">Educação</h1>
        <p className="text-sm text-slate-500 mt-1">
          Trilhas sobre tecnologia, automação e uso de IA no escritório de advocacia.
        </p>
      </div>

      {isLoading && <p className="text-sm text-slate-400">Carregando...</p>}

      {!isLoading && trilhas.length === 0 && (
        <div className="card p-8 text-center">
          <GraduationCap className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">Nenhuma trilha publicada ainda.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {trilhas.map(t => {
          const pct = t.total_aulas > 0 ? Math.round((t.aulas_concluidas / t.total_aulas) * 100) : 0
          return (
            <Link key={t.id} to={`/education/${t.id}`} className="card overflow-hidden hover:shadow-md transition-shadow">
              <div className="h-28 bg-brand-900 flex items-center justify-center">
                {t.cover_image_url ? (
                  <img src={t.cover_image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <GraduationCap className="w-8 h-8 text-accent-400" />
                )}
              </div>
              <div className="p-4">
                <h2 className="font-medium text-slate-900 mb-1">{t.title}</h2>
                {t.description && <p className="text-sm text-slate-500 line-clamp-2 mb-3">{t.description}</p>}
                <div className="flex items-center gap-2 text-xs text-slate-500 mb-1.5">
                  <PlayCircle className="w-3.5 h-3.5" />
                  {t.total_aulas} {t.total_aulas === 1 ? 'aula' : 'aulas'}
                </div>
                <div className="bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div className="h-1.5 bg-accent-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
