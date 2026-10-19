import { useState, useRef, useEffect, FormEvent } from 'react'
import { Send, Plus, Bot, User } from 'lucide-react'
import { aiApi, type AiMessage } from '../api'
import clsx from 'clsx'

interface Message extends AiMessage {
  id: string
  pending?: boolean
}

export default function Chat() {
  const [messages, setMessages]       = useState<Message[]>([])
  const [input, setInput]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [conversationId, setConversationId] = useState<string | undefined>()
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleNewConversation() {
    setMessages([])
    setConversationId(undefined)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text }
    const pendingMsg: Message = { id: 'pending', role: 'assistant', content: '...', pending: true }

    setMessages(prev => [...prev, userMsg, pendingMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await aiApi.sendMessage(text, conversationId)
      setConversationId(res.conversation_id)
      setMessages(prev => [
        ...prev.filter(m => m.id !== 'pending'),
        { id: res.conversation_id + Date.now(), role: 'assistant', content: res.message },
      ])
    } catch (err: any) {
      const errText = err?.response?.data?.error || 'Erro ao processar sua mensagem.'
      setMessages(prev => [
        ...prev.filter(m => m.id !== 'pending'),
        { id: 'err' + Date.now(), role: 'assistant', content: `⚠️ ${errText}` },
      ])
    } finally {
      setLoading(false)
      textareaRef.current?.focus()
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e as any)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-white">
        <div>
          <h1 className="font-semibold text-slate-900">Assistente IA</h1>
          <p className="text-xs text-slate-500">Gerencie leads em linguagem natural</p>
        </div>
        <button onClick={handleNewConversation} className="btn-secondary text-xs">
          <Plus className="w-3.5 h-3.5" /> Nova conversa
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-16">
            <div className="w-12 h-12 rounded-full bg-brand-100 flex items-center justify-center">
              <Bot className="w-6 h-6 text-brand-600" />
            </div>
            <div>
              <p className="font-medium text-slate-900 mb-1">Como posso ajudar?</p>
              <p className="text-sm text-slate-500 max-w-sm">
                Diga algo como:<br />
                <em>"Cadastra um lead: João Silva, trabalhista, 51 99999-1234"</em><br />
                <em>"Quais leads estão sem contato há mais de 5 dias?"</em>
              </p>
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={clsx('flex gap-3', msg.role === 'user' ? 'flex-row-reverse' : 'flex-row')}
          >
            <div className={clsx(
              'w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-sm',
              msg.role === 'user'
                ? 'bg-brand-600 text-white'
                : 'bg-slate-100 text-slate-600'
            )}>
              {msg.role === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
            </div>
            <div className={clsx(
              'max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed',
              msg.role === 'user'
                ? 'bg-brand-600 text-white rounded-tr-sm'
                : 'bg-white border text-slate-800 rounded-tl-sm',
              msg.pending && 'animate-pulse'
            )}>
              {msg.pending ? (
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce [animation-delay:300ms]" />
                </span>
              ) : (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 pb-4 bg-slate-50 border-t pt-3">
        <form onSubmit={handleSubmit} className="flex gap-2 items-end bg-white border rounded-xl p-2 shadow-sm">
          <textarea
            ref={textareaRef}
            rows={1}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Fale com a IA... (Enter para enviar)"
            className="flex-1 resize-none text-sm outline-none px-2 py-1.5 max-h-32 leading-relaxed"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center hover:bg-brand-700 disabled:opacity-40 shrink-0 transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
        <p className="text-xs text-slate-400 text-center mt-2">
          A IA pode cometer erros. Verifique informações importantes.
        </p>
      </div>
    </div>
  )
}
