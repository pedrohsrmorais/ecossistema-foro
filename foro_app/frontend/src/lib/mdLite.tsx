import type { ReactNode } from 'react'

/** Markdown mínimo (títulos, listas, **negrito**) sem HTML bruto — e destaca [PREENCHER]/[CONFERIR]/[[IA]]. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|\[\[IA:(?:[^[\]]|\[[^[\]]*\])*\]\]|\[(?:PREENCHER|CONFERIR)[^\]]*\])/g
  let last = 0; let m: RegExpExecArray | null; let i = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const t = m[0]; const k = `${key}-${i++}`
    if (t.startsWith('**')) out.push(<strong key={k}>{t.slice(2, -2)}</strong>)
    else if (t.startsWith('[[IA')) out.push(<mark key={k} className="bg-purple-100 text-purple-800 rounded px-1" title="Trecho que a IA vai redigir">{t.slice(2, -2)}</mark>)
    else if (t.startsWith('[CONFERIR')) out.push(<mark key={k} className="bg-red-100 text-red-800 rounded px-1">{t}</mark>)
    else out.push(<mark key={k} className="bg-yellow-200 text-yellow-900 rounded px-1">{t}</mark>)
    last = m.index + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

export function MdLite({ text }: { text: string }) {
  return (
    <div className="font-serif text-[15px] leading-7 text-slate-900">
      {text.split(/\r?\n/).map((raw, i) => {
        const line = raw.trimEnd()
        if (!line.trim()) return <div key={i} className="h-3" />
        const h = line.match(/^(#{1,3})\s+(.*)$/)
        if (h) return <p key={i} className={h[1].length === 1 ? 'text-center font-bold mt-2' : 'font-bold mt-3'}>{inline(h[2], `h${i}`)}</p>
        const li = line.match(/^\s*(?:[-*]|\d+[.)])\s+(.*)$/)
        if (li) return <p key={i} className="pl-6 -indent-4">• {inline(li[1], `l${i}`)}</p>
        return <p key={i} className="text-justify indent-8">{inline(line, `p${i}`)}</p>
      })}
    </div>
  )
}
