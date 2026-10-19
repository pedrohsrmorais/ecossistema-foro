import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center text-center p-4">
      <div>
        <h1 className="text-6xl font-bold text-slate-200 mb-2">404</h1>
        <p className="text-slate-600 mb-6">Página não encontrada.</p>
        <Link to="/chat" className="btn-primary">Voltar ao início</Link>
      </div>
    </div>
  )
}
