import { useQuery } from '@tanstack/react-query'
import { leadsApi, tasksApi } from '../api'
import { Users, CheckSquare, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { STAGES } from '../lib/stages'
import CreditMeter from '../components/CreditMeter'

export default function Dashboard() {
  const { data: funnel = [] } = useQuery({
    queryKey: ['funnel'],
    queryFn: () => leadsApi.getFunnelSummary(),
  })

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks-pending'],
    queryFn: () => tasksApi.listAll({ pending_only: true, limit: 5 }),
  })

  const total = funnel.reduce((acc: number, s: any) => acc + s.total, 0)
  const converted = funnel.find((s: any) => s.stage === 'convertido')?.total || 0

  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold text-slate-900 mb-6">Painel</h1>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-4 flex gap-3 items-center">
          <div className="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center">
            <Users className="w-5 h-5 text-brand-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{total}</p>
            <p className="text-sm text-slate-500">Total de leads</p>
          </div>
        </div>
        <div className="card p-4 flex gap-3 items-center">
          <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{converted}</p>
            <p className="text-sm text-slate-500">Convertidos</p>
          </div>
        </div>
        <div className="card p-4 flex gap-3 items-center">
          <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center">
            <CheckSquare className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{Array.isArray(tasks) ? tasks.length : 0}</p>
            <p className="text-sm text-slate-500">Tarefas pendentes</p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_300px] gap-4">
      {/* Funil */}
      <div className="card p-5">
        <h2 className="font-medium text-slate-900 mb-4">Funil de leads</h2>
        {total === 0 ? (
          <p className="text-sm text-slate-400">Nenhum lead cadastrado ainda. Peça à IA ou adicione em <Link to="/leads" className="text-brand-600 underline">Leads</Link>.</p>
        ) : (
          <div className="space-y-3">
            {STAGES.map(st => {
              const n = funnel.find((f: any) => f.stage === st.key)?.total || 0
              return (
                <div key={st.key} className="flex items-center gap-3">
                  <span className="text-sm text-slate-600 w-28">{st.label}</span>
                  <div className="flex-1 bg-slate-100 rounded-full h-2.5 overflow-hidden">
                    <div className={`h-2.5 rounded-full transition-all ${st.bar}`} style={{ width: `${(n / total) * 100}%` }} />
                  </div>
                  <span className="text-sm font-medium text-slate-900 w-8 text-right">{n}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
      <div className="space-y-4">
        <CreditMeter variant="light" />
        <Link to="/planos" className="btn-secondary w-full justify-center text-sm">Ver plano e créditos</Link>
      </div>
      </div>
    </div>
  )
}
