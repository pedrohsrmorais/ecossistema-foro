import { Trophy } from 'lucide-react'
import ComingSoon from '../../components/ComingSoon'

/**
 * Placeholder puro — ainda sem backend. A ideia (pendente de escopo com o
 * cliente): desafios semanais publicados pelo admin da plataforma, com
 * pontuação por conclusão.
 */
export default function DesafiosSemanais() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
          <Trophy className="w-5 h-5 text-accent-500" />
          Recomendação semanal
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Desafios da semana e sua pontuação acumulada.
        </p>
      </div>
      <ComingSoon
        title="Recomendação semanal"
        description="Em breve: desafios semanais com conteúdo escolhido pela equipe, valendo pontos conforme você for completando."
      />
    </div>
  )
}
