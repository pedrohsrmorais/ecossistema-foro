import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, Search, ChevronRight } from 'lucide-react'
import { leadsApi, type Lead } from '../api'

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  novo:        { label: 'Novo',        color: 'bg-sky-100 text-sky-700' },
  em_contato:  { label: 'Em contato',  color: 'bg-amber-100 text-amber-700' },
  proposta:    { label: 'Proposta',    color: 'bg-purple-100 text-purple-700' },
  convertido:  { label: 'Convertido',  color: 'bg-green-100 text-green-700' },
  encerrado:   { label: 'Encerrado',   color: 'bg-slate-100 text-slate-500' },
}

export default function Leads() {
  const [search, setSearch] = useState('')
  const [stage, setStage] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['leads', search, stage],
    queryFn: () => leadsApi.list({ search, stage, limit: 100 }),
  })

  const leads = data?.data || []

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Leads</h1>
          <p className="text-sm text-slate-500">{data?.total || 0} registros</p>
        </div>
        <Link to="/chat" className="btn-primary text-sm">
          <Plus className="w-4 h-4" /> Novo via IA
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            className="input pl-9"
            placeholder="Buscar por nome, telefone ou e-mail..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select className="input w-auto" value={stage} onChange={e => setStage(e.target.value)}>
          <option value="">Todas as etapas</option>
          {Object.entries(STAGE_LABELS).map(([key, { label }]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400">Carregando...</div>
        ) : leads.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-slate-500 mb-2">Nenhum lead encontrado.</p>
            <p className="text-sm text-slate-400">Use a IA para cadastrar seu primeiro lead.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-slate-50 text-left">
                <th className="px-4 py-3 font-medium text-slate-600">Nome</th>
                <th className="px-4 py-3 font-medium text-slate-600">Telefone</th>
                <th className="px-4 py-3 font-medium text-slate-600">Etapa</th>
                <th className="px-4 py-3 font-medium text-slate-600">Responsável</th>
                <th className="px-4 py-3 font-medium text-slate-600">Criado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead: Lead) => {
                const stageInfo = STAGE_LABELS[lead.stage] || { label: lead.stage, color: 'bg-slate-100 text-slate-600' }
                return (
                  <tr key={lead.id} className="border-b last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-900">{lead.name || '—'}</td>
                    <td className="px-4 py-3 text-slate-600">{lead.phone || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`badge ${stageInfo.color}`}>{stageInfo.label}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{lead.assigned_name || '—'}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td className="px-4 py-3">
                      <Link to={`/leads/${lead.id}`} className="text-brand-600 hover:text-brand-700">
                        <ChevronRight className="w-4 h-4" />
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
