import { useState, FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Scale } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', accountName: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function setField(key: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [key]: e.target.value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await register(form)
      navigate('/chat')
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Erro ao criar conta.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <Scale className="w-8 h-8 text-brand-600" />
          <span className="text-2xl font-bold text-slate-900">Foro</span>
        </div>

        <div className="card p-6">
          <h1 className="text-xl font-semibold text-slate-900 mb-6">Criar conta</h1>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nome do escritório</label>
              <input type="text" className="input" value={form.accountName} onChange={setField('accountName')} placeholder="Advocacia Silva" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Seu nome</label>
              <input type="text" className="input" value={form.name} onChange={setField('name')} placeholder="João Silva" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">E-mail</label>
              <input type="email" className="input" value={form.email} onChange={setField('email')} placeholder="seu@email.com" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Senha</label>
              <input type="password" className="input" value={form.password} onChange={setField('password')} placeholder="Mínimo 8 caracteres" minLength={8} required />
            </div>
            <button type="submit" className="btn-primary w-full justify-center" disabled={loading}>
              {loading ? 'Criando conta...' : 'Criar conta'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-500">
            Já tem conta?{' '}
            <Link to="/login" className="text-brand-600 hover:underline font-medium">Entrar</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
