import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Gavel, Search, Sparkles } from 'lucide-react'
import { lookupApi, creditsApi, ProcessoResult } from '../../api'
import ComingSoon from '../../components/ComingSoon'
import { LOCKED_FEATURES } from '../../config/featureFlags'

function formatCents(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function ConsultaProcessualForm() {
  const [documento, setDocumento] = useState('')
  const [result, setResult] = useState<ProcessoResult | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: pricesData } = useQuery({ queryKey: ['credits-prices'], queryFn: creditsApi.listPrices })
  const lookupPrice = pricesData?.prices.find(p => p.service_key === 'process_lookup')
  const summaryPrice = pricesData?.prices.find(p => p.service_key === 'process_summary_ai')

  const searchMutation = useMutation({
    mutationFn: () => lookupApi.processo(documento.replace(/\D/g, '')),
    onSuccess: data => { setResult(data); setSummary(null); setError(null) },
    onError: (err: any) => { setError(err?.response?.data?.error || 'Erro ao consultar processos.'); setResult(null) },
  })

  const summaryMutation = useMutation({
    mutationFn: () => lookupApi.processoSummary(result!),
    onSuccess: data => { setSummary(data.summary); setError(null) },
    onError: (err: any) => { setError(err?.response?.data?.error || 'Erro ao gerar resumo.') },
  })

  return (
    <div className="p-6 max-w-2xl animate-fade-in">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
          <Gavel className="w-5 h-5 text-accent-500" />
          Consulta processual
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Busca de processos por CPF/CNPJ, com resumo das movimentações gerado por IA.
          {lookupPrice && <> Busca: {formatCents(lookupPrice.price_cents)}.</>}
          {summaryPrice && <> Resumo por IA: {formatCents(summaryPrice.price_cents)}.</>}
        </p>
      </div>

      <form
        onSubmit={e => { e.preventDefault(); searchMutation.mutate() }}
        className="card p-5 flex items-end gap-3 mb-5"
      >
        <div className="flex-1">
          <label className="text-xs font-medium text-slate-600 mb-1 block">CPF ou CNPJ</label>
          <input
            className="input"
            placeholder="Documento da parte"
            value={documento}
            onChange={e => setDocumento(e.target.value)}
            maxLength={18}
          />
        </div>
        <button type="submit" className="btn-primary" disabled={searchMutation.isPending || documento.length < 11}>
          <Search className="w-4 h-4" />
          {searchMutation.isPending ? 'Buscando...' : 'Buscar'}
        </button>
      </form>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {result && (
        <div className="space-y-3 animate-fade-in">
          {result.processos.length === 0 && (
            <div className="card p-5 text-sm text-slate-500">Nenhum processo encontrado para esse documento.</div>
          )}
          {result.processos.map(p => (
            <div key={p.numero_cnj} className="card p-4">
              <p className="font-medium text-slate-900 text-sm">{p.numero_cnj}</p>
              <p className="text-xs text-slate-500 mt-0.5">{p.tribunal} · {p.classe}</p>
              <p className="text-sm text-slate-700 mt-2">{p.ultima_movimentacao}</p>
              <p className="text-xs text-slate-400 mt-1">{p.data_ultima_movimentacao}</p>
            </div>
          ))}

          {result.processos.length > 0 && !summary && (
            <button
              onClick={() => summaryMutation.mutate()}
              className="btn-secondary"
              disabled={summaryMutation.isPending}
            >
              <Sparkles className="w-4 h-4" />
              {summaryMutation.isPending ? 'Gerando resumo...' : 'Gerar resumo por IA'}
            </button>
          )}

          {summary && (
            <div className="card p-5 bg-accent-50/50 border-accent-200">
              <p className="text-xs font-medium text-accent-700 mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Resumo por IA
              </p>
              <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-line">{summary}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function ConsultaProcessual() {
  if (LOCKED_FEATURES.pesquisaProcessual) {
    return (
      <ComingSoon
        title="Consulta processual"
        description="Em breve você vai poder buscar processos por CPF/CNPJ e gerar um resumo em linguagem simples das movimentações, direto por aqui."
      >
        <ConsultaProcessualForm />
      </ComingSoon>
    )
  }
  return <ConsultaProcessualForm />
}
