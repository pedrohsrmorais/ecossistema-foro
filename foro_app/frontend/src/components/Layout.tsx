import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  MessageSquare, Users, LayoutDashboard, CheckSquare, Settings, LogOut, Scale,
  GraduationCap, FileText, LayoutGrid, Sparkles, Landmark, CreditCard, LifeBuoy, Clock, Briefcase, CalendarDays, FlaskConical, Trophy, Users2, Menu,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { modulesApi, settingsApi, officeApi, usersApi } from '../api'
import { LOCKED_FEATURES } from '../config/featureFlags'
import WorkspaceSwitcher from './WorkspaceSwitcher'
import { useState, useEffect, useRef } from 'react'
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
  { to: '/dashboard', label: 'Painel',  icon: LayoutDashboard, module: 'crm', crm: true },
  { to: '/crm-comercial', label: 'CRM Comercial', icon: Users, module: 'crm', access: 'leads', crm: true },
  { to: '/monitoramento-processual', label: 'Monitoramento Processual', icon: Briefcase, module: 'crm', access: 'cases', crm: true },
  { to: '/pesquisa-inteligente', label: 'Pesquisa inteligente', icon: Sparkles, module: null, soon: LOCKED_FEATURES.pesquisaInteligente },
  { to: '/documentos', label: 'Documentos', icon: FileText,   module: 'crm', access: 'documents', crm: true },
  { to: '/agenda',    label: 'Agenda',    icon: CalendarDays, module: 'crm', access: 'agenda', crm: true },
  { to: '/tasks',     label: 'Tarefas', icon: CheckSquare,     module: 'crm', access: 'agenda', crm: true },
  { to: '/quadros',   label: 'Quadros', icon: LayoutGrid,       module: 'crm', access: 'boards', crm: true },
  { to: '/chat',      label: 'IA',      icon: MessageSquare,   module: 'crm', access: 'ai', crm: true },
  { to: '/escritorio', label: 'Escritório', icon: Landmark,    module: null },
]

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
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
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => { setMenuOpen(false) }, [location.pathname])

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
            'flex items-center gap-2.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all border-l-2',
            isActive
              ? 'bg-white/10 text-white border-accent-400'
              : 'text-brand-200 border-transparent hover:bg-white/5 hover:text-white hover:translate-x-0.5'
          )
        }
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="flex-1 min-w-0">{label}</span>
        {soon && <span className="text-[8px] uppercase tracking-wide px-1 py-0.5 rounded bg-white/10 text-accent-300 whitespace-nowrap shrink-0">em breve</span>}
        {to === '/escritorio' && (office?.pending_requests || 0) > 0 && <span className="text-[10px] px-1.5 rounded-full bg-accent-500 text-white">{office?.pending_requests}</span>}
      </NavLink>
    )
  }

  return (
    <ChatProvider>
    <div className="flex h-screen overflow-hidden bg-slate-50 print:block print:h-auto print:overflow-visible">
      {/* Sidebar — navy institucional, não branco: lê mais como backoffice
          jurídico "sério" do que como app de consumidor. */}
      {menuOpen && <div className="fixed inset-0 z-30 bg-black/50 md:hidden print:hidden" onClick={() => setMenuOpen(false)} aria-hidden />}
      <aside className={clsx('w-60 bg-brand-950 flex flex-col shrink-0 print:hidden fixed inset-y-0 left-0 z-40 transition-transform md:static md:translate-x-0', menuOpen ? 'translate-x-0' : '-translate-x-full')} aria-label="Menu principal">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-5 border-b border-white/10">
          <Scale className="w-6 h-6 text-accent-400" />
          <span className="logo-wordmark text-lg text-white flex-1">Foro</span>
          {visible({ module: 'crm' } as NavItem) && hasOffice && <AlertsBell />}
        </div>

        <WorkspaceSwitcher />

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
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

        </nav>

        {/* Plano, Configurações e Suporte ficam fixos (não somem atrás da rolagem em telas baixas) */}
        <div className="px-3 pt-2 pb-1 space-y-0.5 border-t border-white/10">
          {NAV_BOTTOM.filter(visible).map(renderNavItem)}
        </div>

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
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="md:hidden sticky top-0 z-20 flex items-center gap-3 px-4 py-2.5 bg-brand-950 text-white print:hidden">
          <button onClick={() => setMenuOpen(true)} aria-label="Abrir menu" className="p-1 -ml-1 rounded hover:bg-white/10"><Menu className="w-5 h-5" /></button>
          <Scale className="w-5 h-5 text-accent-400" /><span className="logo-wordmark text-base">Foro</span>
        </div>
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
