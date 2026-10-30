import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { settingsApi, fieldsApi, usersApi, alertsApi } from '../api'

function ProfileSection() {
  const qc = useQueryClient()
  const { data: me } = useQuery({ queryKey: ['me-profile'], queryFn: usersApi.me })
  const [oab, setOab] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const value = oab ?? me?.oab_number ?? ''
  const save = useMutation({
    mutationFn: () => usersApi.updateMe({ oab_number: value.trim() }),
    onSuccess: () => { setMsg({ ok: true, text: 'Salvo.' }); setOab(null); qc.invalidateQueries({ queryKey: ['me-profile'] }) },
    onError: (e: any) => setMsg({ ok: false, text: e?.response?.data?.error || 'Não foi possível salvar.' }),
  })
  return (
    <div className="card p-5">
      <h2 className="font-medium text-slate-900 mb-1">Meu perfil profissional</h2>
      <p className="text-sm text-slate-500 mb-3">O número da OAB assina as peças geradas na área Documentos.</p>
      <form className="flex gap-2 items-center flex-wrap" onSubmit={e => { e.preventDefault(); setMsg(null); save.mutate() }}>
        <input className="input !w-56" placeholder="Ex.: OAB/PR 12345" aria-label="Número da OAB" value={value} maxLength={30} onChange={e => setOab(e.target.value)} />
        <button className="btn-secondary text-sm" disabled={save.isPending || oab === null}>Salvar</button>
        {msg && <span className={msg.ok ? 'text-sm text-green-700' : 'text-sm text-red-600'}>{msg.text}</span>}
      </form>
    </div>
  )
}

function NotificationsSection() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ['alert-prefs'], queryFn: alertsApi.getPrefs })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const toggle = useMutation({
    mutationFn: (v: boolean) => alertsApi.setPrefs(v),
    // marca/desmarca na hora; se o servidor recusar, volta ao valor salvo
    onMutate: (v: boolean) => { qc.setQueryData(['alert-prefs'], (old: any) => old && { ...old, deadlines_email: v }) },
    onSettled: () => qc.invalidateQueries({ queryKey: ['alert-prefs'] }),
    onError: () => setMsg({ ok: false, text: 'Não foi possível salvar. Tente de novo.' }),
  })
  const test = useMutation({
    mutationFn: alertsApi.sendTest,
    onSuccess: r => setMsg({ ok: true, text: `Enviamos um e-mail de teste para ${r.sent_to}. Se não chegar em 1 minuto, olhe o spam / lixeira.` }),
    onError: (e: any) => setMsg({ ok: false, text: e?.response?.data?.error || 'Não foi possível enviar o teste.' }),
  })
  return (
    <div className="card p-5 mb-5">
      <h2 className="font-medium text-slate-900 mb-1">Notificações</h2>
      <p className="text-sm text-slate-500 mb-4">Alertas de prazo no sino do app (sempre ligados) e no seu e-mail.</p>
      <label className="flex items-start gap-3 text-sm cursor-pointer">
        <input type="checkbox" className="mt-0.5 w-4 h-4" checked={!!data?.deadlines_email} disabled={!data || toggle.isPending} onChange={e => toggle.mutate(e.target.checked)} />
        <span>
          <span className="font-medium text-slate-900">Resumo diário de prazos por e-mail</span>
          <span className="block text-slate-500">Às 7h (Brasília), se houver algo vencido, para hoje ou nos próximos 3 dias. Enviado para {data?.email || 'o seu e-mail'}.</span>
        </span>
      </label>
      <div className="mt-4 flex items-center gap-3 flex-wrap">
        <button className="btn-secondary text-sm" onClick={() => { setMsg(null); test.mutate() }} disabled={test.isPending}>
          {test.isPending ? 'Enviando…' : 'Enviar e-mail de teste agora'}
        </button>
        {msg && <p className={msg.ok ? 'text-sm text-green-700' : 'text-sm text-red-600'}>{msg.text}</p>}
      </div>
    </div>
  )
}

export default function Settings() {
  const { data: settings } = useQuery({ queryKey: ['settings'], queryFn: settingsApi.get })
  const { data: plan }     = useQuery({ queryKey: ['plan'],     queryFn: settingsApi.getPlan })
  const { data: fields = [] } = useQuery({ queryKey: ['fields'], queryFn: fieldsApi.list })

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <h1 className="text-xl font-semibold text-slate-900">Configurações</h1>

      {/* Conta */}
      <div className="card p-5">
        <h2 className="font-medium text-slate-900 mb-3">Conta</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex gap-4">
            <dt className="text-slate-500 w-24">Nome</dt>
            <dd className="text-slate-900">{settings?.name}</dd>
          </div>
          <div className="flex gap-4">
            <dt className="text-slate-500 w-24">Plano</dt>
            <dd className="text-slate-900 capitalize">{plan?.name || settings?.plan_id}</dd>
          </div>
          <div className="flex gap-4">
            <dt className="text-slate-500 w-24">Status</dt>
            <dd className={settings?.status === 'active' || settings?.status === 'trialing' ? 'text-green-600' : 'text-amber-600'}>{({ trialing: 'Em teste', active: 'Ativa', expired: 'Encerrada', suspended: 'Suspensa', cancelled: 'Cancelada' } as Record<string, string>)[settings?.status ?? ''] ?? settings?.status}</dd>
          </div>
        </dl>
      </div>

      {/* Campos customizados */}
      <div className="card p-5">
        <h2 className="font-medium text-slate-900 mb-1">Campos do CRM</h2>
        <p className="text-sm text-slate-500 mb-4">
          Use a IA para criar e configurar campos personalizados por ora. Interface completa em breve.
        </p>
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b">
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Nome</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Rótulo</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">Tipo</th>
                <th className="px-4 py-2.5 text-left font-medium text-slate-600">IA</th>
              </tr>
            </thead>
            <tbody>
              {Array.isArray(fields) && fields.map((f: any) => (
                <tr key={f.id} className="border-b last:border-0">
                  <td className="px-4 py-2.5 text-slate-700 font-mono text-xs">{f.name}</td>
                  <td className="px-4 py-2.5 text-slate-900">{f.label}</td>
                  <td className="px-4 py-2.5 text-slate-500">{f.field_type}</td>
                  <td className="px-4 py-2.5">
                    <span className={`badge ${f.collect_via_ai ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                      {f.collect_via_ai ? 'sim' : 'não'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <NotificationsSection />

      <ProfileSection />
      <div className="card p-5">
        <h2 className="font-medium text-slate-900 mb-1">Equipe e permissões</h2>
        <p className="text-sm text-slate-500 mb-3">Convites, módulos liberados, visão dos dados, atividade e plano agora ficam na página do escritório.</p>
        <Link to="/escritorio" className="btn-secondary text-sm inline-flex">Abrir Escritório</Link>
      </div>

    </div>
  )
}
