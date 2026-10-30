import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { Check, Zap, Search, FileText, AlertTriangle, Loader2, CreditCard, Lock, ArrowUp } from 'lucide-react'
import clsx from 'clsx'
import { plansApi, settingsApi, paymentsApi, billingApi } from '../api'
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
  const returnedUser = params.get('user') || user?.id
  const expiredParam = params.get('expirado') === '1'

  const [waiting, setWaiting] = useState(returned === 'ok')
  const [activated, setActivated] = useState(false)
  const { data: plans = [] } = useQuery({ queryKey: ['plans'], queryFn: plansApi.list })
  const { data: current } = useQuery({ queryKey: ['plan'], queryFn: settingsApi.getPlan, refetchInterval: waiting ? 2000 : false })
  const { data: seats = [] } = useQuery({ queryKey: ['seats'], queryFn: billingApi.seats, enabled: isAdmin, refetchInterval: waiting ? 2000 : false })

  const [target, setTarget] = useState<string>(returnedUser || user?.id || '')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const seat = seats.find(s => s.user_id === target)
  const targetPlan = isAdmin ? seat?.plan_id ?? null : current?.current && current.current !== 'trial' ? current.current : null
  const targetPrice = isAdmin ? seat?.plan_price ?? 0 : plans.find(p => p.id === targetPlan)?.price ?? 0
  const sub = current?.subscription
  const myPaid = !!current?.current && current.current !== 'trial'
  const isTrial = current?.account_status === 'trialing'
  const expired = current?.account_status === 'expired'
  const trialEnded = isTrial && current?.trial_ends_at && new Date(current.trial_ends_at) < new Date()
  const returnedSeatActive = !!seats.find(s => s.user_id === returnedUser)?.plan_id

  // Voltou do Checkout: o plano só muda quando o webhook chega — espera até ~40 s.
  useEffect(() => {
    if (!waiting) return
    if (returnedSeatActive || (!isAdmin && myPaid)) {
      setWaiting(false); setActivated(true)
      qc.invalidateQueries({ queryKey: ['ai-credits'] }); qc.invalidateQueries({ queryKey: ['plan'] })
      setParams({}, { replace: true })
      return
    }
    const t = setTimeout(() => setWaiting(false), 40_000)
    return () => clearTimeout(t)
  }, [waiting, returnedSeatActive, isAdmin, myPaid, qc, setParams])

  async function subscribe(planId: string) {
    setBusy(planId); setError(''); setInfo('')
    try {
      const r = await paymentsApi.checkout(planId, target || undefined)
      if (r.url) { window.location.href = r.url; return }
      setInfo('Plano melhorado! O valor proporcional é cobrado no cartão do escritório e o novo plano vale em instantes.')
      qc.invalidateQueries({ queryKey: ['seats'] }); qc.invalidateQueries({ queryKey: ['plan'] }); qc.invalidateQueries({ queryKey: ['ai-credits'] })
      setTimeout(() => { qc.invalidateQueries({ queryKey: ['seats'] }); qc.invalidateQueries({ queryKey: ['ai-credits'] }) }, 4000)
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Não foi possível concluir. Tente novamente.')
    }
    setBusy(null)
  }

  async function openPortal() {
    setBusy('portal'); setError('')
    try { window.location.href = (await paymentsApi.portal()).url }
    catch (e: any) { setError(e?.response?.data?.error || 'Não foi possível abrir o portal de assinatura.'); setBusy(null) }
  }

  const targetName = seat?.name || user?.name || ''
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-semibold text-slate-900">Plano e créditos</h1>
      <p className="text-sm text-slate-500 mb-5">Cada pessoa do escritório tem o <strong>próprio plano</strong>. O administrador contrata e paga; os créditos de IA renovam toda semana para cada pessoa.</p>

      {(expiredParam || trialEnded) && !expired && !myPaid && (
        <div className="flex items-start gap-2 p-3 mb-5 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>O teste grátis de 14 dias terminou. Contrate um plano para voltar a usar o CRM e a IA — seus dados estão guardados.</span>
        </div>
      )}
      {expired && (
        <div className="flex items-start gap-2 p-3 mb-5 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>Sua assinatura terminou: nenhum plano está ativo neste workspace. Contrate novamente para voltar a usar o CRM e a IA — seus dados continuam guardados.</span>
        </div>
      )}
      {sub?.status === 'past_due' && (
        <div className="flex items-start gap-2 p-3 mb-5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /><span>Não conseguimos cobrar o cartão do seu plano. {isAdmin ? <>Para evitar a suspensão <button className="underline font-medium" onClick={openPortal}>atualize a forma de pagamento</button>.</> : 'Avise o administrador do escritório.'}</span>
        </div>
      )}
      {waiting && <div className="flex items-center gap-2 p-3 mb-5 rounded-lg bg-blue-50 border border-blue-200 text-sm text-blue-800"><Loader2 className="w-4 h-4 animate-spin shrink-0" /> Pagamento recebido! Estamos ativando o seu plano — leva alguns segundos.</div>}
      {activated && <div className="p-3 mb-5 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">Plano ativado. Obrigado! 🎉</div>}
      {returned === 'ok' && !waiting && !activated && <div className="p-3 mb-5 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">Recebemos o pagamento, mas a ativação está demorando mais que o normal. Atualize a página em instantes; se continuar assim, fale com o suporte.</div>}
      {returned === 'cancelado' && <div className="p-3 mb-5 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-600">Pagamento cancelado — nada foi cobrado.</div>}
      {info && <div className="p-3 mb-5 rounded-lg bg-green-50 border border-green-200 text-sm text-green-700">{info}</div>}
      {error && <div className="p-3 mb-5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}

      <div className="grid md:grid-cols-[1fr_280px] gap-4 mb-6">
        <div className="card p-4 text-sm">
          <p className="text-slate-500">Seu plano</p>
          <p className="text-lg font-semibold text-slate-900">{current?.name || '—'}</p>
          {myPaid && sub?.status === 'active' && !sub.cancel_at_period_end && <p className="text-green-600">Ativo{sub.current_period_end ? ` · renova em ${day(sub.current_period_end)}` : ''}</p>}
          {myPaid && sub?.cancel_at_period_end && <p className="text-amber-600">Cancelamento agendado — acesso até {day(sub.current_period_end)}</p>}
          {isTrial && !myPaid && current?.trial_ends_at && <p className="text-slate-500">Teste até {day(current.trial_ends_at)}</p>}
          {!myPaid && !isTrial && !isAdmin && <p className="text-slate-500">Peça ao administrador do escritório para contratar um plano para você.</p>}
          {sub?.can_manage && isAdmin && (
            <button className="btn-secondary mt-3" onClick={openPortal} disabled={busy === 'portal'}>
              {busy === 'portal' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />} Cartão e faturas
            </button>
          )}
        </div>
        <CreditMeter variant="light" />
      </div>

      <div className="card p-4 mb-6 text-sm text-slate-600">
        <p className="font-medium text-slate-900 mb-1 flex items-center gap-1.5"><Zap className="w-4 h-4 text-accent-500" /> Como os créditos de IA são calculados</p>
        <p><strong>Créditos = (tokens de entrada + 5 × tokens de saída) ÷ 2.500.</strong> Uma resposta curta custa em torno de 1 a 3 créditos; ações com várias etapas no CRM, um pouco mais. O valor exato de cada resposta aparece no chat.</p>
      </div>

      {isAdmin && (
        <div className="card p-4 mb-4 flex items-center gap-3 flex-wrap">
          <label htmlFor="seat" className="text-sm font-medium text-slate-700">Contratar plano para:</label>
          <select id="seat" className="input !w-72" value={target} onChange={e => { setTarget(e.target.value); setError(''); setInfo('') }}>
            {seats.filter(s => s.active).map(s => <option key={s.user_id} value={s.user_id}>{s.name}{s.user_id === user?.id ? ' (você)' : ''} — {s.plan_name || (s.on_trial ? 'em teste' : 'sem plano')}</option>)}
          </select>
          <span className="text-xs text-slate-500">Você pode melhorar o plano de qualquer pessoa, mas nunca reduzir.</span>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map(p => {
          const isCurrent = isAdmin ? seat?.plan_id === p.id : current?.current === p.id
          const lower = !!targetPlan && !isCurrent && p.price < targetPrice
          return (
            <div key={p.id} className={clsx('card p-5 flex flex-col relative', p.id === 'pro' && 'border-accent-400 ring-1 ring-accent-300')}>
              {p.id === 'pro' && <span className="absolute -top-2.5 left-5 badge bg-accent-500 text-white">Mais escolhido</span>}
              <h3 className="font-semibold text-slate-900">{p.name}</h3>
              <p className="mt-1"><span className="text-2xl font-semibold text-slate-900">{brl(p.price)}</span><span className="text-sm text-slate-500"> /mês por usuário</span></p>
              <ul className="mt-4 space-y-2 text-sm text-slate-600 flex-1">
                <li className="flex gap-2"><Zap className="w-4 h-4 text-accent-500 shrink-0 mt-0.5" /> {p.ai_credits_week} créditos de IA por semana (por usuário)</li>
                <li className="flex gap-2"><FileText className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" /> {p.max_leads ? `Até ${p.max_leads} leads no escritório` : 'Leads ilimitados'}</li>
                <li className="flex gap-2 text-slate-400"><Search className="w-4 h-4 shrink-0 mt-0.5" /> {p.lookups_week} consultas/semana <span className="badge bg-accent-100 text-accent-700 !py-0">em breve</span></li>
              </ul>
              {isCurrent ? (
                <button className="mt-5 btn-secondary justify-center" disabled><Check className="w-4 h-4" /> {isAdmin ? 'Plano atual desta pessoa' : 'Seu plano atual'}</button>
              ) : (
                <button className="mt-5 btn-primary justify-center" disabled={!isAdmin || busy !== null || waiting || lower}
                  title={lower ? 'Não é possível reduzir o plano de um usuário' : undefined} onClick={() => subscribe(p.id)}>
                  {busy === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : targetPlan && !lower ? <ArrowUp className="w-4 h-4" /> : null}
                  {lower ? 'Plano menor' : targetPlan ? `Melhorar para ${p.name}` : isAdmin && target !== user?.id ? `Assinar ${p.name} para ${targetName.split(' ')[0]}` : `Assinar ${p.name}`}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {isAdmin && seats.length > 0 && (
        <div className="card mt-6 overflow-x-auto" data-testid="seats">
          <table className="w-full text-sm">
            <thead><tr className="bg-slate-50 border-b text-left text-slate-600"><th className="px-4 py-2 font-medium">Pessoa</th><th className="px-4 py-2 font-medium">Plano</th><th className="px-4 py-2 font-medium">Situação</th><th className="px-4 py-2 font-medium">Renova</th></tr></thead>
            <tbody>
              {seats.filter(s => s.active).map(s => (
                <tr key={s.user_id} className="border-b last:border-0">
                  <td className="px-4 py-2"><div className="text-slate-900">{s.name}{s.is_owner && <span className="text-slate-400"> · principal</span>}</div><div className="text-xs text-slate-500">{s.email}</div></td>
                  <td className="px-4 py-2">{s.plan_name || (s.on_trial ? 'Teste grátis' : <span className="text-amber-700">Sem plano</span>)}{s.plan_price ? <span className="text-slate-400"> · {brl(s.plan_price)}</span> : null}</td>
                  <td className="px-4 py-2">{s.subscription_status === 'past_due' ? <span className="badge bg-red-100 text-red-700">pagamento pendente</span> : s.plan_id ? <span className="badge bg-green-100 text-green-700">ativo</span> : <span className="badge bg-slate-100 text-slate-500">—</span>}</td>
                  <td className="px-4 py-2 text-slate-500">{day(s.current_period_end)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!isAdmin && <p className="mt-4 text-xs text-slate-500">Só o administrador do escritório contrata ou melhora planos.</p>}
      <p className="mt-6 text-xs text-slate-400 flex items-center gap-1.5">
        <Lock className="w-3.5 h-3.5" /> Pagamento por cartão de crédito, processado com segurança pelo Stripe — o Foro nunca vê o número do cartão. A cobrança de todos os planos vai para o cartão do escritório.
      </p>
    </div>
  )
}
