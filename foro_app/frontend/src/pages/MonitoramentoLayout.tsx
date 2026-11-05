import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom'
import { useModuleEnabled } from '../hooks/useModuleEnabled'
import { Briefcase, Search } from 'lucide-react'
import clsx from 'clsx'

const TABS = [
  { to: '/monitoramento-processual', label: 'Meus processos', icon: Briefcase, end: true, module: null as string | null },
  { to: '/monitoramento-processual/pesquisar', label: 'Pesquisar', icon: Search, end: false, module: 'pesquisa_processual' },
]

/** Área "Monitoramento Processual": meus processos + pesquisa, na mesma tela com abas. */
export default function MonitoramentoLayout() {
  const enabled = useModuleEnabled()
  const { pathname } = useLocation()
  if (pathname.endsWith('/pesquisar') && !enabled('pesquisa_processual')) return <Navigate to="/monitoramento-processual" replace />
  return (
    <div>
      <nav className="px-6 pt-4 flex gap-1 border-b border-slate-200 bg-white/60" aria-label="Monitoramento Processual">
        {TABS.filter(t => !t.module || enabled(t.module)).map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end}
            className={({ isActive }) => clsx('flex items-center gap-1.5 px-4 py-2 text-sm font-medium -mb-px border-b-2',
              isActive ? 'border-accent-500 text-accent-600' : 'border-transparent text-slate-500 hover:text-slate-700')}>
            <Icon className="w-4 h-4" /> {label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
