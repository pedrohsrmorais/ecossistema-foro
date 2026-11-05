import { Building2 } from 'lucide-react'
import ConsultaDocumento from './ConsultaDocumento'

export default function ConsultaCnpj() {
  return <ConsultaDocumento kind="cnpj" icon={Building2} title="Consulta de CNPJ" subtitle="Dados da empresa, contatos e sócios." />
}
