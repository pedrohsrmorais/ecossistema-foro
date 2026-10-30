import { useState, FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Scale } from 'lucide-react'
import { authApi } from '../api'

/** Serve para "esqueci minha senha" e também para aceitar convite de equipe (?convite=1). */
export default function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') || ''
  const isInvite = params.get('convite') === '1'
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (password !== confirm) return setError('As senhas não conferem.')
    setLoading(true)
    try {
      await authApi.resetPassword(token, password)
      navigate('/login?senha=ok')
    } catch (err: any) {
      setError(err?.response?.data?.error || err?.response?.data?.details?.[0]?.msg || 'Não foi possível definir a senha.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Scale className="w-8 h-8 text-brand-800" />
          <span className="logo-wordmark text-2xl text-brand-950">Foro</span>
        </div>
        <div className="card p-6">
          <h1 className="text-xl font-semibold text-slate-900 mb-2">{isInvite ? 'Aceitar convite' : 'Criar nova senha'}</h1>
          <p className="text-sm text-slate-500 mb-5">
            {isInvite ? 'Defina uma senha para entrar na equipe.' : 'Escolha uma nova senha para a sua conta.'}
          </p>

          {!token ? (
            <div className="space-y-4">
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">Link inválido ou incompleto.</div>
              <Link to="/forgot-password" className="btn-primary w-full justify-center">Pedir novo link</Link>
            </div>
          ) : (
            <>
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  {error} {/expirad|utilizad|inválid/i.test(error) && <Link to="/forgot-password" className="underline">Pedir novo link</Link>}
                </div>
              )}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nova senha</label>
                  <input type="password" className="input" value={password} onChange={e => setPassword(e.target.value)} placeholder="8 a 72 caracteres" minLength={8} maxLength={72} required autoFocus />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Repita a senha</label>
                  <input type="password" className="input" value={confirm} onChange={e => setConfirm(e.target.value)} minLength={8} maxLength={72} required />
                </div>
                <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
                  {loading ? 'Salvando...' : isInvite ? 'Entrar na equipe' : 'Salvar nova senha'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
