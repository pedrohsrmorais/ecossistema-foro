import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  MessageSquare, Users, LayoutDashboard, CheckSquare, Settings, LogOut, Scale,
  GraduationCap, Sparkles, CreditCard, Clock, Building2, UserSearch, Gavel, FlaskConical, Trophy, Users2,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { modulesApi, settingsApi } from '../api'
import { ChatProvider } from '../context/ChatContext'
import AiDock from './AiDock'
import CreditMeter from './CreditMeter'
import clsx from 'clsx'

type NavItem = { to: string; label: string; icon: typeof Scale; module: string | null }

// `module` é opcional: item sem módulo associado nunca é escondido. Os
// demais só aparecem se o módulo estiver ativo pra conta — ver GET /modules
// e modules.middleware.js::requireModule no backend.
//
// A IA é o produto core (não é "um app"), por isso fica solta no topo junto
// com CRM. "Aplicativos" e "Inteligência" são as duas frentes do ecossistema:
// a primeira reúne ferramentas utilitárias avulsas (consultas pagas, que vão
// crescendo com o tempo); a segunda reúne o conteúdo educativo e tudo que
// gira em torno dele (provas de conceito, desafios semanais).
const NAV_TOP: NavItem[] = [
  { to: '/chat',      label: 'IA',      icon: MessageSquare,   module: 'crm' },
  { to: '/leads',     label: 'Leads',   icon: Users,           module: 'crm' },
  { to: '/dashboard', label: 'Painel',  icon: LayoutDashboard, module: 'crm' },
  { to: '/tasks',     label: 'Tarefas', icon: CheckSquare,     module: 'crm' },
]

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Aplicativos',
    items: [
      { to: '/pesquisa-inteligente', label: 'Pesquisa inteligente',  icon: Sparkles,    module: null },
      { to: '/consulta-cnpj',        label: 'Consulta CNPJ',         icon: Building2,   module: 'pesquisa_cpf_cnpj' },
      { to: '/consulta-cpf',         label: 'Consulta CPF',          icon: UserSearch,  module: 'pesquisa_cpf_cnpj' },
      { to: '/consulta-processual',  label: 'Consulta processual',   icon: Gavel,       module: 'pesquisa_processual' },
    ],
  },
  {
    label: 'Inteligência',
    items: [
      { to: '/education',           label: 'Educação',              icon: GraduationCap, module: 'educacao' },
      { to: '/provas-de-conceito',  label: 'Provas de conceito',    icon: FlaskConical,  module: 'provas_conceito' },
      { to: '/desafios-semanais',   label: 'Desafios semanais',     icon: Trophy,        module: 'desafios_semanais' },
      { to: '/comunidade',          label: 'Comunidade',            icon: Users2,        module: 'comunidade' },
    ],
  },
]

const NAV_BOTTOM: NavItem[] = [
  { to: '/planos',   label: 'Plano e créditos', icon: CreditCard, module: null },
  { to: '/settings', label: 'Configurações', icon: Settings, module: null },
]

export default function Layout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Enquanto não carrega, mostra tudo (evita flicker) — depois de carregar,
  // esconde o que o admin da plataforma desativou pra essa conta.
  const { data: modules } = useQuery({ queryKey: ['modules'], queryFn: modulesApi.list, staleTime: 5 * 60 * 1000 })
  const disabledModules = new Set((modules || []).filter(m => !m.enabled).map(m => m.module_key))
  const { data: plan } = useQuery({ queryKey: ['plan'], queryFn: settingsApi.getPlan, staleTime: 60_000 })
  const trialDaysLeft = plan?.account_status === 'trialing' && plan?.trial_ends_at
    ? Math.ceil((new Date(plan.trial_ends_at).getTime() - Date.now()) / 86_400_000)
    : null
  const visible = (item: NavItem) => !item.module || !disabledModules.has(item.module)

  function handleLogout() {
    logout()
    navigate('/login')
  }

  function renderNavItem({ to, label, icon: Icon }: NavItem) {
    return (
      <NavLink
        key={to}
        to={to}
        className={({ isActive }) =>
          clsx(
            'flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-all border-l-2',
            isActive
              ? 'bg-white/10 text-white border-accent-400'
              : 'text-brand-200 border-transparent hover:bg-white/5 hover:text-white hover:translate-x-0.5'
          )
        }
      >
        <Icon className="w-4 h-4 shrink-0" />
        {label}
      </NavLink>
    )
  }

  return (
    <ChatProvider>
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Sidebar — navy institucional, não branco: lê mais como backoffice
          jurídico "sério" do que como app de consumidor. */}
      <aside className="w-56 bg-brand-950 flex flex-col shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-5 border-b border-white/10">
          <Scale className="w-6 h-6 text-accent-400" />
          <span className="logo-wordmark text-lg text-white">Foro</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_TOP.filter(visible).map(renderNavItem)}

          {NAV_SECTIONS.map(section => {
            const items = section.items.filter(visible)
            if (items.length === 0) return null
            return (
              <div key={section.label} className="pt-3">
                <p className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-accent-400/80">
                  {section.label}
                </p>
                {items.map(renderNavItem)}
              </div>
            )
          })}

          <div className="pt-3">
            {NAV_BOTTOM.filter(visible).map(renderNavItem)}
          </div>
        </nav>

        {/* Créditos de IA da semana — regra tokens → créditos no tooltip */}
        <div className="px-3 pb-3"><CreditMeter /></div>

        {/* User */}
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="w-8 h-8 rounded-full bg-accent-500/20 text-accent-300 flex items-center justify-center text-sm font-semibold shrink-0">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.name}</p>
              <p className="text-xs text-brand-300 truncate">{user?.role}</p>
            </div>
            <button onClick={handleLogout} className="p-1 text-brand-300 hover:text-white rounded" title="Sair">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main — key pelo pathname faz cada troca de rota remontar com um
          fade-in sutil, em vez de trocar o conteúdo seco. */}
      <main className="flex-1 overflow-y-auto">
        {trialDaysLeft !== null && (
          <div className="flex items-center justify-between gap-3 px-6 py-2 bg-accent-50 border-b border-accent-200 text-sm text-accent-800">
            <span className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              {trialDaysLeft > 0
                ? `Teste grátis: ${trialDaysLeft} ${trialDaysLeft === 1 ? 'dia restante' : 'dias restantes'}.`
                : 'Seu teste grátis termina hoje.'}
            </span>
            <NavLink to="/planos" className="font-medium underline">Escolher um plano</NavLink>
          </div>
        )}
        <div key={location.pathname} className="animate-fade-in">
          <Outlet />
        </div>
      </main>
      <AiDock />
    </div>
    </ChatProvider>
  )
}
