import { FlaskConical } from 'lucide-react'
import ComingSoon from '../../components/ComingSoon'

/**
 * Placeholder puro — ainda sem backend. A ideia (pendente de escopo com o
 * cliente): pequenos exercícios/testes vinculados às trilhas de Educação,
 * pra reforçar o que foi aprendido num vídeo.
 */
export default function ProvasDeConceito() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-accent-500" />
          Provas de conceito
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Pequenos exercícios práticos vinculados ao que você viu em Educação.
        </p>
      </div>
      <ComingSoon
        title="Provas de conceito"
        description="Em breve: depois de assistir uma aula, você vai poder testar o que aprendeu com um exercício prático rápido."
      />
    </div>
  )
}
