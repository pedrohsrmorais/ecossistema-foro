import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { LifeBuoy, Mail, MessageCircle, ChevronDown, Clock, CheckCircle2, AlertTriangle } from 'lucide-react'
import clsx from 'clsx'
import { supportApi } from '../api'

const CATEGORIES: { key: string; label: string }[] = [
  { key: 'duvida', label: 'Dúvida de uso' },
  { key: 'problema', label: 'Algo não está funcionando' },
  { key: 'cobranca', label: 'Cobrança / plano' },
  { key: 'sugestao', label: 'Sugestão' },
  { key: 'outro', label: 'Outro assunto' },
]
const STATUS = { aberto: { label: 'Aberto', cls: 'bg-amber-100 text-amber-700' }, respondido: { label: 'Respondido', cls: 'bg-green-100 text-green-700' }, fechado: { label: 'Fechado', cls: 'bg-slate-100 text-slate-500' } } as const

const FAQ: { q: string; a: string }[] = [
  { q: 'Não recebi o e-mail de confirmação ou do resumo de prazos.', a: 'Olhe a caixa de spam, o lixo eletrônico e a lixeira: às vezes o e-mail cai lá. Marque como "não é spam" para os próximos chegarem na caixa de entrada. Em Configurações → Notificações você pode pedir um e-mail de teste.' },
  { q: 'Como funcionam os alertas de prazo?', a: 'O sino no topo do menu mostra o que venceu, o que vence hoje e os próximos 7 dias. Às 7h você também recebe um resumo por e-mail quando há algo vencido, para hoje ou nos próximos 3 dias. Cadastre o prazo em Tarefas (marcando "prazo processual") ou dentro do processo, para ele aparecer no alerta.' },
  { q: 'Como ligo um cliente a um processo?', a: 'Abra o cliente (Leads) e use "Novo processo" ou "Vincular existente" no cartão Processos. Ou abra o processo e escolha o cliente no campo "Cliente". Os dois lados passam a se mostrar.' },
  { q: 'Como funcionam os créditos de IA?', a: 'Os créditos renovam toda semana, a partir da data de início do seu plano. Cada resposta consome créditos conforme o tamanho do texto; o valor aparece no chat. Detalhes em Plano e créditos.' },
  { q: 'Como troco de plano, atualizo o cartão ou cancelo?', a: 'Em Plano e créditos, clique em "Gerenciar assinatura" (só administradores). Você vai para o portal seguro do Stripe, onde troca de plano, atualiza o cartão, baixa faturas e cancela. O acesso continua até o fim do período já pago.' },
  { q: 'Meus dados ficam seguros?', a: 'Cada escritório só enxerga os próprios dados, o acesso é protegido por senha e há registro de alterações. Para pedidos sobre dados pessoais (LGPD), abra um chamado aqui.' },
]

export default function Support() {
  const qc = useQueryClient()
  const loc = useLocation()
  const { data: info } = useQuery({ queryKey: ['support-info'], queryFn: supportApi.info, staleTime: 5 * 60_000 })
  const { data: tickets = [] } = useQuery({ queryKey: ['support-tickets'], queryFn: supportApi.list })
  const [open, setOpen] = useState<number | null>(0)
  const [form, setForm] = useState({ category: 'duvida', subject: '', message: '' })
  const [done, setDone] = useState<{ emailed: boolean; reply_to: string } | null>(null)
  const [error, setError] = useState('')

  const send = useMutation({
    mutationFn: () => supportApi.create({ ...form, page: loc.state?.from || undefined }),
    onSuccess: r => { setDone({ emailed: r.emailed, reply_to: r.reply_to }); setForm(f => ({ ...f, subject: '', message: '' })); setError(''); qc.invalidateQueries({ queryKey: ['support-tickets'] }) },
    onError: (e: any) => setError(e?.response?.data?.error || 'Não foi possível enviar. Tente de novo em instantes.'),
  })
  const valid = form.subject.trim().length >= 3 && form.message.trim().length >= 10

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2"><LifeBuoy className="w-5 h-5 text-accent-500" /> Suporte</h1>
      <p className="text-sm text-slate-500 mb-5">Respondemos por e-mail. {info?.hours}</p>

      <div className="grid md:grid-cols-[1fr_300px] gap-5">
        <div className="space-y-5">
          <section className="card p-5">
            <h2 className="font-medium text-slate-900 mb-3">Abrir um chamado</h2>
            {done && (
              <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
                <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
                <span>Chamado recebido! A resposta vai para <strong>{done.reply_to}</strong> — se não chegar, confira o spam / lixeira.{!done.emailed && ' (Seu chamado ficou registrado e nossa equipe será avisada.)'}</span>
              </div>
            )}
            {error && <div className="flex items-start gap-2 p-3 mb-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />{error}</div>}
            <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (valid) { setDone(null); send.mutate() } }}>
              <div>
                <label className="block text-sm text-slate-600 mb-1" htmlFor="sp-cat">Assunto geral</label>
                <select id="sp-cat" className="input" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                  {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1" htmlFor="sp-sub">Título</label>
                <input id="sp-sub" className="input" maxLength={200} placeholder="Resuma em uma frase" value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm text-slate-600 mb-1" htmlFor="sp-msg">Conte o que aconteceu</label>
                <textarea id="sp-msg" className="input min-h-[140px]" maxLength={5000} placeholder="O que você tentou fazer, o que esperava e o que aconteceu. Se der erro, copie a mensagem." value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} />
                <p className="text-xs text-slate-400 mt-1">{form.message.length}/5000</p>
              </div>
              <button className="btn-primary" disabled={!valid || send.isPending}>{send.isPending ? 'Enviando…' : 'Enviar chamado'}</button>
            </form>
          </section>

          <section className="card p-5">
            <h2 className="font-medium text-slate-900 mb-3">Perguntas frequentes</h2>
            <ul className="divide-y">
              {FAQ.map((f, i) => (
                <li key={i}>
                  <button className="w-full flex items-center gap-2 py-3 text-left" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                    <span className="flex-1 text-sm font-medium text-slate-900">{f.q}</span>
                    <ChevronDown className={clsx('w-4 h-4 text-slate-400 transition-transform', open === i && 'rotate-180')} />
                  </button>
                  {open === i && <p className="pb-3 text-sm text-slate-600">{f.a}</p>}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="space-y-5">
          <section className="card p-5 text-sm">
            <h2 className="font-medium text-slate-900 mb-3">Outros canais</h2>
            <ul className="space-y-3">
              {info?.email && <li className="flex gap-2"><Mail className="w-4 h-4 text-slate-400 mt-0.5" /><a className="text-brand-700 hover:underline break-all" href={`mailto:${info.email}`}>{info.email}</a></li>}
              {info?.whatsapp && <li className="flex gap-2"><MessageCircle className="w-4 h-4 text-slate-400 mt-0.5" /><a className="text-brand-700 hover:underline" target="_blank" rel="noreferrer" href={`https://wa.me/${info.whatsapp}`}>WhatsApp</a></li>}
              <li className="flex gap-2 text-slate-500"><Clock className="w-4 h-4 text-slate-400 mt-0.5" />{info?.hours}</li>
            </ul>
            {!info?.email && !info?.whatsapp && <p className="text-slate-500">Use o formulário ao lado: ele chega direto para a nossa equipe.</p>}
          </section>

          <section className="card p-5 text-sm">
            <h2 className="font-medium text-slate-900 mb-3">Seus chamados</h2>
            {tickets.length === 0 ? <p className="text-slate-400">Nenhum chamado ainda.</p> : (
              <ul className="divide-y">
                {tickets.map(t => (
                  <li key={t.id} className="py-2">
                    <p className="text-slate-800 truncate">{t.subject}</p>
                    <p className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                      <span className={clsx('badge !py-0', STATUS[t.status].cls)}>{STATUS[t.status].label}</span>
                      {new Date(t.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
