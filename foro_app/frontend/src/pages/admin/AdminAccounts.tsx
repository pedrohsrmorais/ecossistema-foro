import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { adminApi } from '../../api'

const STATUS_LABEL: Record<string, string> = {
  trialing: 'Em teste',
  active: 'Ativa',
  suspended: 'Suspensa',
  cancelled: 'Cancelada',
}
const STATUS_CLASS: Record<string, string> = {
  trialing: 'bg-amber-100 text-amber-700',
  active: 'bg-green-100 text-green-700',
  suspended: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-200 text-slate-600',
}

export default function AdminAccounts() {
  const { data: accounts = [], isLoading } = useQuery({ queryKey: ['admin-accounts'], queryFn: adminApi.listAccounts })

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Contas</h1>
      <p className="text-sm text-slate-500 mb-6">Todos os escritórios cadastrados na plataforma.</p>

      {isLoading ? (
        <p className="text-sm text-slate-400">Carregando...</p>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b">
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Escritório</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Status</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Plano</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-600">Usuários</th>
                <th className="px-4 py-2.5 text-right font-medium text-slate-600">Leads</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Desde</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map(a => (
                <tr key={a.id} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    <Link to={`/admin/accounts/${a.id}`} className="font-medium text-brand-700 hover:underline">
                      {a.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`badge ${STATUS_CLASS[a.status] || 'bg-slate-100 text-slate-600'}`}>
                      {STATUS_LABEL[a.status] || a.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">{a.plan_name || a.plan_id}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{a.users_count}</td>
                  <td className="px-4 py-2.5 text-right text-slate-700">{a.leads_count}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs">{new Date(a.created_at).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))}
              {accounts.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Nenhuma conta cadastrada ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
