import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { Sparkles, X } from 'lucide-react'
import { useChat } from '../context/ChatContext'
import ChatPanel from './ChatPanel'

/** Painel lateral do assistente, disponível em todas as telas (exceto na tela cheia do chat). */
export default function AiDock() {
  const { open, setOpen } = useChat()
  const { pathname } = useLocation()
  const hidden = pathname.startsWith('/chat') || pathname.startsWith('/planos')
  // Em telas largas o painel EMPURRA o conteúdo em vez de cobrir as colunas do quadro
  useEffect(() => {
    const push = open && !hidden && window.innerWidth >= 1024
    document.body.style.paddingRight = push ? '400px' : ''
    return () => { document.body.style.paddingRight = '' }
  }, [open, hidden])
  if (pathname.startsWith('/chat') || pathname.startsWith('/planos')) return null

  return (
    <>
      {!open && (
        <button onClick={() => setOpen(true)}
          className="fixed bottom-5 right-5 z-30 flex items-center gap-2 pl-3.5 pr-4 py-2.5 rounded-full bg-brand-700 text-white text-sm font-medium shadow-lg hover:bg-brand-800 transition-colors animate-pulse-glow">
          <Sparkles className="w-4 h-4 text-accent-300" /> Assistente IA
        </button>
      )}
      {open && (
        <aside className="fixed top-0 right-0 bottom-0 z-40 w-full sm:w-[400px] border-l shadow-2xl animate-fade-in bg-white">
          <button onClick={() => setOpen(false)} className="absolute top-3.5 right-3 p-1 text-slate-400 hover:text-slate-700 z-10" title="Fechar">
            <X className="w-4 h-4" />
          </button>
          <ChatPanel compact />
        </aside>
      )}
    </>
  )
}
