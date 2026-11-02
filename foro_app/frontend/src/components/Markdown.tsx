import { Fragment, ReactNode } from 'react'

/**
 * Markdown mínimo e SEGURO para as respostas da IA: **negrito**, *itálico*, `código`, [link](https://…),
 * listas (- , * , 1.) e parágrafos. Nada de HTML bruto (tudo vira elemento React), então não há XSS.
 */
const INLINE = /(\*\*[^*\n]+?\*\*|__[^_\n]+?__|\*[^*\s][^*\n]*?\*|`[^`\n]+`|\[[^\]\n]+\]\(https?:\/\/[^\s)]+\))/g

function inline(text: string, key: string): ReactNode[] {
  return text.split(INLINE).filter(p => p !== '').map((part, i) => {
    const k = `${key}-${i}`
    if (/^\*\*.+\*\*$/.test(part) || /^__.+__$/.test(part)) return <strong key={k}>{inline(part.slice(2, -2), k)}</strong>
    if (/^\*[^*].*\*$/.test(part)) return <em key={k}>{inline(part.slice(1, -1), k)}</em>
    if (/^`.+`$/.test(part)) return <code key={k} className="px-1 rounded bg-slate-200/70 text-[0.9em]">{part.slice(1, -1)}</code>
    const m = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/)
    if (m) return <a key={k} href={m[2]} target="_blank" rel="noopener noreferrer" className="underline">{m[1]}</a>
    return <Fragment key={k}>{part}</Fragment>
  })
}

export default function Markdown({ text }: { text: string }) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    const ul = /^\s*[-*•]\s+(.*)$/, ol = /^\s*\d+[.)]\s+(.*)$/
    if (ul.test(line) || ol.test(line)) {
      const ordered = ol.test(line)
      const re = ordered ? ol : ul
      const items: string[] = []
      while (i < lines.length && re.test(lines[i])) { items.push(lines[i].match(re)![1]); i++ }
      const Tag = ordered ? 'ol' : 'ul'
      blocks.push(<Tag key={`b${blocks.length}`} className={`${ordered ? 'list-decimal' : 'list-disc'} pl-5 space-y-0.5`}>{items.map((t, j) => <li key={j}>{inline(t, `b${blocks.length}-${j}`)}</li>)}</Tag>)
      continue
    }
    const h = line.match(/^#{1,4}\s+(.*)$/)
    if (h) { blocks.push(<p key={`b${blocks.length}`} className="font-semibold">{inline(h[1], `b${blocks.length}`)}</p>); i++; continue }
    const para: string[] = []
    while (i < lines.length && lines[i].trim() && !ul.test(lines[i]) && !ol.test(lines[i]) && !/^#{1,4}\s/.test(lines[i])) { para.push(lines[i]); i++ }
    blocks.push(<p key={`b${blocks.length}`} className="whitespace-pre-wrap">{inline(para.join('\n'), `b${blocks.length}`)}</p>)
  }
  return <div className="space-y-2">{blocks}</div>
}
