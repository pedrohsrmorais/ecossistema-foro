import { UserSearch } from 'lucide-react'
import ConsultaDocumento from './ConsultaDocumento'

export default function ConsultaCpf() {
  return <ConsultaDocumento kind="cpf" icon={UserSearch} title="Consulta de CPF" subtitle="Nome, telefones, e-mails e endereços de pessoa física." />
}
