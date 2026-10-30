import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Scale, Inbox } from 'lucide-react'
import { authApi } from '../api'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await authApi.forgotPassword(email)
      setSent(true)
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Não foi possível enviar agora. Tente novamente.')
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
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Esqueci minha senha</h1>

          {sent ? (
            <div className="space-y-4">
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
                Se existir uma conta com <strong>{email}</strong>, enviamos um link para criar uma nova senha. Ele vale por 60 minutos.
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex gap-2" role="note">
                <Inbox className="w-4 h-4 mt-0.5 shrink-0" />
                <span><strong>Não chegou? Confira o spam, o lixo eletrônico e a lixeira!</strong></span>
              </div>
              <Link to="/login" className="btn-primary w-full justify-center">Voltar para o login</Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-slate-500 mb-5">Informe o e-mail da sua conta e enviaremos um link para você criar uma nova senha.</p>
              {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
                  <input type="email" className="input" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" required autoFocus />
                </div>
                <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
                  {loading ? 'Enviando...' : 'Enviar link'}
                </button>
              </form>
              <p className="mt-4 text-center text-sm text-slate-500">
                <Link to="/login" className="text-brand-600 hover:underline font-medium">Voltar para o login</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
