import { ReactNode } from 'react'
import { Lock } from 'lucide-react'

interface ComingSoonProps {
  title: string
  description: string
  /** Prévia real da tela por trás do selo (opcional) — borrada/esmaecida,
   * só pra dar a sensação de "existe e está quase pronto". */
  children?: ReactNode
}

/**
 * Selo "Em breve" reutilizável. Usado quando a tela já existe e já fala com
 * a API real, mas o recurso ainda está travado em nível de produto — ver
 * `config/featureFlags.ts`.
 */
export default function ComingSoon({ title, description, children }: ComingSoonProps) {
  return (
    <div className="relative">
      {children && (
        <div className="pointer-events-none select-none blur-[3px] opacity-40 grayscale">
          {children}
        </div>
      )}
      <div className={children ? 'absolute inset-0 flex items-center justify-center px-4' : 'flex items-center justify-center px-4 py-20'}>
        <div className="card px-8 py-7 text-center max-w-sm shadow-lg animate-scale-in bg-white/95 backdrop-blur-sm">
          <div className="w-11 h-11 rounded-full bg-accent-100 text-accent-600 flex items-center justify-center mx-auto mb-3 animate-pulse-glow">
            <Lock className="w-5 h-5" />
          </div>
          <p className="badge badge-shimmer text-accent-700 animate-shimmer mb-2.5">Em breve</p>
          <h2 className="font-semibold text-slate-900 mb-1.5">{title}</h2>
          <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  )
}
