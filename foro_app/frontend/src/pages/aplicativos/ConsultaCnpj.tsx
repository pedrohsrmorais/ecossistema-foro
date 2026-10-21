import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Building2, Search } from 'lucide-react'
import { lookupApi, creditsApi, CnpjResult } from '../../api'
import ComingSoon from '../../components/ComingSoon'
import { LOCKED_FEATURES } from '../../config/featureFlags'

function formatCents(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function ConsultaCnpjForm() {
  const [cnpj, setCnpj] = useState('')
  const [result, setResult] = useState<CnpjResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: pricesData } = useQuery({ queryKey: ['credits-prices'], queryFn: creditsApi.listPrices })
  const price = pricesData?.prices.find(p => p.service_key === 'cnpj_lookup')

  const mutation = useMutation({
    mutationFn: () => lookupApi.cnpj(cnpj.replace(/\D/g, '')),
    onSuccess: data => { setResult(data); setError(null) },
    onError: (err: any) => { setError(err?.response?.data?.error || 'Erro ao consultar CNPJ.'); setResult(null) },
  })

  return (
    <div className="p-6 max-w-2xl animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
          <Building2 className="w-5 h-5 text-accent-500" />
          Consulta de CNPJ
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Dados cadastrais de empresas — razão social, situação, data de abertura.
          {price && <> Custa {formatCents(price.price_cents)} por consulta, debitado da carteira de créditos.</>}
        </p>
      </div>

      <form
        onSubmit={e => { e.preventDefault(); mutation.mutate() }}
        className="card p-5 flex items-end gap-3 mb-5"
      >
        <div className="flex-1">
          <label className="text-xs font-medium text-slate-600 mb-1 block">CNPJ</label>
          <input
            className="input"
            placeholder="00.000.000/0000-00"
            value={cnpj}
            onChange={e => setCnpj(e.target.value)}
            maxLength={18}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={mutation.isPending || cnpj.length < 11}>
          <Search className="w-4 h-4" />
          {mutation.isPending ? 'Consultando...' : 'Consultar'}
        </button>
      </form>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {result && (
        <div className="card p-5 animate-fade-in">
          <h2 className="font-medium text-slate-900 mb-3">{result.razao_social || result.cnpj}</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-slate-500">Nome fantasia</dt><dd className="text-slate-900">{result.nome_fantasia || '—'}</dd></div>
            <div><dt className="text-slate-500">Situação cadastral</dt><dd className="text-slate-900">{result.situacao_cadastral || '—'}</dd></div>
            <div><dt className="text-slate-500">Data de abertura</dt><dd className="text-slate-900">{result.data_abertura || '—'}</dd></div>
            <div><dt className="text-slate-500">CNPJ</dt><dd className="text-slate-900">{result.cnpj}</dd></div>
          </dl>
        </div>
      )}
    </div>
  )
}

export default function ConsultaCnpj() {
  if (LOCKED_FEATURES.pesquisaCnpj) {
    return (
      <ComingSoon
        title="Consulta de CNPJ"
        description="Em breve você vai poder consultar dados cadastrais de empresas direto por aqui, usando créditos da carteira."
      >
        <ConsultaCnpjForm />
      </ComingSoon>
    )
  }
  return <ConsultaCnpjForm />
}
