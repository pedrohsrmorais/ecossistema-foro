import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Menu flutuante ancorado a um elemento; usa portal para não ser cortado pela rolagem da tabela. */
export default function Popover({ anchor, onClose, children, width = 224 }: { anchor: HTMLElement | null; onClose: () => void; children: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!anchor) return
    const r = anchor.getBoundingClientRect()
    const h = ref.current?.offsetHeight || 240
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
    const top = r.bottom + 4 + h > window.innerHeight && r.top - h - 4 > 0 ? r.top - h - 4 : r.bottom + 4
    setPos({ top, left })
  }, [anchor, width])

  useEffect(() => {
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose() }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', down); document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key) }
  }, [anchor, onClose])

  return createPortal(
    <div ref={ref} style={{ position: 'fixed', top: pos?.top ?? -9999, left: pos?.left ?? -9999, width, zIndex: 60 }}
      className="bg-white border rounded-lg shadow-lg py-1 max-h-72 overflow-auto text-sm" role="menu">
      {children}
    </div>, document.body)
}
