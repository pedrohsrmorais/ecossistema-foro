import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { useAdminAuth } from '../../context/AdminAuthContext'

/**
 * Login exclusivo da equipe intellsn — tela deliberadamente separada do
 * login de escritório (/login). Nunca deve compartilhar formulário, sessão
 * ou contexto com o app do tenant (ver AdminAuthContext.tsx).
 */
export default function AdminLogin() {
  const { login } = useAdminAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
      navigate('/admin/accounts')
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erro ao entrar.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <ShieldCheck className="w-8 h-8 text-accent-400" />
          <div className="leading-tight text-center">
            <p className="logo-wordmark text-2xl text-white">intellsn</p>
            <p className="text-xs text-brand-300">Painel administrativo</p>
          </div>
        </div>

        <div className="card p-6">
          <h1 className="text-xl font-semibold text-slate-900 mb-1">Entrar</h1>
          <p className="text-sm text-slate-500 mb-6">Acesso restrito à equipe da intellsn.</p>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
              <input
                type="email" className="input" value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@intellsn.com.br" required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
              <input
                type="password" className="input" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required
              />
            </div>
            <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
