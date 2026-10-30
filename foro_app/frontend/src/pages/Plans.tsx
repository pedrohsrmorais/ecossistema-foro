import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Check, Zap, Search, Users, FileText, AlertTriangle, Loader2, CreditCard, Lock } from 'lucide-react'
import clsx from 'clsx'
import { plansApi, settingsApi, paymentsApi } from '../api'
import CreditMeter from '../components/CreditMeter'
import { useAuth } from '../context/AuthContext'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 })
const day = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR') : '')

export default function Plans() {
  const qc = useQueryClient()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
  const [params, setParams] = useSearchParams()
  const returned = params.get('checkout') // 'ok' | 'cancelado' (volta do Stripe)
  const expiredParam = params.get('expirado') === '1'

  const [waiting, setWaiting] = useState(returned === 'ok')
  const [activated, setActivated] = useState(false) // plano foi ativado nesta visita (webhook chegou)
  const { data: plans = [] } = useQuery({ queryKey: ['plans'], queryFn: plansApi.list })
  const { data: current } = useQuery({
    queryKey: ['plan'], queryFn: settingsApi.getPlan,
    refetchInterval: waiting ? 2000 : false, // aguardando o webhook do Stripe ativar o plano
  })

  const [busy, setBusy] = useState<string | null>(null) // id do plano (ou 'portal') em andamento
  const [error, setError] = useState('')

  const sub = current?.subscription
  const hasSub = current?.account_status === 'active' && (sub?.status === 'active' || sub?.status === 'past_due')
  const isTrial = current?.current === 'trial'
  const trialEnded = isTrial && current?.trial_ends_at && new Date(current.trial_ends_at) < new Date()
  const expired = current?.account_status === 'expired'

  // Voltou do Checkout: o plano só muda quando o webhook chega — espera até ~40 s.
  useEffect(() => {
    if (!waiting) return
    if (hasSub) {
      setWaiting(false)
      setActivated(true)
      qc.invalidateQueries({ queryKey: ['ai-credits'] })
      setParams({}, { replace: true })
      return
    }
    const t = setTimeout(() => setWaiting(false), 40_000)
    return () => clearTimeout(t)
  }, [waiting, hasSub, qc, setParams])

  async function subscribe(planId: string) {
    setBusy(planId); setError('')
    try {
      const { url } = await paymentsApi.checkout(planId)
      window.location.href = url
    } catch (e: any) {
      const data = e?.response?.data
      if (data?.code === 'ALREADY_SUBSCRIBED') return openPortal()
      setError(data?.error || 'Não foi possível abrir o pagamento. Tente novamente.')
      setBusy(null)
    }
  }

  async function openPortal() {
    setBusy('portal'); setError('')
    try {
      const { url } = await paymentsApi.portal()
      window.location.href = url
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Não foi possível abrir o portal de assinatura.')
      setBusy(null)
    }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-semibold text-slate-900">Plano e créditos</h1>
      <p className="text-sm text-slate-500 mb-5">Seus recursos renovam toda semana, a partir da data de início do plano.</p>

      {(expiredParam || trialEnded) && !expired && !hasSub && (
        <div className="flex items-start gap-2 p-3 mb-5 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Seu teste grátis de 14 dias terminou. Escolha um plano para voltar a usar o CRM e a IA — seus dados estão guardados.</span>
        </div>
      )}
      {expired && (
        <div className="flex items-start gap-2 p-3 mb-5 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Sua assinatura terminou. Assine novamente para voltar a usar o CRM e a IA — seus dados continuam guardados.</span>
        </div>
      )}
      {sub?.status === 'past_due' && (
        <div className="flex items-start gap-2 p-3 mb-5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>Não conseguimos cobrar seu cartão. O Stripe tentará de novo, mas para evitar a suspensão <button className="underline font-medium" onClick={openPortal}>atualize a forma de pagamento</button>.</span>
        </div>
      )}
      {waiting && (
        <div className="flex items-center gap-2 p-3 mb-5 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" /> Pagamento recebido! Estamos ativando o seu plano — isso leva alguns segundos.
        </div>
      )}
      {activated && hasSub && (
        <div className="p-3 mb-5 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">Assinatura ativada. Obrigado! 🎉</div>
      )}
      {returned === 'ok' && !waiting && !hasSub && !activated && (
        <div className="p-3 mb-5 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          Recebemos o seu pagamento, mas a ativação está demorando mais que o normal. Atualize a página em instantes; se continuar assim, fale com o suporte.
        </div>
      )}
      {returned === 'cancelado' && (
        <div className="p-3 mb-5 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-600">Pagamento cancelado — nada foi cobrado. Você pode escolher um plano quando quiser.</div>
      )}
      {error && <div className="p-3 mb-5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

      <div className="grid md:grid-cols-[1fr_280px] gap-4 mb-6">
        <div className="card p-4 text-sm">
          <p className="text-slate-500">Plano atual</p>
          <p className="text-lg font-semibold text-slate-900">{expired ? 'Sem assinatura ativa' : current?.name || '—'}</p>
          {hasSub && !sub?.cancel_at_period_end && <p className="text-green-600 text-sm">Assinatura ativa{sub?.current_period_end ? ` · renova em ${day(sub.current_period_end)}` : ''}</p>}
          {hasSub && sub?.cancel_at_period_end && <p className="text-amber-600 text-sm">Cancelamento agendado — acesso até {day(sub?.current_period_end)}</p>}
          {isTrial && current?.trial_ends_at && !expired && (
            <p className="text-slate-500">Teste até {day(current.trial_ends_at)}</p>
          )}
          {sub?.can_manage && isAdmin && (
            <button className="btn-secondary mt-3" onClick={openPortal} disabled={busy === 'portal'}>
              {busy === 'portal' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />} Gerenciar assinatura
            </button>
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
          const isCurrent = hasSub && current?.current === p.id
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
              {isCurrent ? (
                <button className="mt-5 btn-secondary justify-center" disabled><Check className="w-4 h-4" /> Plano atual</button>
              ) : (
                <button className="mt-5 btn-primary justify-center" disabled={!isAdmin || busy !== null || waiting}
                  onClick={() => (hasSub ? openPortal() : subscribe(p.id))}>
                  {busy === p.id && <Loader2 className="w-4 h-4 animate-spin" />}
                  {hasSub ? `Trocar para ${p.name}` : `Assinar ${p.name}`}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {!isAdmin && <p className="mt-4 text-xs text-slate-500">Só administradores da conta podem assinar ou alterar o plano.</p>}
      <p className="mt-6 text-xs text-slate-400 flex items-center gap-1.5">
        <Lock className="w-3.5 h-3.5" /> Pagamento por cartão de crédito, processado com segurança pelo Stripe — o Foro nunca vê o número do seu cartão. Cancele quando quiser, pelo portal da assinatura.
      </p>
    </div>
  )
}
