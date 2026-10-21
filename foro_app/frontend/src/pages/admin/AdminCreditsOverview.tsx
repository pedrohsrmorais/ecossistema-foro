import { useQuery } from '@tanstack/react-query'
import { adminApi } from '../../api'

function formatCents(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Visão agregada de créditos de todos os tenants — serve pra comparar o que
 * foi vendido em créditos contra o que foi efetivamente gasto nos
 * provedores externos. Divergência grande entre comprado e consumido é
 * sinal de alerta (bug, ou gente comprando e não usando).
 */
export default function AdminCreditsOverview() {
  const { data: overview, isLoading } = useQuery({ queryKey: ['admin-credits-overview'], queryFn: adminApi.creditsOverview })

  if (isLoading || !overview) return <div className="p-6 text-sm text-slate-400">Carregando...</div>

  const cards = [
    { label: 'Vendido (comprado)', value: overview.total_purchased_cents, tone: 'text-green-600' },
    { label: 'Consumido em serviços', value: overview.total_consumed_cents, tone: 'text-slate-900' },
    { label: 'Devolvido (falha técnica)', value: overview.total_refunded_cents, tone: 'text-amber-600' },
    { label: 'Ajustado manualmente', value: overview.total_adjusted_cents, tone: 'text-brand-700' },
  ]

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-slate-900 mb-1">Créditos — visão geral</h1>
      <p className="text-sm text-slate-500 mb-6">Agregado de todos os tenants, para reconciliar com o gasto real nos provedores externos.</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map(c => (
          <div key={c.label} className="card p-4">
            <p className={`text-2xl font-bold ${c.tone}`}>{formatCents(c.value)}</p>
            <p className="text-sm text-slate-500 mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="card p-4 mb-6">
        <p className="text-sm text-slate-600">Saldo total em carteiras (ainda não consumido)</p>
        <p className="text-2xl font-bold text-slate-900 mt-1">{formatCents(overview.total_wallets_balance_cents)}</p>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b"><h2 className="font-medium text-slate-900">Consumo por serviço</h2></div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b">
              <th className="px-4 py-2.5 text-left font-medium text-slate-600">Serviço</th>
              <th className="px-4 py-2.5 text-right font-medium text-slate-600">Usos</th>
              <th className="px-4 py-2.5 text-right font-medium text-slate-600">Consumido</th>
            </tr>
          </thead>
          <tbody>
            {overview.by_service.map(s => (
              <tr key={s.service_key} className="border-b last:border-0">
                <td className="px-4 py-2.5 text-slate-700">{s.service_key}</td>
                <td className="px-4 py-2.5 text-right text-slate-700">{s.usage_count}</td>
                <td className="px-4 py-2.5 text-right text-slate-900">{formatCents(s.consumed_cents)}</td>
              </tr>
            ))}
            {overview.by_service.length === 0 && (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">Nenhum consumo registrado ainda.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
