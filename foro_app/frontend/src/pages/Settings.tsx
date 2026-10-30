import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi, fieldsApi, creditsApi, usersApi, type Payment } from '../api'
import { LOCKED_FEATURES } from '../config/featureFlags'
import { useAuth } from '../context/AuthContext'

function formatCents(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function CreditsSection() {
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('50')
  const [pixPayment, setPixPayment] = useState<Payment | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: balanceData } = useQuery({ queryKey: ['credits-balance'], queryFn: creditsApi.getBalance })
  const { data: pricesData }  = useQuery({ queryKey: ['credits-prices'], queryFn: creditsApi.listPrices })
  const { data: txData }      = useQuery({ queryKey: ['credits-transactions'], queryFn: () => creditsApi.listTransactions({ limit: 10 }) })

  const purchaseMutation = useMutation({
    mutationFn: () => creditsApi.purchasePix({ amount: Number(amount), description: 'Recarga de créditos Foro' }),
    onSuccess: (payment) => { setPixPayment(payment); setError(null) },
    onError: () => setError('Erro na requisição. Tente novamente em alguns minutos ou contate o suporte.'),
  })

  const refreshBalance = () => queryClient.invalidateQueries({ queryKey: ['credits-balance'] })

  return (
    <div className="card p-5">
      <h2 className="font-medium text-slate-900 mb-1">Créditos</h2>
      <p className="text-sm text-slate-500 mb-4">
        Usados para consultas de CPF/CNPJ, consulta processual e resumo de processo por IA.
        Em caso de erro na consulta, o crédito é devolvido automaticamente — não é necessário solicitar nada.
      </p>

      <div className="flex items-center justify-between mb-4 p-3 rounded-lg bg-slate-50 border">
        <span className="text-sm text-slate-600">Saldo atual</span>
        <button onClick={refreshBalance} className="text-lg font-semibold text-slate-900">
          {balanceData ? formatCents(balanceData.balance_cents) : '—'}
        </button>
      </div>

      {Array.isArray(pricesData?.prices) && pricesData.prices.length > 0 && (
        <div className="mb-4 overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b">
                <th className="px-4 py-2 text-left font-medium text-slate-600">Serviço</th>
                <th className="px-4 py-2 text-right font-medium text-slate-600">Custo</th>
              </tr>
            </thead>
            <tbody>
              {pricesData.prices.map(p => (
                <tr key={p.service_key} className="border-b last:border-0">
                  <td className="px-4 py-2 text-slate-700">{p.name}</td>
                  <td className="px-4 py-2 text-right text-slate-900">{formatCents(p.price_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Recarga via PIX */}
      <div className="mb-2">
        <label className="block text-sm text-slate-600 mb-1">Recarregar via PIX (R$)</label>
        <div className="flex gap-2">
          <input
            type="number" min="1" step="1" value={amount}
            onChange={e => setAmount(e.target.value)}
            className="input flex-1" placeholder="50"
          />
          <button
            onClick={() => purchaseMutation.mutate()}
            disabled={purchaseMutation.isPending}
            className="btn-primary px-4"
          >
            {purchaseMutation.isPending ? 'Gerando...' : 'Gerar PIX'}
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}

      {pixPayment?.pix_qr_code && (
        <div className="mt-4 p-4 rounded-lg border bg-white flex flex-col items-center gap-2">
          <img
            src={`data:image/png;base64,${pixPayment.pix_qr_code}`}
            alt="QR Code PIX"
            className="w-48 h-48"
          />
          {pixPayment.pix_copy_paste && (
            <textarea
              readOnly
              value={pixPayment.pix_copy_paste}
              className="input text-xs w-full"
              rows={3}
              onClick={e => (e.target as HTMLTextAreaElement).select()}
            />
          )}
          <p className="text-xs text-slate-500">
            Após a confirmação do pagamento o saldo é creditado automaticamente.
          </p>
        </div>
      )}

      {Array.isArray(txData?.transactions) && txData.transactions.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-slate-700 mb-2">Últimas movimentações</h3>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <tbody>
                {txData.transactions.map(tx => (
                  <tr key={tx.id} className="border-b last:border-0">
                    <td className="px-4 py-2 text-slate-500 text-xs">{new Date(tx.created_at).toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-2 text-slate-700 capitalize">{tx.type}</td>
                    <td className={`px-4 py-2 text-right font-medium ${tx.amount_cents >= 0 ? 'text-green-600' : 'text-slate-900'}`}>
                      {tx.amount_cents >= 0 ? '+' : ''}{formatCents(tx.amount_cents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function TeamSection({ maxUsers }: { maxUsers?: number }) {
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
                <td className="px-4 py-2.5 text-slate-500 text-xs">{u.role === 'admin' ? 'Administrador' : 'Membro'}</td>
                <td className="px-4 py-2.5">
                  {!u.active ? <span className="badge bg-slate-100 text-slate-500">inativo</span>
                    : u.pending_invite ? <span className="badge bg-amber-100 text-amber-700 whitespace-nowrap">aguardando e-mail</span>
                    : <span className="badge bg-green-100 text-green-700">ativo</span>}
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  {isAdmin && u.active && u.pending_invite && (
                    <button className="text-xs text-brand-600 hover:underline mr-3" onClick={() => resend.mutate(u.id)}>Reenviar convite</button>
                  )}
                  {isAdmin && u.id !== me?.id && (
                    <button className="text-xs text-slate-500 hover:text-slate-900" onClick={() => toggle.mutate({ id: u.id, active: !u.active })}>
                      {u.active ? 'Desativar' : 'Reativar'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
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
            <dd className="text-green-600 capitalize">{settings?.status}</dd>
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

      <TeamSection maxUsers={plan?.max_users ?? undefined} />

      {/* Carteira de créditos: só faz sentido quando as consultas pagas forem liberadas */}
      {!LOCKED_FEATURES.pesquisaCnpj && <CreditsSection />}
    </div>
  )
}
