import { useSearchParams, Link } from 'react-router-dom'
import { Lock } from 'lucide-react'

/**
 * Exibida quando o backend recusa uma rota com 403 { code: 'MODULE_DISABLED' }
 * (ver modules.middleware.js::requireModule). O axios interceptor em api.ts
 * redireciona pra cá nesse caso, passando a mensagem da API.
 */
export default function ModuloDesativado() {
  const [params] = useSearchParams()
  const msg = params.get('msg') || 'Este módulo está desativado para sua conta.'

  return (
    <div className="p-10 max-w-lg mx-auto text-center">
      <div className="w-12 h-12 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center mx-auto mb-4">
        <Lock className="w-5 h-5" />
      </div>
      <h1 className="text-lg font-semibold text-slate-900 mb-2">Módulo indisponível</h1>
      <p className="text-sm text-slate-500 mb-6">{decodeURIComponent(msg)}</p>
      <Link to="/dashboard" className="btn-primary">Voltar ao painel</Link>
    </div>
  )
}
