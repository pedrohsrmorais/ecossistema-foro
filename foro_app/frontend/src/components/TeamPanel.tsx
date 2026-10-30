import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { usersApi, permissionsApi, type Permissions } from '../api'
import { useAuth } from '../context/AuthContext'

export default function TeamPanel({ maxUsers }: { maxUsers?: number }) {
  const qc = useQueryClient()
  const { user: me } = useAuth()
  const isAdmin = me?.role === 'admin'
  const { data: team = [] } = useQuery({ queryKey: ['team'], queryFn: usersApi.list })
  const [form, setForm] = useState({ name: '', email: '', role: 'user' as 'admin' | 'user' })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const fail = (e: any) => setMsg({ ok: false, text: e?.response?.data?.error || 'Não foi possível concluir.' })
  const refresh = () => qc.invalidateQueries({ queryKey: ['team'] })

  const invite = useMutation({
    mutationFn: () => usersApi.invite(form),
    onSuccess: () => { setMsg({ ok: true, text: `Convite enviado para ${form.email}. Peça para a pessoa olhar também o spam/lixeira.` }); setForm({ name: '', email: '', role: 'user' }); refresh() },
    onError: (e) => { fail(e); refresh() },
  })
  const resend = useMutation({ mutationFn: (id: string) => usersApi.resendInvite(id), onSuccess: () => setMsg({ ok: true, text: 'Convite reenviado (confira também o spam/lixeira).' }), onError: fail })
  const toggle = useMutation({ mutationFn: (u: { id: string; active: boolean }) => usersApi.update(u.id, { active: u.active }), onSuccess: () => { setMsg(null); refresh() }, onError: fail })
  const activeCount = team.filter(u => u.active).length
  const { data: defs = [] } = useQuery({ queryKey: ['perm-defs'], queryFn: permissionsApi.defs, staleTime: 10 * 60_000, enabled: isAdmin })
  const [openPerm, setOpenPerm] = useState<string | null>(null)
  const setPerm = useMutation({
    mutationFn: ({ id, p }: { id: string; p: Partial<Permissions> }) => usersApi.update(id, { permissions: p }),
    onSuccess: () => { setMsg(null); refresh() }, onError: fail,
  })

  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="font-medium text-slate-900">Equipe</h2>
        {maxUsers ? <span className="text-xs text-slate-500">{activeCount} de {maxUsers} usuário(s) do plano</span> : null}
      </div>
      <p className="text-sm text-slate-500 mb-4">Convide colegas do escritório. Eles recebem um e-mail para criar a própria senha.</p>

      {msg && <div className={`mb-3 p-3 rounded-lg text-sm border ${msg.ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{msg.text}</div>}

      <div className="overflow-hidden rounded-lg border mb-4">
        <table className="w-full text-sm">
          <tbody>
            {team.map(u => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-4 py-2.5">
                  <div className="text-slate-900">{u.name}{u.id === me?.id && <span className="text-slate-400"> (você)</span>}</div>
                  <div className="text-xs text-slate-500">{u.email}</div>
                </td>
                <td className="px-4 py-2.5 text-slate-500 text-xs">{u.is_owner ? 'Administrador principal' : u.role === 'admin' ? 'Administrador' : 'Membro'}</td>
                <td className="px-4 py-2.5">
                  {!u.active ? <span className="badge bg-slate-100 text-slate-500">inativo</span>
                    : u.pending_invite ? <span className="badge bg-amber-100 text-amber-700 whitespace-nowrap">aguardando e-mail</span>
                    : <span className="badge bg-green-100 text-green-700">ativo</span>}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  {isAdmin && u.active && u.pending_invite && (
                    <button className="text-xs text-brand-600 hover:underline mr-3" onClick={() => resend.mutate(u.id)}>Reenviar convite</button>
                  )}
                  {isAdmin && u.role !== 'admin' && u.active && (
                    <button className="text-xs text-brand-600 hover:underline mr-3" aria-expanded={openPerm === u.id} onClick={() => setOpenPerm(openPerm === u.id ? null : u.id)}>Permissões</button>
                  )}
                  {isAdmin && u.id !== me?.id && !u.is_owner && (
                    <button className="text-xs text-slate-500 hover:text-slate-900" onClick={() => toggle.mutate({ id: u.id, active: !u.active })}>
                      {u.active ? 'Desativar' : 'Reativar'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {isAdmin && openPerm && (() => {
              const u = team.find(x => x.id === openPerm)
              if (!u) return null
              return (
                <tr className="bg-slate-50 border-b">
                  <td colSpan={4} className="px-4 py-3">
                    <div className="grid sm:grid-cols-3 gap-4">
                      {([['module', `Módulos que ${u.name} pode acessar`], ['action', 'Ações liberadas']] as const).map(([g, title]) => (
                        <div key={g}>
                          <p className="text-xs font-medium text-slate-600 mb-2">{title}</p>
                          <div className="space-y-1.5">
                            {defs.filter(d => d.group === g).map(d => (
                              <label key={d.key} className="flex items-start gap-2 text-sm cursor-pointer">
                                <input type="checkbox" className="w-4 h-4 mt-0.5" checked={!!u.permissions?.[d.key]} disabled={setPerm.isPending}
                                  onChange={e => setPerm.mutate({ id: u.id, p: { [d.key]: e.target.checked } })} />
                                <span>{d.label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                      <div>
                        <p className="text-xs font-medium text-slate-600 mb-2">Visão dos dados</p>
                        <select className="input" aria-label="Visão dos dados" value={u.permissions?.view_scope || 'all'} disabled={setPerm.isPending}
                          onChange={e => setPerm.mutate({ id: u.id, p: { view_scope: e.target.value as 'all' | 'own' } })}>
                          <option value="all">Tudo do escritório</option>
                          <option value="own">Apenas o que é meu</option>
                        </select>
                        <p className="text-xs text-slate-400 mt-1.5">“Apenas o que é meu” vale para Leads, Processos e Documentos (os que ele criou, é responsável ou participa). Nessa visão o assistente de IA fica indisponível, porque ele consulta o escritório inteiro.</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-400 mt-3">Administradores sempre podem tudo.</p>
                  </td>
                </tr>
              )
            })()}
          </tbody>
        </table>
      </div>

      {isAdmin ? (
        <form className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto] gap-2" onSubmit={e => { e.preventDefault(); setMsg(null); invite.mutate() }}>
          <input className="input" placeholder="Nome" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
          <input className="input" type="email" placeholder="E-mail" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
          <select className="input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as 'admin' | 'user' }))}>
            <option value="user">Membro</option>
            <option value="admin">Administrador</option>
          </select>
          <button className="btn-primary justify-center" disabled={invite.isPending}>{invite.isPending ? 'Enviando...' : 'Convidar'}</button>
        </form>
      ) : <p className="text-xs text-slate-400">Só administradores podem convidar pessoas.</p>}
    </div>
  )
}
