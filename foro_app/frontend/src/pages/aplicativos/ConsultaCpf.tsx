import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { UserSearch, Search } from 'lucide-react'
import { lookupApi, creditsApi, CpfResult } from '../../api'
import ComingSoon from '../../components/ComingSoon'
import { LOCKED_FEATURES } from '../../config/featureFlags'

function formatCents(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function ConsultaCpfForm() {
  const [cpf, setCpf] = useState('')
  const [result, setResult] = useState<CpfResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: pricesData } = useQuery({ queryKey: ['credits-prices'], queryFn: creditsApi.listPrices })
  const price = pricesData?.prices.find(p => p.service_key === 'cpf_lookup')

  const mutation = useMutation({
    mutationFn: () => lookupApi.cpf(cpf.replace(/\D/g, '')),
    onSuccess: data => { setResult(data); setError(null) },
    onError: (err: any) => { setError(err?.response?.data?.error || 'Erro ao consultar CPF.'); setResult(null) },
  })

  return (
    <div className="p-6 max-w-2xl animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
          <UserSearch className="w-5 h-5 text-accent-500" />
          Consulta de CPF
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Situação cadastral de pessoa física.
          {price && <> Custa {formatCents(price.price_cents)} por consulta, debitado da carteira de créditos.</>}
        </p>
      </div>

      <form
        onSubmit={e => { e.preventDefault(); mutation.mutate() }}
        className="card p-5 flex items-end gap-3 mb-5"
      >
        <div className="flex-1">
          <label className="text-xs font-medium text-slate-600 mb-1 block">CPF</label>
          <input
            className="input"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={e => setCpf(e.target.value)}
            maxLength={14}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={mutation.isPending || cpf.length < 11}>
          <Search className="w-4 h-4" />
          {mutation.isPending ? 'Consultando...' : 'Consultar'}
        </button>
      </form>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {result && (
        <div className="card p-5 animate-fade-in">
          <h2 className="font-medium text-slate-900 mb-3">{result.nome || result.cpf}</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-slate-500">Situação</dt><dd className="text-slate-900">{result.situacao || '—'}</dd></div>
            <div><dt className="text-slate-500">CPF</dt><dd className="text-slate-900">{result.cpf}</dd></div>
          </dl>
        </div>
      )}
    </div>
  )
}

export default function ConsultaCpf() {
  if (LOCKED_FEATURES.pesquisaCpf) {
    return (
      <ComingSoon
        title="Consulta de CPF"
        description="Em breve você vai poder consultar a situação cadastral de pessoas físicas direto por aqui, usando créditos da carteira."
      >
        <ConsultaCpfForm />
      </ComingSoon>
    )
  }
  return <ConsultaCpfForm />
}
