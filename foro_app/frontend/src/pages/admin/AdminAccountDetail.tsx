import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, type AccountSummary } from '../../api'
import { ArrowLeft } from 'lucide-react'

function formatCents(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

const STATUS_OPTIONS: AccountSummary['status'][] = ['trialing', 'active', 'suspended', 'cancelled']
const STATUS_LABEL: Record<string, string> = { trialing: 'Em teste', active: 'Ativa', suspended: 'Suspensa', cancelled: 'Cancelada' }

export default function AdminAccountDetail() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()

  const { data: account, isLoading } = useQuery({ queryKey: ['admin-account', id], queryFn: () => adminApi.getAccount(id!), enabled: !!id })
  const { data: modules = [] } = useQuery({ queryKey: ['admin-account-modules', id], queryFn: () => adminApi.getAccountModules(id!), enabled: !!id })

  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustNote, setAdjustNote] = useState('')
  const [adjustError, setAdjustError] = useState('')

  const statusMutation = useMutation({
    mutationFn: (status: AccountSummary['status']) => adminApi.updateAccountStatus(id!, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-account', id] }),
  })

  const moduleMutation = useMutation({
    mutationFn: ({ moduleKey, enabled }: { moduleKey: string; enabled: boolean }) => adminApi.setAccountModule(id!, moduleKey, enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-account-modules', id] }),
  })

  const adjustMutation = useMutation({
    mutationFn: () => adminApi.adjustCredits(id!, { amount_cents: Math.round(Number(adjustAmount) * 100), note: adjustNote }),
    onSuccess: () => {
      setAdjustAmount(''); setAdjustNote(''); setAdjustError('')
      queryClient.invalidateQueries({ queryKey: ['admin-account', id] })
    },
    onError: (err: any) => setAdjustError(err?.response?.data?.error || 'Erro ao ajustar créditos.'),
  })

  function handleAdjustSubmit(e: React.FormEvent) {
    e.preventDefault()
    setAdjustError('')
    if (!adjustNote.trim()) { setAdjustError('Informe o motivo do ajuste.'); return }
    if (!adjustAmount || Number(adjustAmount) === 0) { setAdjustError('Informe um valor diferente de zero.'); return }
    adjustMutation.mutate()
  }

  if (isLoading || !account) return <div className="p-6 text-sm text-slate-400">Carregando...</div>

  return (
    <div className="p-6 max-w-5xl">
      <Link to="/admin/accounts" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 mb-4">
        <ArrowLeft className="w-4 h-4" /> Contas
      </Link>

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{account.name}</h1>
          <p className="text-sm text-slate-500">{account.plan_name || account.plan_id} · desde {new Date(account.created_at).toLocaleDateString('pt-BR')}</p>
        </div>
        <select
          className="input w-auto"
          value={account.status}
          onChange={e => statusMutation.mutate(e.target.value as AccountSummary['status'])}
          disabled={statusMutation.isPending}
        >
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Usuários */}
        <div className="card p-5">
          <h2 className="font-medium text-slate-900 mb-3">Usuários ({account.users.length})</h2>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {account.users.map(u => (
              <div key={u.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                <div>
                  <p className="text-slate-900">{u.name}</p>
                  <p className="text-xs text-slate-500">{u.email}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {!u.email_verified_at && <span className="badge bg-amber-100 text-amber-700">e-mail não verificado</span>}
                  <span className="badge bg-slate-100 text-slate-600 capitalize">{u.role}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Módulos */}
        <div className="card p-5">
          <h2 className="font-medium text-slate-900 mb-1">Módulos</h2>
          <p className="text-xs text-slate-500 mb-3">Liga/desliga funcionalidades só para esta conta.</p>
          <div className="space-y-1">
            {modules.map(m => (
              <label key={m.module_key} className="flex items-center justify-between py-2 border-b last:border-0 cursor-pointer">
                <div>
                  <p className="text-sm text-slate-900">{m.name}</p>
                  {m.description && <p className="text-xs text-slate-500">{m.description}</p>}
                </div>
                <input
                  type="checkbox"
                  checked={m.enabled}
                  disabled={moduleMutation.isPending}
                  onChange={e => moduleMutation.mutate({ moduleKey: m.module_key, enabled: e.target.checked })}
                  className="w-4 h-4 accent-brand-700"
                />
              </label>
            ))}
          </div>
        </div>

        {/* Créditos */}
        <div className="card p-5">
          <h2 className="font-medium text-slate-900 mb-3">Créditos</h2>
          <div className="flex items-center justify-between mb-4 p-3 rounded-lg bg-slate-50 border">
            <span className="text-sm text-slate-600">Saldo atual</span>
            <span className="text-lg font-semibold text-slate-900">{formatCents(account.credits_balance_cents)}</span>
          </div>

          <form onSubmit={handleAdjustSubmit} className="space-y-2 mb-4">
            <p className="text-xs text-slate-500">
              Único caminho de reembolso/ajuste do sistema — use valor negativo para desconto. Nota é obrigatória e fica registrada no extrato.
            </p>
            <div className="flex gap-2">
              <input
                type="number" step="0.01" placeholder="Valor (R$), ex: -10 ou 25"
                className="input" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)}
              />
            </div>
            <input
              type="text" placeholder="Motivo do ajuste (obrigatório)"
              className="input" value={adjustNote} onChange={e => setAdjustNote(e.target.value)}
            />
            {adjustError && <p className="text-xs text-red-600">{adjustError}</p>}
            <button type="submit" className="btn-secondary w-full justify-center" disabled={adjustMutation.isPending}>
              {adjustMutation.isPending ? 'Aplicando...' : 'Aplicar ajuste manual'}
            </button>
          </form>

          <h3 className="text-sm font-medium text-slate-700 mb-2">Últimas movimentações</h3>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {account.recent_credit_transactions.map(tx => (
              <div key={tx.id} className="flex items-center justify-between text-xs py-1.5 border-b last:border-0">
                <div>
                  <p className="text-slate-700 capitalize">{tx.type}{tx.note ? ` — ${tx.note}` : ''}</p>
                  <p className="text-slate-400">{new Date(tx.created_at).toLocaleString('pt-BR')}</p>
                </div>
                <span className={tx.amount_cents >= 0 ? 'text-green-600 font-medium' : 'text-slate-900 font-medium'}>
                  {tx.amount_cents >= 0 ? '+' : ''}{formatCents(tx.amount_cents)}
                </span>
              </div>
            ))}
            {account.recent_credit_transactions.length === 0 && <p className="text-xs text-slate-400">Nenhuma movimentação ainda.</p>}
          </div>
        </div>

        {/* Pagamentos */}
        <div className="card p-5">
          <h2 className="font-medium text-slate-900 mb-3">Pagamentos recentes</h2>
          <div className="space-y-1 max-h-72 overflow-y-auto">
            {account.recent_payments.map(p => (
              <div key={p.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                <div>
                  <p className="text-slate-900 capitalize">{p.type.replace('_', ' ')}</p>
                  <p className="text-xs text-slate-400">{new Date(p.created_at).toLocaleDateString('pt-BR')}</p>
                </div>
                <div className="text-right">
                  <p className="text-slate-900">{formatCents(Math.round(Number(p.amount) * 100))}</p>
                  <span className="badge bg-slate-100 text-slate-600">{p.status}</span>
                </div>
              </div>
            ))}
            {account.recent_payments.length === 0 && <p className="text-xs text-slate-400">Nenhum pagamento ainda.</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
