import { Link } from 'react-router-dom'
import { Users, Briefcase, FileText, CalendarDays, LayoutGrid, Sparkles, ShieldCheck } from 'lucide-react'
import { PublicShell } from './LegalLayout'
import { LEGAL } from '../../lib/legal'

const FEATURES = [
  { icon: Users, title: 'CRM Comercial', text: 'Funil de contatos e propostas, com histórico, tarefas e campos personalizados.' },
  { icon: Briefcase, title: 'Monitoramento Processual', text: 'Processos por área do direito, partes, andamentos, prazos e pesquisa de processos.' },
  { icon: FileText, title: 'Documentos', text: 'Modelos do escritório, rascunhos com IA nos trechos que você marcar e exportação em Word.' },
  { icon: CalendarDays, title: 'Agenda', text: 'Reuniões, audiências e perícias em visão de lista, mês, semana e dia.' },
  { icon: LayoutGrid, title: 'Quadros personalizáveis', text: 'Monte tabelas e quadros Kanban do seu jeito, com permissões definidas pelo escritório.' },
  { icon: Sparkles, title: 'Assistente de IA', text: 'Pergunte, cadastre e consulte por conversa. Ele pede confirmação e respeita as permissões de cada pessoa.' },
]

/** Conteúdo da página inicial pública (sem dependência de login, para também ser pré-renderizado no build). */
export default function HomeContent() {
  return (
    <PublicShell>
      <section className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
          <p className="text-sm font-medium text-accent-700 mb-2">Para escritórios de advocacia</p>
          <h1 className="text-3xl sm:text-5xl font-semibold text-slate-900 max-w-3xl leading-tight">Clientes, processos, documentos e agenda em um só lugar, com IA que trabalha para você.</h1>
          <p className="mt-5 text-lg text-slate-600 max-w-2xl">O {LEGAL.product} organiza a rotina do escritório: do primeiro contato com o cliente ao acompanhamento do processo, com prazos à vista e um assistente que cuida do trabalho repetitivo.</p>
          <div className="mt-8 flex gap-3 flex-wrap">
            <Link to="/register" className="btn-primary">Criar conta grátis</Link>
            <Link to="/login" className="btn-secondary">Entrar</Link>
          </div>
          <p className="mt-3 text-sm text-slate-500">14 dias de teste gratuito.</p>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12" aria-labelledby="recursos">
        <h2 id="recursos" className="text-2xl font-semibold text-slate-900 mb-6">O que você faz no {LEGAL.product}</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(f => (
            <div key={f.title} className="card p-5">
              <f.icon className="w-5 h-5 text-accent-600 mb-2" />
              <h3 className="font-semibold text-slate-900">{f.title}</h3>
              <p className="text-sm text-slate-600 mt-1">{f.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 pb-14" aria-labelledby="google">
        <div className="card p-6 sm:p-8">
          <h2 id="google" className="text-2xl font-semibold text-slate-900 flex items-center gap-2"><CalendarDays className="w-6 h-6 text-accent-600" /> Integração com Google Agenda (opcional)</h2>
          <p className="mt-3 text-slate-700 max-w-3xl">Se você quiser, conecte sua conta Google para <strong>sincronizar sua agenda</strong>: as reuniões, audiências e prazos criados no {LEGAL.product} vão para o Google Agenda, e os eventos de lá aparecem na Agenda do {LEGAL.product}. O {LEGAL.product} não acessa o seu Gmail.</p>
          <p className="mt-3 text-slate-700 max-w-3xl flex gap-2"><ShieldCheck className="w-5 h-5 text-green-600 shrink-0 mt-0.5" /> <span>Você autoriza na tela do Google, escolhe a conta e pode desconectar quando quiser. Os dados do Google não são vendidos, não são usados para publicidade nem para treinar modelos de IA. Saiba mais na <Link to="/privacidade#google" className="text-brand-700 underline">Política de Privacidade</Link> e nos <Link to="/termos" className="text-brand-700 underline">Termos de Serviço</Link>.</span></p>
        </div>
      </section>
    </PublicShell>
  )
}
