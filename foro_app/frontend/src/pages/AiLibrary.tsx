import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowUpRight, Copy, Download } from 'lucide-react'

const categories = ['Skills', 'Prompts para Claude', 'Prompts para GPT', 'Repositórios úteis'] as const
type Category = typeof categories[number]
type Resource = { title: string; description: string; content?: string; slug?: string; url?: string }
const library: Record<Category, Resource[]> = {
  Skills: [
    { slug: 'triagem-de-publicacoes', title: 'Triagem de publicações', description: 'Organize publicações para a revisão da controladoria.', content: 'Para cada publicação fornecida, extraia CNJ, data, órgão e teor. Preserve um trecho literal como evidência. Agrupe por processo e identifique duplicatas. Liste providências sugeridas em coluna própria. Deixe a data do prazo em branco para conferência do advogado. Se faltar contexto, indique o que precisa ser consultado.' },
    { slug: 'revisao-do-atendimento', title: 'Revisão do atendimento', description: 'Identifique o próximo passo comercial em uma conversa.', content: 'Leia a conversa fornecida. Registre o objetivo do contato, documentos prometidos, última interação e próximo passo combinado. Diferencie compromisso explícito de sugestão. Não crie contatos nem envie mensagens. Devolva uma proposta de atualização do CRM para revisão.' },
  ],
  'Prompts para Claude': [
    { title: 'Revisar um fluxo do escritório', description: 'Localize trabalho duplicado antes de propor uma automação.', content: '<fluxo>Insira aqui as etapas, entradas, responsáveis e ferramentas.</fluxo>\nMapeie as passagens de trabalho entre pessoas. Para cada repetição, cite a etapa de origem e proponha uma mudança testável. Separe o que pode ser automatizado do que exige aprovação do advogado.' },
  ],
  'Prompts para GPT': [
    { title: 'Preparar a pauta de controladoria', description: 'Transforme uma lista de andamentos em itens para conferência.', content: 'A partir exclusivamente dos andamentos abaixo, monte uma tabela com processo, fato novo, evidência e providência a revisar. Preserve as datas originais. Marque dados ausentes como “a conferir”. Não calcule vencimentos nem invente responsáveis.\n\nAndamentos: [cole os registros]' },
  ],
  'Repositórios úteis': [
    { title: 'Anthropic · Agent Skills', description: 'Exemplos de organização e documentação de skills reutilizáveis.', url: 'https://github.com/anthropics/skills' },
    { title: 'n8n', description: 'Código e exemplos da ferramenta de automação de rotinas e integrações.', url: 'https://github.com/n8n-io/n8n' },
  ],
}

function downloadSkill(item: Resource) {
  const content = ['---', 'name: ' + item.slug, 'description: ' + item.description, '---', '', '# ' + item.title, '', item.content].join('\n')
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'SKILL.md'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export default function AiLibrary() {
  const [params, setParams] = useSearchParams()
  const category = categories.find(c => c === params.get('categoria')) || 'Skills'
  const [message, setMessage] = useState('')
  return <div className="p-6 max-w-5xl">
    <h1 className="page-heading">Biblioteca de IA</h1>
    <nav className="case-tabs mt-5" aria-label="Categorias da biblioteca">{categories.map(c => <button key={c} aria-pressed={category === c} onClick={() => { setParams({categoria: c}); setMessage('') }}>{c}</button>)}</nav>
    <div className="grid md:grid-cols-2 gap-4 mt-5">{library[category].map(item => <article key={item.title} className="card p-5 space-y-3">
      <h2 className="font-display text-xl">{item.title}</h2><p className="text-slate-600 text-sm">{item.description}</p>
      {item.content && <details className="text-sm"><summary className="cursor-pointer">Ver instruções</summary><p className="py-3 whitespace-pre-line">{item.content}</p></details>}
      {item.url ? <a className="btn-secondary" href={item.url} target="_blank" rel="noreferrer">Abrir repositório <ArrowUpRight size={15} /></a> : item.slug ? <button className="btn-secondary" onClick={() => downloadSkill(item)}><Download size={15} /> Baixar SKILL.md</button> :
      <button className="btn-secondary" onClick={async () => { try { await navigator.clipboard.writeText(item.content!); setMessage('Prompt copiado.') } catch { setMessage('Abra as instruções e copie o texto manualmente.') } }}><Copy size={15} /> Copiar prompt</button>}
    </article>)}</div>
    <p className="text-sm mt-3" role="status">{message}</p>
  </div>
}
