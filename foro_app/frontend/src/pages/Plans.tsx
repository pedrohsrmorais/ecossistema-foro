import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Check, Zap, Search, Users, FileText, AlertTriangle, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { plansApi, settingsApi, paymentsApi, type PlanInfo } from '../api'
import CreditMeter from '../components/CreditMeter'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })

const EMPTY_CARD = { holderName: '', number: '', expiryMonth: '', expiryYear: '', ccv: '', email: '', cpfCnpj: '', postalCode: '', addressNumber: '', phone: '' }

export default function Plans() {
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const expired = params.get('expirado') === '1'
  const { data: plans = [] } = useQuery({ queryKey: ['plans'], queryFn: plansApi.list })
  const { data: current } = useQuery({ queryKey: ['plan'], queryFn: settingsApi.getPlan })

  const [selected, setSelected] = useState<PlanInfo | null>(null)
  const [billing, setBilling] = useState<'PIX' | 'CREDIT_CARD'>('PIX')
  const [card, setCard] = useState(EMPTY_CARD)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  const isTrial = current?.current === 'trial'
  const trialEnded = isTrial && current?.trial_ends_at && new Date(current.trial_ends_at) < new Date()

  async function subscribe() {
    if (!selected) return
    setBusy(true); setError('')
    try {
      await paymentsApi.createSubscription({ plan: selected.id, billingType: billing, card: billing === 'CREDIT_CARD' ? card : undefined })
      setDone(`Assinatura do plano ${selected.name} criada! ${billing === 'PIX' ? 'A cobrança PIX será enviada pelo Asaas.' : 'O cartão foi enviado para cobrança.'}`)
      setSelected(null)
      qc.invalidateQueries({ queryKey: ['plan'] })
      qc.invalidateQueries({ queryKey: ['ai-credits'] })
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Não foi possível criar a assinatura. Tente novamente.')
    } finally { setBusy(false) }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-semibold text-slate-900">Plano e créditos</h1>
      <p className="text-sm text-slate-500 mb-5">Seus recursos renovam toda semana, a partir da data de início do plano.</p>

      {(expired || trialEnded) && (
        <div className="flex items-start gap-2 p-3 mb-5 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Seu teste grátis de 14 dias terminou. Escolha um plano para voltar a usar o CRM e a IA — seus dados estão guardados.</span>
        </div>
      )}
      {done && <div className="p-3 mb-5 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">{done}</div>}

      <div className="grid md:grid-cols-[1fr_280px] gap-4 mb-6">
        <div className="card p-4 text-sm">
          <p className="text-slate-500">Plano atual</p>
          <p className="text-lg font-semibold text-slate-900">{current?.name || '—'}</p>
          {current?.account_status === 'active' && <p className="text-green-600 text-sm">Assinatura ativa</p>}
          {isTrial && current?.trial_ends_at && (
            <p className="text-slate-500">Teste até {new Date(current.trial_ends_at).toLocaleDateString('pt-BR')}</p>
          )}
        </div>
        <CreditMeter variant="light" />
      </div>

      <div className="card p-4 mb-6 text-sm text-slate-600">
        <p className="font-medium text-slate-900 mb-1 flex items-center gap-1.5"><Zap className="w-4 h-4 text-accent-500" /> Como os créditos de IA são calculados</p>
        <p><strong>Créditos = (tokens de entrada + 5 × tokens de saída) ÷ 2.500.</strong> Uma resposta curta custa em torno de 1 a 3 créditos; ações com várias etapas no CRM, um pouco mais. O valor exato de cada resposta aparece no chat.</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map(p => {
          const isCurrent = current?.current === p.id && current?.account_status === 'active'
          return (
            <div key={p.id} className={clsx('card p-5 flex flex-col relative', p.id === 'pro' && 'border-accent-400 ring-1 ring-accent-300')}>
              {p.id === 'pro' && <span className="absolute -top-2.5 left-5 badge bg-accent-500 text-white">Mais escolhido</span>}
              <h3 className="font-semibold text-slate-900">{p.name}</h3>
              <p className="mt-1"><span className="text-2xl font-semibold text-slate-900">{brl(p.price)}</span><span className="text-sm text-slate-500">/mês</span></p>
              <ul className="mt-4 space-y-2 text-sm text-slate-600 flex-1">
                <li className="flex gap-2"><Zap className="w-4 h-4 text-accent-500 shrink-0 mt-0.5" /> {p.ai_credits_week} créditos de IA por semana</li>
                <li className="flex gap-2"><Users className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" /> {p.max_users} {p.max_users === 1 ? 'usuário' : 'usuários'}</li>
                <li className="flex gap-2"><FileText className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" /> {p.max_leads ? `Até ${p.max_leads} leads` : 'Leads ilimitados'}</li>
                <li className="flex gap-2 text-slate-400"><Search className="w-4 h-4 shrink-0 mt-0.5" /> {p.lookups_week} consultas/semana <span className="badge bg-accent-100 text-accent-700 !py-0">em breve</span></li>
              </ul>
              <button className={clsx('mt-5', isCurrent ? 'btn-secondary justify-center' : 'btn-primary justify-center')}
                disabled={isCurrent} onClick={() => { setSelected(p); setError(''); setDone('') }}>
                {isCurrent ? <><Check className="w-4 h-4" /> Plano atual</> : `Assinar ${p.name}`}
              </button>
            </div>
          )
        })}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => !busy && setSelected(null)}>
          <div className="card w-full max-w-md p-5 animate-scale-in max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="font-semibold text-slate-900">Assinar {selected.name} — {brl(selected.price)}/mês</h2>
            <div className="flex gap-2 my-4">
              {(['PIX', 'CREDIT_CARD'] as const).map(b => (
                <button key={b} onClick={() => setBilling(b)}
                  className={clsx('flex-1 py-2 text-sm rounded-lg border font-medium', billing === b ? 'bg-brand-50 border-brand-500 text-brand-700' : 'bg-white text-slate-600')}>
                  {b === 'PIX' ? 'PIX' : 'Cartão de crédito'}
                </button>
              ))}
            </div>
            {billing === 'CREDIT_CARD' && (
              <div className="grid grid-cols-2 gap-2 mb-3">
                {([
                  ['holderName', 'Nome no cartão', 2], ['number', 'Número do cartão', 2],
                  ['expiryMonth', 'Mês (MM)', 1], ['expiryYear', 'Ano (AAAA)', 1], ['ccv', 'CVV', 1], ['cpfCnpj', 'CPF/CNPJ', 1],
                  ['email', 'E-mail', 2], ['postalCode', 'CEP', 1], ['addressNumber', 'Nº', 1], ['phone', 'Telefone', 2],
                ] as const).map(([k, label, span]) => (
                  <input key={k} className={clsx('input', span === 2 && 'col-span-2')} placeholder={label}
                    value={(card as any)[k]} onChange={e => setCard(c => ({ ...c, [k]: e.target.value }))} />
                ))}
              </div>
            )}
            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" disabled={busy} onClick={() => setSelected(null)}>Cancelar</button>
              <button className="btn-primary" disabled={busy} onClick={subscribe}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Confirmar assinatura
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
