import { Sparkles, Building2, UserSearch, Gavel, ListPlus } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import ConsultaCnpj from './ConsultaCnpj'
import ConsultaCpf from './ConsultaCpf'
import ConsultaDocumento from './ConsultaDocumento'
import EnriquecerLista from './EnriquecerLista'
import { useModuleEnabled } from '../../hooks/useModuleEnabled'

const MODOS = [
  { key: 'inteligente', label: 'Pesquisa inteligente', icon: Sparkles },
  { key: 'cnpj', label: 'Consulta CNPJ', icon: Building2 },
  { key: 'cpf', label: 'Consulta CPF', icon: UserSearch },
  { key: 'lista', label: 'Enriquecer lista', icon: ListPlus },
] as const

/** Uma única área de pesquisa: busca inteligente (detecta CPF/CNPJ), CNPJ, CPF, enriquecimento de listas e (link) processos. */
export default function PesquisaInteligente() {
  const [params, setParams] = useSearchParams()
  const enabled = useModuleEnabled()
  const modos = MODOS.filter(m => enabled('pesquisa_cpf_cnpj') && (m.key !== 'lista' || enabled('crm')))
  const modo = modos.find(m => m.key === params.get('tipo'))?.key || 'inteligente'
  return (
    <div>
      <nav className="px-6 pt-4 flex gap-1 border-b border-slate-200 bg-white/60 flex-wrap" aria-label="Tipo de pesquisa">
        {modos.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setParams(key === 'inteligente' ? {} : { tipo: key })} data-testid={`aba-${key}`}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium -mb-px border-b-2 ${modo === key ? 'border-accent-500 text-accent-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
        {enabled('pesquisa_processual') && (
          <Link to="/monitoramento-processual/pesquisar" className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium -mb-px border-b-2 border-transparent text-slate-500 hover:text-slate-700">
            <Gavel className="w-4 h-4" /> Processo
          </Link>
        )}
      </nav>
      {!enabled('pesquisa_cpf_cnpj') ? (
        <p className="p-6 text-sm text-slate-500">As consultas não estão liberadas para a sua conta.</p>
      ) : modo === 'cnpj' ? <ConsultaCnpj /> : modo === 'cpf' ? <ConsultaCpf /> : modo === 'lista' ? <EnriquecerLista /> : (
        <ConsultaDocumento icon={Sparkles} title="Pesquisa inteligente"
          subtitle="Cole um CPF ou CNPJ — a gente identifica o tipo e traz os contatos. Daí é só criar o lead no CRM ou buscar os processos." />
      )}
    </div>
  )
}
