import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, Inbox } from 'lucide-react'
import { authApi } from '../api'
import { useAuth } from '../context/AuthContext'

export default function VerifyEmail() {
  const { user, markEmailVerified, logout } = useAuth()
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [loading, setLoading] = useState(false)
  const [resending, setResending] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setInfo('')
    setLoading(true)
    try {
      await authApi.verifyCode('email', code)
      markEmailVerified()
      navigate('/chat')
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Código inválido.')
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    setError('')
    setInfo('')
    setResending(true)
    try {
      await authApi.sendVerification('email')
      setInfo('Novo código enviado para seu e-mail.')
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erro ao reenviar código.')
    } finally {
      setResending(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Mail className="w-8 h-8 text-brand-600" />
          <span className="text-2xl font-bold text-slate-900">Foro</span>
        </div>

        <div className="card p-6">
          <h1 className="text-xl font-semibold text-slate-900 mb-2">Confirme seu e-mail</h1>
          <p className="text-sm text-slate-500 mb-6">
            Enviamos um código de 6 dígitos para{' '}
            <strong className="text-slate-700">{user?.email}</strong>. Informe-o abaixo para liberar o acesso.
          </p>

          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex gap-2" role="note">
            <Inbox className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              <strong>Não chegou? Confira também a caixa de spam, o lixo eletrônico e a lixeira!</strong>{' '}
              Às vezes o e-mail cai lá. O código vale por 10 minutos.
            </span>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}
          {info && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
              {info}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Código de verificação</label>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="input text-center text-lg tracking-[0.3em]"
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                maxLength={6}
                required
              />
            </div>
            <button type="submit" className="btn-primary w-full justify-center" disabled={loading || code.length < 4}>
              {loading ? 'Confirmando...' : 'Confirmar'}
            </button>
          </form>

          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            className="btn-ghost w-full justify-center mt-3 text-sm"
          >
            {resending ? 'Enviando...' : 'Reenviar código'}
          </button>

          <button
            type="button"
            onClick={logout}
            className="w-full text-center text-xs text-slate-400 hover:text-slate-600 mt-4"
          >
            Sair e usar outra conta
          </button>
        </div>
      </div>
    </div>
  )
}
