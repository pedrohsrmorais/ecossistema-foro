import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi, fieldsApi, creditsApi, type Payment } from '../api'

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

      {/* Créditos */}
      <CreditsSection />
    </div>
  )
}
