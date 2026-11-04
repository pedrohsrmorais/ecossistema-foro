import { Link } from 'react-router-dom'
import { useEffect } from 'react'
import LegalDoc, { type LegalSection } from './LegalLayout'
import { LEGAL } from '../../lib/legal'

const mail = <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>

const sections: LegalSection[] = [
  { id: 'quem-somos', title: 'Quem é o responsável', body: (<>
    <p>O {LEGAL.product} é uma plataforma online de gestão para escritórios de advocacia (CRM comercial, monitoramento de processos, documentos, agenda, quadros e assistente de IA), disponível em <a href={LEGAL.site}>{LEGAL.site}</a>{LEGAL.legalEntity ? <>, operada por {LEGAL.legalEntity}{LEGAL.cnpj ? <> (CNPJ {LEGAL.cnpj})</> : null}</> : null}.</p>
    <p>Em relação aos dados da <strong>conta e do uso da plataforma</strong>, a {LEGAL.legalEntity} (CNPJ {LEGAL.cnpj}), que opera o {LEGAL.product}, é a controladora. Em relação aos <strong>dados dos clientes e processos que o escritório cadastra</strong>, o escritório é o controlador e a {LEGAL.legalEntity} atua como operadora, tratando os dados apenas para prestar o serviço.</p>
    <p>Dúvidas, pedidos e contato do encarregado pelo tratamento de dados (LGPD): {mail}.</p>
  </>) },
  { id: 'dados', title: 'Quais dados tratamos', body: (<>
    <ul>
      <li><strong>Conta e perfil:</strong> nome, e-mail, telefone, número da OAB (opcional), senha (armazenada somente em forma criptografada com hash) e dados do escritório.</li>
      <li><strong>Conteúdo que você cadastra:</strong> contatos e leads, processos, partes, andamentos, prazos, documentos, compromissos, tarefas e quadros.</li>
      <li><strong>Uso da plataforma:</strong> registros de acesso e de ações (por exemplo, o que a IA fez em seu nome), consumo de créditos de IA e informações técnicas de segurança (endereço IP, navegador).</li>
      <li><strong>Pagamento:</strong> processado pelo Stripe. O {LEGAL.product} <strong>não vê nem armazena o número do cartão</strong>; guardamos apenas identificadores da assinatura e o status do pagamento.</li>
      <li><strong>Dados do Google</strong>, somente se você conectar sua conta Google (seção 3).</li>
    </ul>
  </>) },
  { id: 'google', title: 'Integração com o Google (Agenda)', body: (<>
    <p>A integração é <strong>opcional</strong> e só acontece quando você, usuário do {LEGAL.product}, clica em “Conectar Google” e autoriza o acesso na tela de consentimento do Google. Você escolhe a conta e pode desconectar quando quiser.</p>
    <p><strong>Permissões solicitadas e para que servem:</strong></p>
    <ul>
      <li><strong>Identificação</strong> (<code>openid</code>, <code>email</code>, <code>profile</code>): identificar qual conta Google foi vinculada ao seu usuário.</li>
      <li><strong>Google Agenda</strong> (<code>calendar.events</code>): sincronizar seus compromissos entre o {LEGAL.product} e o Google Agenda — ler os eventos da sua agenda e criar os eventos (reuniões, audiências, prazos) que você agendar no {LEGAL.product}.</li>
    </ul>
    <p>O {LEGAL.product} <strong>não solicita acesso ao Gmail</strong> nem ao conteúdo dos seus e-mails.</p>
    <p><strong>O que nunca fazemos com os dados do Google:</strong></p>
    <ul>
      <li>não apagamos nem alteramos eventos da sua agenda sem uma ação sua;</li>
      <li>não vendemos, não alugamos e não transferimos esses dados a terceiros, exceto aos operadores necessários para prestar a funcionalidade (seção 6), para cumprir a lei ou com seu consentimento;</li>
      <li>não usamos esses dados para publicidade, perfilamento comercial, análise de crédito ou para formar bases de dados;</li>
      <li>não usamos esses dados para desenvolver, melhorar ou treinar modelos de inteligência artificial ou aprendizado de máquina generalistas;</li>
      <li>nenhuma pessoa da nossa equipe lê os dados da sua agenda, salvo com a sua autorização expressa para um caso específico (por exemplo, um pedido de suporte), por necessidade de segurança (investigar abuso ou falha) ou por obrigação legal.</li>
    </ul>
    <p><strong>Como tratamos:</strong> os eventos sincronizados são exibidos para você na Agenda do {LEGAL.product}, ao lado dos demais compromissos. Os eventos importados ficam <strong>visíveis apenas para você</strong> (não aparecem para os demais membros do seu escritório), são <strong>somente leitura</strong> no {LEGAL.product}, não geram alertas nem resumos para a equipe e não são enviados a terceiros — nem mesmo ao assistente de IA, que não enxerga os eventos importados do Google. Mantemos uma cópia deles enquanto a conexão estiver ativa. Os eventos que você cria no {LEGAL.product} são gravados também na sua conta Google (somente título, horário, local e link de reunião; as observações internas nunca são enviadas).</p>
    <p className="rounded-lg border bg-white p-4 text-sm">
      O uso e a transferência, para qualquer outro aplicativo, das informações recebidas das APIs do Google pelo {LEGAL.product} seguirão a{' '}
      <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer">Política de Dados do Usuário dos Serviços de API do Google</a>, incluindo os requisitos de Uso Limitado.<br />
      <span className="text-slate-500"><em>{LEGAL.product}’s use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.</em></span>
    </p>
  </>) },
  { id: 'finalidades', title: 'Para que usamos os dados e em que base legal', body: (<>
    <ul>
      <li><strong>Prestar o serviço contratado</strong> (execução de contrato): operar o CRM, processos, documentos, agenda, quadros e a IA.</li>
      <li><strong>Segurança e prevenção a fraudes</strong> (legítimo interesse e proteção do crédito): autenticação, limites de uso, registros de auditoria.</li>
      <li><strong>Cobrança e obrigações fiscais</strong> (execução de contrato e obrigação legal): assinaturas, notas fiscais.</li>
      <li><strong>Comunicações do serviço</strong>: confirmação de e-mail, recuperação de senha, resumo diário de prazos e avisos importantes.</li>
      <li><strong>Integração com o Google</strong> (consentimento): somente enquanto a conta estiver conectada e apenas para as funcionalidades descritas na seção 3.</li>
    </ul>
    <p>Não usamos seus dados para publicidade nem os vendemos.</p>
  </>) },
  { id: 'ia', title: 'Assistente de IA', body: (<>
    <p>O assistente de IA do {LEGAL.product} usa modelos de linguagem fornecidos pela <strong>Anthropic</strong> (por meio de API comercial). Para responder a um pedido seu, trechos relevantes do conteúdo (por exemplo, dados do processo ou o texto de um documento que você pediu para analisar) são enviados ao provedor apenas para gerar a resposta. Pelos termos comerciais do provedor, esses dados <strong>não são usados para treinar os modelos</strong> dele.</p>
    <p>A IA pode errar. Ela respeita as permissões de cada pessoa do escritório e pede confirmação antes de alterar dados. As respostas devem ser revisadas por um profissional habilitado.</p>
  </>) },
  { id: 'compartilhamento', title: 'Com quem compartilhamos', body: (<>
    <p>Compartilhamos dados somente com operadores indispensáveis ao serviço, sob contrato e dentro da finalidade:</p>
    <ul>
      <li><strong>Stripe</strong> — pagamentos e assinaturas;</li>
      <li><strong>Anthropic</strong> — processamento de pedidos da IA (seção 5);</li>
      <li><strong>Resend</strong> — envio de e-mails do sistema (confirmação, recuperação de senha, resumo diário);</li>
      <li><strong>NFE.io</strong> — emissão de notas fiscais de serviço;</li>
      <li><strong>Provedores de infraestrutura e armazenamento em nuvem</strong> — hospedagem do servidor, do banco de dados e dos arquivos (por exemplo, documentos e PDFs de processos salvos);</li>
      <li><strong>Autoridades</strong>, quando houver obrigação legal ou ordem judicial.</li>
    </ul>
    <p>Alguns desses operadores estão fora do Brasil (por exemplo, nos Estados Unidos). Nesses casos, a transferência internacional ocorre conforme o art. 33 da LGPD, com cláusulas contratuais e medidas de segurança adequadas.</p>
  </>) },
  { id: 'seguranca', title: 'Segurança', body: (<>
    <ul>
      <li>Conexão protegida por HTTPS (TLS) em todo o serviço.</li>
      <li>Cada escritório enxerga somente os próprios dados; dentro do escritório, o administrador define o que cada pessoa pode acessar.</li>
      <li>Senhas armazenadas com hash. <strong>Tokens de acesso do Google são armazenados criptografados</strong> e nunca são expostos no navegador nem em registros (logs).</li>
      <li>Registros de acesso e das ações feitas pela IA, com possibilidade de desfazer.</li>
    </ul>
    <p>Nenhum sistema é totalmente imune a incidentes. Se ocorrer um incidente que possa causar risco relevante a você, comunicaremos você e a ANPD nos termos da lei.</p>
  </>) },
  { id: 'retencao', title: 'Por quanto tempo guardamos e como excluir', body: (<>
    <ul>
      <li><strong>Conta e conteúdo do escritório:</strong> enquanto a conta existir. Ao encerrar, apagamos ou anonimizamos os dados em até 30 dias, salvo o que a lei obrigue a manter (por exemplo, registros fiscais e de pagamento).</li>
      <li><strong>Dados do Google:</strong> ao clicar em “Desconectar” em Configurações → Integrações, revogamos o acesso junto ao Google e apagamos imediatamente os tokens. As cópias dos eventos importados do Google Agenda e os vínculos com a Agenda são apagados imediatamente (e, em qualquer caso, em até 30 dias nos backups); os eventos que já estão na sua conta Google permanecem nela.</li>
      <li>Você também pode revogar o acesso a qualquer momento em <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer">myaccount.google.com/permissions</a>. Se o acesso for revogado, deixamos de ler sua agenda e removemos os tokens.</li>
      <li>Para pedir a exclusão da conta ou dos seus dados, escreva para {mail}.</li>
    </ul>
  </>) },
  { id: 'direitos', title: 'Seus direitos (LGPD)', body: (<>
    <p>Você pode, a qualquer momento e mediante solicitação: confirmar a existência de tratamento; acessar, corrigir e portar seus dados; pedir anonimização, bloqueio ou eliminação de dados desnecessários; obter informação sobre compartilhamentos; revogar consentimentos; e se opor a tratamentos em desacordo com a lei. Também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</p>
    <p>Envie o pedido para {mail}. Respondemos em até 15 dias. Se você é cliente de um escritório que usa o {LEGAL.product}, direcionamos o pedido ao escritório, que é o controlador desses dados.</p>
  </>) },
  { id: 'cookies', title: 'Cookies e armazenamento no navegador', body: (<p>Usamos apenas o armazenamento do navegador necessário para manter sua sessão e lembrar preferências de tela (por exemplo, a visão escolhida na Agenda). Ao conectar o Google, um cookie temporário de segurança (10 minutos, restrito ao endereço da integração) protege o retorno do Google contra fraude. <strong>Não usamos cookies de publicidade nem de rastreamento de terceiros.</strong></p>) },
  { id: 'criancas', title: 'Crianças e adolescentes', body: (<p>O {LEGAL.product} é destinado a profissionais e escritórios. Não é direcionado a menores de 18 anos e não coletamos dados deles de forma intencional.</p>) },
  { id: 'alteracoes', title: 'Alterações desta política', body: (<p>Podemos atualizar esta política. Mudanças relevantes serão avisadas dentro do {LEGAL.product} ou por e-mail e, quando alterarem o uso de dados do Google, pediremos novo consentimento antes de aplicá-las. A data da última atualização está no topo. Veja também os <Link to="/termos">Termos de Serviço</Link>.</p>) },
  { id: 'contato', title: 'Contato', body: (<p>Para qualquer assunto sobre privacidade e proteção de dados: {mail}.</p>) },
]

export default function Privacidade() {
  useEffect(() => { document.title = 'Política de Privacidade — Foro' }, [])
  return (
    <LegalDoc title="Política de Privacidade" sections={sections}
      intro={<p>Esta política explica quais dados o {LEGAL.product} trata, por que, com quem compartilha e quais são os seus direitos, em conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018). A seção 3 descreve em detalhes como usamos os dados do Google (Agenda) quando você conecta sua conta.</p>} />
  )
}
