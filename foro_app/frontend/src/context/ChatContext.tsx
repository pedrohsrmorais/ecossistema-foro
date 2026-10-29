import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { aiApi, type AiAction } from '../api'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  actions?: AiAction[]
  creditsUsed?: number
  pending?: boolean
  error?: boolean
}

interface ChatState {
  messages: ChatMessage[]
  loading: boolean
  open: boolean
  setOpen: (v: boolean) => void
  send: (text: string) => Promise<void>
  reset: () => void
}

const ChatContext = createContext<ChatState | null>(null)

/**
 * Estado do chat vive acima das rotas: a conversa continua ao navegar entre
 * Leads/Tarefas e o painel lateral usa a mesma conversa da tela cheia.
 */
export function ChatProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = useState<string | undefined>()
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)

  const reset = useCallback(() => { setMessages([]); setConversationId(undefined) }, [])

  const send = useCallback(async (text: string) => {
    if (!text.trim() || loading) return
    const stamp = Date.now()
    setMessages(m => [...m,
      { id: `u${stamp}`, role: 'user', content: text },
      { id: 'pending', role: 'assistant', content: '', pending: true },
    ])
    setLoading(true)
    try {
      const res = await aiApi.sendMessage(text, conversationId)
      setConversationId(res.conversation_id)
      setMessages(m => [...m.filter(x => x.id !== 'pending'), {
        id: `a${stamp}`, role: 'assistant', content: res.message,
        actions: res.actions, creditsUsed: res.usage?.credits_used,
      }])
      qc.setQueryData(['ai-credits'], res.credits)
      // A IA mexeu no CRM: atualiza as telas abertas sem o usuário recarregar
      if (res.actions?.some(a => a.write && a.ok)) {
        qc.invalidateQueries({ queryKey: ['leads'] })
        qc.invalidateQueries({ queryKey: ['lead'] })
        qc.invalidateQueries({ queryKey: ['funnel'] })
        qc.invalidateQueries({ queryKey: ['tasks'] })
        qc.invalidateQueries({ queryKey: ['cases'] })
        qc.invalidateQueries({ queryKey: ['case'] })
        qc.invalidateQueries({ queryKey: ['events'] })
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Erro ao processar sua mensagem.'
      setMessages(m => [...m.filter(x => x.id !== 'pending'),
        { id: `e${stamp}`, role: 'assistant', content: msg, error: true }])
      qc.invalidateQueries({ queryKey: ['ai-credits'] })
    } finally {
      setLoading(false)
    }
  }, [loading, conversationId, qc])

  return (
    <ChatContext.Provider value={{ messages, loading, open, setOpen, send, reset }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat precisa estar dentro de <ChatProvider>')
  return ctx
}
