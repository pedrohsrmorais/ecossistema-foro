import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Building2, User as UserIcon, ChevronsUpDown, Check, Plus, KeyRound } from 'lucide-react'
import clsx from 'clsx'
import { workspacesApi } from '../api'
import { useAuth } from '../context/AuthContext'

/** Seletor de workspace: o espaço pessoal e os escritórios da pessoa. Tudo no CRM (dados, regras, IA, plano) segue o workspace ativo. */
export default function WorkspaceSwitcher() {
  const { enterWorkspace } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { data = [] } = useQuery({ queryKey: ['workspaces'], queryFn: workspacesApi.list, staleTime: 30_000 })
  const current = data.find(w => w.is_current)
  const sw = useMutation({
    mutationFn: (user_id: string) => workspacesApi.switchTo(user_id),
    onSuccess: r => enterWorkspace(r.token),
  })

  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const Icon = current?.kind === 'office' ? Building2 : UserIcon
  return (
    <div className="relative px-3 pt-3" ref={ref} data-testid="workspace-switcher">
      <button onClick={() => setOpen(o => !o)} aria-haspopup="listbox" aria-expanded={open}
        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-md bg-white/5 hover:bg-white/10 text-left transition-colors">
        <Icon className="w-4 h-4 text-accent-300 shrink-0" />
        <span className="flex-1 min-w-0">
          <span className="block text-[10px] uppercase tracking-wide text-brand-300">Workspace ativo</span>
          <span className="block text-sm font-medium text-white truncate">{current?.name || 'Carregando…'}</span>
        </span>
        <ChevronsUpDown className="w-3.5 h-3.5 text-brand-300 shrink-0" />
      </button>
      {open && (
        <div role="listbox" className="absolute left-3 right-3 top-full mt-1 z-30 bg-white rounded-lg shadow-xl border py-1 text-sm">
          {data.map(w => (
            <button key={w.user_id} role="option" aria-selected={w.is_current} disabled={sw.isPending}
              onClick={() => { if (w.is_current) { setOpen(false); return } sw.mutate(w.user_id) }}
              className={clsx('w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50', w.is_current && 'bg-slate-50')}>
              {w.kind === 'office' ? <Building2 className="w-4 h-4 text-slate-500 shrink-0" /> : <UserIcon className="w-4 h-4 text-slate-500 shrink-0" />}
              <span className="flex-1 min-w-0">
                <span className="block text-slate-900 truncate">{w.name}</span>
                <span className="block text-xs text-slate-500">{w.kind === 'personal' ? 'Só você' : `${w.role === 'admin' ? 'Administrador' : 'Membro'} · ${w.members} pessoa(s)`}</span>
              </span>
              {w.is_current && <Check className="w-4 h-4 text-green-600 shrink-0" />}
            </button>
          ))}
          <div className="border-t my-1" />
          <button className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 text-slate-700" onClick={() => { setOpen(false); navigate('/escritorio?novo=criar') }}>
            <Plus className="w-4 h-4" /> Criar escritório
          </button>
          <button className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-slate-50 text-slate-700" onClick={() => { setOpen(false); navigate('/escritorio?novo=entrar') }}>
            <KeyRound className="w-4 h-4" /> Entrar com código
          </button>
        </div>
      )}
    </div>
  )
}
