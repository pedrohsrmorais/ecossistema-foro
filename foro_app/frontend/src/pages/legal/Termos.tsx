import { Link } from 'react-router-dom'
import { useEffect } from 'react'
import LegalDoc, { type LegalSection } from './LegalLayout'
import { LEGAL } from '../../lib/legal'

const mail = <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>

const sections: LegalSection[] = [
  { id: 'aceite', title: 'Aceitação', body: (<p>Ao criar uma conta ou usar o {LEGAL.product}, você declara que leu e concorda com estes Termos e com a <Link to="/privacidade">Política de Privacidade</Link>. Se você usa o {LEGAL.product} em nome de um escritório, declara ter autoridade para vinculá-lo a estes Termos.</p>) },
  { id: 'servico', title: 'O que é o Foro', body: (<p>O {LEGAL.product} é uma plataforma online (software como serviço) que reúne CRM comercial, monitoramento e organização de processos, geração e gestão de documentos, agenda, tarefas, quadros personalizáveis e um assistente de inteligência artificial para escritórios de advocacia. Algumas funcionalidades podem estar marcadas como “em breve” e ainda não estar disponíveis.</p>) },
  { id: 'conta', title: 'Conta, escritórios e acessos', body: (<>
    <ul>
      <li>Você deve fornecer informações verdadeiras, manter a senha em sigilo e nos avisar de qualquer uso indevido da conta.</li>
      <li>O <strong>administrador do escritório</strong> convida pessoas, define o que cada uma pode acessar (inclusive criar quadros e usar a IA) e responde pelo uso da plataforma pela equipe.</li>
      <li>É preciso ter 18 anos ou mais e capacidade legal para contratar.</li>
    </ul>
  </>) },
  { id: 'planos', title: 'Planos, pagamento e cancelamento', body: (<ul>
    <li>Há um período de teste gratuito e planos pagos por usuário, com valores e limites exibidos na página <Link to="/planos">Plano e créditos</Link>. O plano Consulting é contratado sob consulta.</li>
    <li>Os pagamentos são processados pelo Stripe, com renovação automática mensal até o cancelamento. Você pode cancelar a qualquer momento pelo portal de cobrança; o acesso segue até o fim do período já pago.</li>
    <li>Os créditos de IA renovam semanalmente conforme o plano e não são cumulativos nem reembolsáveis.</li>
    <li>Podemos reajustar preços mediante aviso prévio; o novo valor vale a partir do ciclo seguinte.</li>
  </ul>) },
  { id: 'uso', title: 'Uso aceitável', body: (<>
    <p>Você concorda em não:</p>
    <ul>
      <li>usar a plataforma para fins ilegais ou para violar direitos de terceiros, inclusive sigilo profissional e proteção de dados;</li>
      <li>tentar acessar dados de outros escritórios, burlar limites, testar vulnerabilidades sem autorização ou sobrecarregar o serviço;</li>
      <li>copiar, revender ou fazer engenharia reversa do software, ou compartilhar sua conta com pessoas fora do escritório;</li>
      <li>enviar conteúdo malicioso ou usar a IA para gerar conteúdo ilícito.</li>
    </ul>
  </>) },
  { id: 'dados', title: 'Seus dados e o sigilo profissional', body: (<ul>
    <li>O conteúdo que você cadastra continua sendo <strong>seu</strong>. Você nos autoriza a tratá-lo somente para prestar o serviço, conforme a Política de Privacidade.</li>
    <li>Você é responsável por ter base legal para inserir dados de clientes e terceiros na plataforma e por cumprir seus deveres éticos e de sigilo. Nesse tratamento, o escritório é o controlador e o {LEGAL.product} é o operador.</li>
    <li>Você pode exportar e pedir a exclusão dos seus dados conforme a Política de Privacidade.</li>
  </ul>) },
  { id: 'ia', title: 'Inteligência artificial', body: (<ul>
    <li>As respostas, resumos e rascunhos gerados por IA podem conter erros e <strong>não substituem a análise de um profissional habilitado</strong>. A revisão e a decisão final são sempre suas.</li>
    <li>A IA age dentro das permissões do usuário e pede confirmação antes de alterar dados; as ações ficam registradas e podem ser desfeitas quando possível.</li>
    <li>Referências legais apresentadas nos modelos seguem uma lista curada, mas podem ficar desatualizadas; confira a fonte oficial.</li>
  </ul>) },
  { id: 'google', title: 'Integrações com terceiros (Google)', body: (<ul>
    <li>A conexão com o Google (Gmail e Agenda) é opcional, depende da sua autorização e é regida também pelos termos do Google. Os dados do Google são tratados conforme a seção 3 da <Link to="/privacidade#google">Política de Privacidade</Link>, inclusive os requisitos de Uso Limitado.</li>
    <li>Você pode desconectar a qualquer momento nas configurações do {LEGAL.product} ou em <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>.</li>
    <li>Não controlamos a disponibilidade das APIs de terceiros; mudanças feitas por eles podem afetar a integração.</li>
  </ul>) },
  { id: 'propriedade', title: 'Propriedade intelectual', body: (<p>O software, a marca {LEGAL.product}, o layout e os modelos-base são do {LEGAL.product} ou de seus licenciantes. Concedemos a você uma licença limitada, não exclusiva e intransferível para usar a plataforma enquanto a conta estiver ativa. Sugestões que você nos enviar podem ser usadas para melhorar o serviço, sem obrigação de pagamento.</p>) },
  { id: 'disponibilidade', title: 'Disponibilidade e suporte', body: (<p>Trabalhamos para manter o serviço disponível e seguro, mas ele é fornecido “no estado em que se encontra”, podendo haver interrupções para manutenção ou por falhas de terceiros. O suporte é prestado por e-mail ({mail}) e pela página de Suporte.</p>) },
  { id: 'responsabilidade', title: 'Limitação de responsabilidade', body: (<p>Na máxima extensão permitida em lei, o {LEGAL.product} não responde por lucros cessantes, perda de oportunidade, prazos perdidos ou danos indiretos decorrentes do uso da plataforma, da IA ou de integrações de terceiros, e a responsabilidade total fica limitada ao valor pago pelo contratante nos 12 meses anteriores ao fato. Nada aqui afasta direitos que a lei não permita limitar, inclusive os do consumidor, quando aplicável. O controle dos prazos processuais continua sendo responsabilidade do profissional.</p>) },
  { id: 'encerramento', title: 'Suspensão e encerramento', body: (<p>Você pode encerrar a conta quando quiser. Podemos suspender ou encerrar o acesso em caso de violação destes Termos, uso que cause risco à plataforma ou falta de pagamento, com aviso sempre que possível. Após o encerramento, os dados são tratados conforme a Política de Privacidade.</p>) },
  { id: 'alteracoes', title: 'Alterações destes Termos', body: (<p>Podemos atualizar estes Termos. Avisaremos mudanças relevantes dentro da plataforma ou por e-mail com antecedência razoável. O uso após a vigência da mudança indica concordância; se não concordar, você pode cancelar.</p>) },
  { id: 'lei', title: 'Lei aplicável e contato', body: (<p>Estes Termos são regidos pelas leis do Brasil. Fica eleito o foro da comarca do domicílio do contratante para resolver controvérsias, ressalvada a competência prevista em lei para relações de consumo. Dúvidas: {mail}.</p>) },
]

export default function Termos() {
  useEffect(() => { document.title = 'Termos de Serviço — Foro' }, [])
  return (
    <LegalDoc title="Termos de Serviço" sections={sections}
      intro={<p>Estes Termos regulam o uso do {LEGAL.product}, plataforma de gestão para escritórios de advocacia. Leia com atenção antes de usar.</p>} />
  )
}
