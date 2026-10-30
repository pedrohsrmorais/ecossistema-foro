import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  MessageSquare, Users, LayoutDashboard, CheckSquare, Settings, LogOut, Scale,
  GraduationCap, FileText, Sparkles, Wand2, Landmark, CreditCard, LifeBuoy, Clock, Briefcase, CalendarDays, Building2, UserSearch, Gavel, FlaskConical, Trophy, Users2, Archive,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { modulesApi, settingsApi, officeApi, usersApi } from '../api'
import { LOCKED_FEATURES } from '../config/featureFlags'
import WorkspaceSwitcher from './WorkspaceSwitcher'
import { useEffect, useRef } from 'react'
import { ChatProvider } from '../context/ChatContext'
import AiDock from './AiDock'
import CreditMeter from './CreditMeter'
import AlertsBell from './AlertsBell'
import clsx from 'clsx'

type NavItem = { to: string; label: string; icon: typeof Scale; module: string | null; access?: string; soon?: boolean; crm?: boolean }

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
  { to: '/chat',      label: 'IA',      icon: MessageSquare,   module: 'crm', access: 'ai', crm: true },
  { to: '/leads',     label: 'Leads',   icon: Users,           module: 'crm', access: 'leads', crm: true },
  { to: '/processos', label: 'Processos', icon: Briefcase,    module: 'crm', access: 'cases', crm: true },
  { to: '/documentos', label: 'Documentos', icon: FileText,   module: 'crm', access: 'documents', crm: true },
  { to: '/agenda',    label: 'Agenda',    icon: CalendarDays, module: 'crm', access: 'agenda', crm: true },
  { to: '/dashboard', label: 'Painel',  icon: LayoutDashboard, module: 'crm', crm: true },
  { to: '/tasks',     label: 'Tarefas', icon: CheckSquare,     module: 'crm', access: 'agenda', crm: true },
  { to: '/escritorio', label: 'Escritório', icon: Landmark,    module: null },
]

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Aplicativos',
    items: [
      { to: '/gerador-documentos',   label: 'Gerador de documentos', icon: Wand2,       module: 'crm', access: 'documents', crm: true },
      { to: '/pesquisa-inteligente', label: 'Pesquisa inteligente',  icon: Sparkles,    module: null, soon: LOCKED_FEATURES.pesquisaInteligente },
      { to: '/consulta-cnpj',        label: 'Consulta CNPJ',         icon: Building2,   module: 'pesquisa_cpf_cnpj', soon: LOCKED_FEATURES.pesquisaCnpj },
      { to: '/consulta-cpf',         label: 'Consulta CPF',          icon: UserSearch,  module: 'pesquisa_cpf_cnpj', soon: LOCKED_FEATURES.pesquisaCpf },
      { to: '/consulta-processual',  label: 'Consulta processual',   icon: Gavel,       module: 'pesquisa_processual', soon: LOCKED_FEATURES.pesquisaProcessual },
      { to: '/processos-salvos',     label: 'Processos salvos',      icon: Archive,     module: 'crm', access: 'cases', crm: true },
    ],
  },
  {
    label: 'Inteligência',
    items: [
      { to: '/education',           label: 'Educação',              icon: GraduationCap, module: 'educacao', soon: LOCKED_FEATURES.educacao },
      { to: '/provas-de-conceito',  label: 'Provas de conceito',    icon: FlaskConical,  module: 'provas_conceito', soon: LOCKED_FEATURES.provasConceito },
      { to: '/desafios-semanais',   label: 'Desafios semanais',     icon: Trophy,        module: 'desafios_semanais', soon: LOCKED_FEATURES.desafios },
      { to: '/comunidade',          label: 'Comunidade',            icon: Users2,        module: 'comunidade', soon: LOCKED_FEATURES.comunidade },
    ],
  },
]

const NAV_BOTTOM: NavItem[] = [
  { to: '/planos',   label: 'Plano e créditos', icon: CreditCard, module: null },
  { to: '/settings', label: 'Configurações', icon: Settings, module: null },
  { to: '/suporte',  label: 'Suporte', icon: LifeBuoy, module: null },
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
  const { data: office } = useQuery({ queryKey: ['office'], queryFn: officeApi.get, staleTime: 30_000 })
  const { data: meP } = useQuery({ queryKey: ['me-profile'], queryFn: usersApi.me, staleTime: 60_000 })
  const hasOffice = true // todo workspace (pessoal ou escritório) é utilizável; o seletor troca entre eles
  const canAccess = (item: NavItem) => !item.access || meP?.permissions?.[('access_' + item.access) as keyof NonNullable<typeof meP.permissions>] !== false
  const visible = (item: NavItem) => (!item.module || !disabledModules.has(item.module)) && canAccess(item)

  // Tempo ativo na aba: um "ping" por minuto enquanto a aba está visível e houve interação recente
  const lastInteraction = useRef(Date.now())
  useEffect(() => {
    if (!hasOffice) return
    const mark = () => { lastInteraction.current = Date.now() }
    const evs = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart']
    evs.forEach(e => window.addEventListener(e, mark, { passive: true }))
    const tick = () => { if (document.visibilityState === 'visible' && Date.now() - lastInteraction.current < 120_000) officeApi.ping().catch(() => {}) }
    const first = setTimeout(tick, 5_000)
    const id = setInterval(tick, 60_000)
    return () => { evs.forEach(e => window.removeEventListener(e, mark)); clearTimeout(first); clearInterval(id) }
  }, [hasOffice])

  function handleLogout() {
    logout()
    navigate('/login')
  }

  function renderNavItem({ to, label, icon: Icon, soon }: NavItem) {
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
        <span className="flex-1">{label}</span>
        {soon && <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/10 text-accent-300">em breve</span>}
        {to === '/escritorio' && (office?.pending_requests || 0) > 0 && <span className="text-[10px] px-1.5 rounded-full bg-accent-500 text-white">{office?.pending_requests}</span>}
      </NavLink>
    )
  }

  return (
    <ChatProvider>
    <div className="flex h-screen overflow-hidden bg-slate-50 print:block print:h-auto print:overflow-visible">
      {/* Sidebar — navy institucional, não branco: lê mais como backoffice
          jurídico "sério" do que como app de consumidor. */}
      <aside className="w-56 bg-brand-950 flex flex-col shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-5 border-b border-white/10">
          <Scale className="w-6 h-6 text-accent-400" />
          <span className="logo-wordmark text-lg text-white flex-1">Foro</span>
          {visible({ module: 'crm' } as NavItem) && hasOffice && <AlertsBell />}
        </div>

        <WorkspaceSwitcher />

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
        {hasOffice && <div className="px-3 pb-3"><CreditMeter /></div>}

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
      {hasOffice && <AiDock />}
    </div>
    </ChatProvider>
  )
}
