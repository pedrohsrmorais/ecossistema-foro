/**
 * api.ts — Ponto único de todas as chamadas à API do Foro.
 *
 * Cada função mapeia exatamente para uma rota em routes/api.routes.js.
 * Para recriar o frontend: importe as funções daqui e você tem tudo.
 *
 * Autenticação: o token JWT é automaticamente injetado via interceptor do Axios.
 */

import axios from 'axios'

// ─── Cliente Axios ────────────────────────────────────────────────────────────

const http = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

// Injeta o token em toda requisição autenticada
http.interceptors.request.use((config) => {
  const token = localStorage.getItem('foro_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// Redireciona para login em 401, e para a tela de verificação quando o
// e-mail ainda não foi confirmado (ver requireVerifiedEmail no backend).
http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('foro_token')
      localStorage.removeItem('foro_user')
      window.location.href = '/login'
    }
    // Teste grátis acabou: só resta escolher um plano (ver client.middleware.js)
    if (err.response?.status === 403 && err.response?.data?.code === 'TRIAL_EXPIRED'
        && !window.location.pathname.startsWith('/planos')) {
      window.location.href = '/planos?expirado=1'
    }
    if (err.response?.status === 403 && err.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
      window.location.href = '/verify-email'
    }
    // Módulo desativado para a conta pelo admin da plataforma (ver
    // modules.middleware.js::requireModule) — manda pra uma tela amigável
    // em vez de deixar a página quebrada com um 403 cru.
    if (err.response?.status === 403 && err.response?.data?.code === 'MODULE_DISABLED') {
      const msg = encodeURIComponent(err.response.data.error || 'Este módulo está desativado para sua conta.')
      window.location.href = `/modulo-desativado?msg=${msg}`
    }
    return Promise.reject(err)
  }
)

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuthResponse {
  token: string
  user: {
    id: string
    name: string
    email: string
    role: string
    email_verified?: boolean
    phone_verified?: boolean
  }
  account?: { id: string; name: string }
}

export interface Lead {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  stage: string
  source: string | null
  assigned_user_id: string | null
  assigned_name: string | null
  last_contact_at: string | null
  created_at: string
  custom_fields?: Record<string, { label: string; type: string; value: string | null }>
}

export interface PaginatedResult<T> {
  data: T[]
  total: number
  page: number
  limit: number
}

export interface FunnelStage {
  stage: string
  total: number
}

export interface Note {
  id: string
  lead_id: string
  user_id: string
  user_name: string
  text: string
  channel: string
  created_at: string
}

export interface Task {
  id: string
  lead_id: string | null
  lead_name: string | null
  user_id: string
  user_name: string
  description: string
  due_date: string | null
  completed_at: string | null
  created_at: string
}

export interface FieldDefinition {
  id: string
  name: string
  label: string
  field_type: string
  options: string[] | null
  required: boolean
  collect_via_ai: boolean
  ai_question_hint: string | null
  display_order: number
  active: boolean
  is_system: boolean
}

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
  created_at?: string
}

export interface AiAction {
  tool: string
  write: boolean
  ok: boolean
  summary: string
  lead_id: string | null
}

/** Saldo semanal de créditos de IA. Regra: créditos = (tokens de entrada totais + 5 × saída) ÷ 2.500 */
export interface CreditsStatus {
  plan_id: string
  plan_name: string
  weekly_limit: number
  used: number
  remaining: number
  window_start: string
  renews_at: string
  lookups_week: number
  account_status: string
  trial_ends_at: string | null
  rule: { tokens_per_credit: number; output_weight: number }
}

export interface AiChatResponse {
  conversation_id: string
  message: string
  actions: AiAction[]
  usage: { input_tokens: number; output_tokens: number; credits_used: number }
  credits: CreditsStatus
}

export interface PlanInfo {
  id: string
  name: string
  price: number
  max_users: number | null
  max_leads: number | null
  ai_credits_week: number
  lookups_week: number
  features: string[]
}

export interface Payment {
  id: string
  asaas_id: string
  type: string
  status: string
  amount: number
  description: string | null
  pix_qr_code: string | null
  pix_copy_paste: string | null
  paid_at: string | null
  created_at: string
}

export interface User {
  id: string
  name: string
  email: string
  role: string
  active: boolean
  created_at: string
}

export interface ServicePrice {
  service_key: string
  name: string
  price_cents: number
  provider: string | null
  active: boolean
  description: string | null
}

export interface CreditTransaction {
  id: string
  type: 'purchase' | 'consumption' | 'refund' | 'adjustment'
  amount_cents: number
  balance_after_cents: number
  service_key: string | null
  note: string | null
  created_at: string
}

export interface CnpjResult {
  cnpj: string
  razao_social?: string
  nome_fantasia?: string
  situacao_cadastral?: string
  data_abertura?: string
  [key: string]: unknown
}

export interface CpfResult {
  cpf: string
  nome?: string
  situacao?: string
  [key: string]: unknown
}

export interface ProcessoResult {
  documento: string
  processos: Array<{
    numero_cnj: string
    tribunal: string
    classe: string
    ultima_movimentacao: string
    data_ultima_movimentacao: string
  }>
  [key: string]: unknown
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────

export const authApi = {
  /** POST /auth/register */
  register: (data: { name: string; email: string; password: string; phone?: string; accountName: string }) =>
    http.post<AuthResponse>('/auth/register', data).then(r => r.data),

  /** POST /auth/login */
  login: (data: { email: string; password: string }) =>
    http.post<AuthResponse>('/auth/login', data).then(r => r.data),

  /** POST /auth/refresh-token */
  refreshToken: (refreshToken: string) =>
    http.post<{ token: string }>('/auth/refresh-token', { refreshToken }).then(r => r.data),

  /** POST /auth/forgot-password */
  forgotPassword: (email: string) =>
    http.post('/auth/forgot-password', { email }).then(r => r.data),

  /** POST /auth/reset-password */
  resetPassword: (token: string, password: string) =>
    http.post('/auth/reset-password', { token, password }).then(r => r.data),

  /** POST /auth/send-verification — (re)envia o código de verificação */
  sendVerification: (channel: 'email' | 'phone') =>
    http.post<{ sent: boolean; channel: string; expires_in_minutes: number }>('/auth/send-verification', { channel }).then(r => r.data),

  /** POST /auth/verify-code — confirma o código de 6 dígitos */
  verifyCode: (channel: 'email' | 'phone', code: string) =>
    http.post<{ verified: boolean; channel: string }>('/auth/verify-code', { channel, code }).then(r => r.data),
}

// ─── USERS ────────────────────────────────────────────────────────────────────

export const usersApi = {
  /** GET /users */
  list: () =>
    http.get<User[]>('/users').then(r => r.data),

  /** GET /users/me */
  me: () =>
    http.get<User>('/users/me').then(r => r.data),

  /** PUT /users/me */
  updateMe: (data: { name: string }) =>
    http.put<User>('/users/me', data).then(r => r.data),

  /** PUT /users/me/password */
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    http.put('/users/me/password', data).then(r => r.data),

  /** GET /users/:id */
  getById: (id: string) =>
    http.get<User>(`/users/${id}`).then(r => r.data),

  /** PUT /users/:id */
  update: (id: string, data: Partial<User>) =>
    http.put<User>(`/users/${id}`, data).then(r => r.data),

  /** DELETE /users/:id */
  deactivate: (id: string) =>
    http.delete(`/users/${id}`).then(r => r.data),
}

// ─── FIELDS (campos customizáveis) ───────────────────────────────────────────

export const fieldsApi = {
  /** GET /fields */
  list: () =>
    http.get<FieldDefinition[]>('/fields').then(r => r.data),

  /** POST /fields */
  create: (data: Partial<FieldDefinition>) =>
    http.post<FieldDefinition>('/fields', data).then(r => r.data),

  /** PUT /fields/:id */
  update: (id: string, data: Partial<FieldDefinition>) =>
    http.put<FieldDefinition>(`/fields/${id}`, data).then(r => r.data),

  /** DELETE /fields/:id */
  remove: (id: string) =>
    http.delete(`/fields/${id}`).then(r => r.data),

  /** PUT /fields/reorder */
  reorder: (order: Array<{ id: string; display_order: number }>) =>
    http.put('/fields/reorder', { order }).then(r => r.data),
}

// ─── LEADS ────────────────────────────────────────────────────────────────────

export const leadsApi = {
  /** GET /leads */
  list: (params?: { stage?: string; search?: string; assigned?: string; page?: number; limit?: number }) =>
    http.get<PaginatedResult<Lead>>('/leads', { params }).then(r => r.data),

  /** POST /leads */
  create: (data: Partial<Lead> & { custom_fields?: Record<string, unknown> }) =>
    http.post<Lead>('/leads', data).then(r => r.data),

  /** GET /leads/funnel */
  getFunnelSummary: () =>
    http.get<FunnelStage[]>('/leads/funnel').then(r => r.data),

  /** GET /leads/:id */
  getById: (id: string) =>
    http.get<Lead>(`/leads/${id}`).then(r => r.data),

  /** PUT /leads/:id */
  update: (id: string, data: Partial<Lead> & { custom_fields?: Record<string, unknown> }) =>
    http.put<Lead>(`/leads/${id}`, data).then(r => r.data),

  /** PATCH /leads/:id/stage */
  moveStage: (id: string, stage: string) =>
    http.patch<Lead>(`/leads/${id}/stage`, { stage }).then(r => r.data),

  /** PATCH /leads/:id/archive */
  archive: (id: string) =>
    http.patch<Lead>(`/leads/${id}/archive`).then(r => r.data),

  /** DELETE /leads/:id */
  delete: (id: string) =>
    http.delete(`/leads/${id}`).then(r => r.data),

  // ── Notas ──────────────────────────────────────────────────────────────────

  /** GET /leads/:id/notes */
  listNotes: (leadId: string) =>
    http.get<Note[]>(`/leads/${leadId}/notes`).then(r => r.data),

  /** POST /leads/:id/notes */
  addNote: (leadId: string, text: string) =>
    http.post<Note>(`/leads/${leadId}/notes`, { text }).then(r => r.data),

  /** DELETE /leads/:leadId/notes/:noteId */
  deleteNote: (leadId: string, noteId: string) =>
    http.delete(`/leads/${leadId}/notes/${noteId}`).then(r => r.data),

  // ── Tarefas ─────────────────────────────────────────────────────────────────

  /** GET /leads/:id/tasks */
  listTasks: (leadId: string) =>
    http.get<Task[]>(`/leads/${leadId}/tasks`).then(r => r.data),

  /** POST /leads/:id/tasks */
  createTask: (leadId: string, data: { description: string; due_date?: string }) =>
    http.post<Task>(`/leads/${leadId}/tasks`, data).then(r => r.data),

  /** PATCH /leads/:leadId/tasks/:taskId/complete */
  completeTask: (leadId: string, taskId: string) =>
    http.patch<Task>(`/leads/${leadId}/tasks/${taskId}/complete`).then(r => r.data),
}

// ─── TASKS (visão global) ─────────────────────────────────────────────────────

export const tasksApi = {
  /** GET /tasks */
  listAll: (params?: { pending_only?: boolean; page?: number; limit?: number }) =>
    http.get<Task[]>('/tasks', { params }).then(r => r.data),
}

// ─── AI — Chat interno ────────────────────────────────────────────────────────

export const aiApi = {
  /** POST /ai/message */
  sendMessage: (message: string, conversation_id?: string) =>
    http.post<AiChatResponse>('/ai/message', { message, conversation_id }).then(r => r.data),

  /** GET /ai/conversations */
  listConversations: (params?: { page?: number; limit?: number }) =>
    http.get('/ai/conversations', { params }).then(r => r.data),

  /** GET /ai/conversations/:id */
  getConversation: (id: string) =>
    http.get<{ id: string; messages: AiMessage[] }>(`/ai/conversations/${id}`).then(r => r.data),

  /** DELETE /ai/conversations/:id */
  clearConversation: (id: string) =>
    http.delete(`/ai/conversations/${id}`).then(r => r.data),

  /** GET /ai/credits — saldo da semana */
  getCredits: () =>
    http.get<CreditsStatus>('/ai/credits').then(r => r.data),

  /** GET /ai/usage */
  getUsage: (params?: { from?: string; to?: string }) =>
    http.get('/ai/usage', { params }).then(r => r.data),
}

// ─── PAYMENTS ─────────────────────────────────────────────────────────────────

export const paymentsApi = {
  /** GET /payments */
  list: (params?: { page?: number; limit?: number }) =>
    http.get<Payment[]>('/payments', { params }).then(r => r.data),

  /** POST /payments/pix */
  createPix: (data: { amount: number; description?: string }) =>
    http.post<Payment>('/payments/pix', data).then(r => r.data),

  /** POST /payments/card */
  createCard: (data: { amount: number; description?: string; card: Record<string, string> }) =>
    http.post<Payment>('/payments/card', data).then(r => r.data),

  /** POST /payments/subscription */
  createSubscription: (data: { plan: string; billingType?: string; card?: Record<string, string> }) =>
    http.post('/payments/subscription', data).then(r => r.data),

  /** GET /payments/:id */
  getById: (id: string) =>
    http.get<Payment>(`/payments/${id}`).then(r => r.data),

  /** GET /payments/:id/nfse */
  getNfse: (id: string) =>
    http.get(`/payments/${id}/nfse`).then(r => r.data),
}

// ─── PLANOS ───────────────────────────────────────────────────────────────────

export const plansApi = {
  /** GET /plans — planos disponíveis para assinatura */
  list: () => http.get<PlanInfo[]>('/plans').then(r => r.data),
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────

export const settingsApi = {
  /** GET /settings */
  get: () =>
    http.get('/settings').then(r => r.data),

  /** PUT /settings */
  update: (data: { name?: string }) =>
    http.put('/settings', data).then(r => r.data),

  /** GET /settings/plan */
  getPlan: () =>
    http.get('/settings/plan').then(r => r.data),
}

// ─── CRÉDITOS — carteira pré-paga p/ serviços pagos de terceiros ─────────────
// Erro de provedor numa consulta devolve o crédito automaticamente no backend
// e não existe endpoint de "solicitar reembolso" — em caso de erro, o usuário
// só vê a mensagem genérica vinda da API ("chame o suporte").

export const creditsApi = {
  /** GET /credits/balance */
  getBalance: () =>
    http.get<{ balance_cents: number }>('/credits/balance').then(r => r.data),

  /** GET /credits/prices */
  listPrices: () =>
    http.get<{ prices: ServicePrice[] }>('/credits/prices').then(r => r.data),

  /** GET /credits/transactions */
  listTransactions: (params?: { page?: number; limit?: number }) =>
    http.get<{ transactions: CreditTransaction[] }>('/credits/transactions', { params }).then(r => r.data),

  /** POST /credits/purchase/pix — retorna o pagamento com QR Code PIX p/ recarregar a carteira */
  purchasePix: (data: { amount: number; description?: string }) =>
    http.post<Payment>('/credits/purchase/pix', data).then(r => r.data),

  /** POST /credits/purchase/card */
  purchaseCard: (data: { amount: number; description?: string; card: Record<string, string> }) =>
    http.post<Payment>('/credits/purchase/card', data).then(r => r.data),
}

// ─── LOOKUP — consultas pagas (CPF/CNPJ/processual) e resumo por IA ──────────

export const lookupApi = {
  /** POST /lookup/cnpj */
  cnpj: (cnpj: string) =>
    http.post<{ data: CnpjResult }>('/lookup/cnpj', { cnpj }).then(r => r.data.data),

  /** POST /lookup/cpf */
  cpf: (cpf: string) =>
    http.post<{ data: CpfResult }>('/lookup/cpf', { cpf }).then(r => r.data.data),

  /** POST /lookup/processo */
  processo: (documento: string) =>
    http.post<{ data: ProcessoResult }>('/lookup/processo', { documento }).then(r => r.data.data),

  /** POST /lookup/processo/summary */
  processoSummary: (processo: ProcessoResult) =>
    http.post<{ data: { summary: string } }>('/lookup/processo/summary', { processo }).then(r => r.data.data),
}

// ─── MÓDULOS — liga/desliga de funcionalidade por conta, só pelo admin da plataforma ─

export interface ModuleStatus {
  module_key: string
  name: string
  description: string | null
  display_order: number
  enabled: boolean
}

export const modulesApi = {
  /** GET /modules — quais módulos estão ativos para a conta logada */
  list: () =>
    http.get<{ modules: ModuleStatus[] }>('/modules').then(r => r.data.modules),
}

// ─── EDUCAÇÃO — trilhas e aulas em vídeo (módulo "educacao") ─────────────────

export interface Trilha {
  id: string
  title: string
  description: string | null
  cover_image_url: string | null
  display_order: number
  total_aulas: number
  aulas_concluidas: number
}

export interface Aula {
  id: string
  title: string
  description: string | null
  video_provider: 'vimeo' | 'youtube' | 'url'
  video_id: string
  duration_seconds: number | null
  display_order: number
  last_position_seconds: number | null
  completed_at: string | null
}

export interface TrilhaDetail extends Trilha {
  aulas: Aula[]
}

export const educationApi = {
  /** GET /education/trilhas */
  listTrilhas: () =>
    http.get<{ trilhas: Trilha[] }>('/education/trilhas').then(r => r.data.trilhas),

  /** GET /education/trilhas/:id */
  getTrilha: (id: string) =>
    http.get<{ trilha: TrilhaDetail }>(`/education/trilhas/${id}`).then(r => r.data.trilha),

  /** PUT /education/aulas/:aulaId/progress */
  updateProgress: (aulaId: string, data: { last_position_seconds?: number; completed?: boolean }) =>
    http.put(`/education/aulas/${aulaId}/progress`, data).then(r => r.data),
}

// ─── PROVAS DE CONCEITO — quiz vinculado a uma aula (módulo "provas_conceito") ─

export interface QuizQuestion {
  id: string
  prompt: string
  options: { id: string; label: string }[]
  display_order: number
}

export interface QuizAttemptResult {
  id: string
  score_pct: number
  passed: boolean
  points_awarded: number
  total_questions: number
  correct_count: number
}

export interface Quiz {
  id: string
  aula_id: string
  title: string
  passing_score_pct: number
  points_awarded: number
  questions: QuizQuestion[]
  best_attempt: { score_pct: number; passed: boolean; points_awarded: number; created_at: string } | null
}

export interface AvailableQuiz {
  quiz_id: string
  title: string
  points_awarded: number
  passing_score_pct: number
  aula_id: string
  aula_title: string
  trilha_id: string
  trilha_title: string
  best_score_pct: number | null
  best_passed: boolean
}

export const quizzesApi = {
  /** GET /education/quizzes — todas as provas disponíveis + melhor resultado do usuário */
  listAvailable: () =>
    http.get<{ quizzes: AvailableQuiz[] }>('/education/quizzes').then(r => r.data.quizzes),

  /** GET /education/aulas/:aulaId/quiz — null se a aula não tem prova de conceito */
  getForAula: (aulaId: string) =>
    http.get<{ quiz: Quiz | null }>(`/education/aulas/${aulaId}/quiz`).then(r => r.data.quiz),

  /** POST /education/quizzes/:id/attempts */
  submitAttempt: (quizId: string, answers: { question_id: string; option_id: string }[]) =>
    http.post<{ attempt: QuizAttemptResult }>(`/education/quizzes/${quizId}/attempts`, { answers }).then(r => r.data.attempt),
}

// ─── DESAFIOS SEMANAIS — conclusão auto-declarada (módulo "desafios_semanais") ─

export interface Challenge {
  id: string
  title: string
  description: string
  attachment_url: string | null
  points_awarded: number
  starts_at: string
  ends_at: string
  is_current: boolean
  completed: boolean
}

export const challengesApi = {
  /** GET /challenges */
  listActive: () =>
    http.get<{ challenges: Challenge[] }>('/challenges').then(r => r.data.challenges),

  /** POST /challenges/:id/complete — auto-declarado, idempotente */
  complete: (id: string) =>
    http.post<{ completion: { points_awarded: number; already_completed: boolean } }>(`/challenges/${id}/complete`).then(r => r.data.completion),
}

// ─── COMUNIDADE — feed isolado por conta + ranking de pontos cross-tenant (módulo "comunidade") ─

export interface CommunityPost {
  id: string
  content: string
  kind: 'conquista' | 'mensagem'
  created_at: string
  user_id: string
  user_name: string
}

export interface LeaderboardEntry {
  account_id: string
  account_name: string
  total_points: number
  pos: number
  is_mine: boolean
}

export const communityApi = {
  /** GET /community/posts — feed da PRÓPRIA conta, nunca cross-tenant */
  listFeed: () =>
    http.get<{ posts: CommunityPost[] }>('/community/posts').then(r => r.data.posts),

  /** POST /community/posts */
  createPost: (content: string) =>
    http.post<{ post: CommunityPost }>('/community/posts', { content }).then(r => r.data.post),

  /** DELETE /community/posts/:id — só a própria publicação (ou admin da conta) */
  deletePost: (id: string) =>
    http.delete(`/community/posts/${id}`).then(r => r.data),

  /** GET /community/leaderboard — ranking de pontos entre escritórios (cross-tenant, por opção do produto) */
  leaderboard: () =>
    http.get<{ ranking: LeaderboardEntry[] }>('/community/leaderboard').then(r => r.data.ranking),
}

// ═══════════════════════════════════════════════════════════════════════════
// PAINEL ADMINISTRATIVO DA PLATAFORMA (equipe intellsn) — autenticação própria,
// sem account_id, cross-tenant. Nunca compartilha sessão/token com o app do
// escritório (ver AdminAuthContext.tsx) — por isso é um cliente axios à parte.
// ═══════════════════════════════════════════════════════════════════════════

const httpAdmin = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
})

httpAdmin.interceptors.request.use((config) => {
  const token = localStorage.getItem('foro_admin_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

httpAdmin.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('foro_admin_token')
      localStorage.removeItem('foro_admin_user')
      window.location.href = '/admin/login'
    }
    return Promise.reject(err)
  }
)

export interface PlatformAdminAuthResponse {
  token: string
  admin: { id: string; name: string; email: string }
}

export interface AccountSummary {
  id: string
  name: string
  slug: string
  status: 'trialing' | 'active' | 'suspended' | 'cancelled'
  plan_id: string
  plan_name: string | null
  plan_price: number | null
  trial_ends_at: string | null
  users_count: number
  leads_count: number
  created_at: string
}

export interface AccountDetail extends AccountSummary {
  users: Array<{ id: string; name: string; email: string; role: string; active: boolean; email_verified_at: string | null; phone_verified_at: string | null; created_at: string }>
  recent_payments: Array<{ id: string; type: string; status: string; amount: number; credits_amount_cents: number | null; created_at: string }>
  credits_balance_cents: number
  recent_credit_transactions: CreditTransaction[]
}

export interface Plan {
  id: string
  name: string
  price: number
  max_users: number | null
  max_leads: number | null
  features: string[]
  active: boolean
}

export interface CreditsOverview {
  total_purchased_cents: number
  total_consumed_cents: number
  total_refunded_cents: number
  total_adjusted_cents: number
  by_service: Array<{ service_key: string; usage_count: number; consumed_cents: number }>
  total_wallets_balance_cents: number
}

export interface AdminAula {
  id: string
  trilha_id?: string
  title: string
  description: string | null
  video_provider: 'vimeo' | 'youtube' | 'url'
  video_id: string
  duration_seconds: number | null
  display_order: number
  published: boolean
}

export interface AdminTrilha {
  id: string
  title: string
  description: string | null
  cover_image_url: string | null
  display_order: number
  published: boolean
  total_aulas: number
}

export interface AdminTrilhaDetail extends AdminTrilha {
  aulas: AdminAula[]
}

export interface AdminQuizQuestion {
  id: string
  quiz_id: string
  prompt: string
  options: { id: string; label: string }[]
  correct_option_id: string
  display_order: number
}

export interface AdminQuiz {
  id: string
  aula_id: string
  title: string
  passing_score_pct: number
  points_awarded: number
  questions: AdminQuizQuestion[]
}

export interface AdminChallenge {
  id: string
  title: string
  description: string
  attachment_url: string | null
  points_awarded: number
  starts_at: string
  ends_at: string
  published: boolean
  total_conclusoes: number
}

export interface AdminCommunityPost {
  id: string
  content: string
  kind: 'conquista' | 'mensagem'
  created_at: string
  user_name: string
  account_name: string
  account_id: string
}

export const adminApi = {
  /** POST /auth/platform-login */
  login: (email: string, password: string) =>
    httpAdmin.post<PlatformAdminAuthResponse>('/auth/platform-login', { email, password }).then(r => r.data),

  /** GET /admin/accounts */
  listAccounts: () =>
    httpAdmin.get<{ accounts: AccountSummary[] }>('/admin/accounts').then(r => r.data.accounts),

  /** GET /admin/accounts/:id */
  getAccount: (id: string) =>
    httpAdmin.get<{ account: AccountDetail }>(`/admin/accounts/${id}`).then(r => r.data.account),

  /** PATCH /admin/accounts/:id/status */
  updateAccountStatus: (id: string, status: AccountSummary['status']) =>
    httpAdmin.patch<{ account: AccountDetail }>(`/admin/accounts/${id}/status`, { status }).then(r => r.data.account),

  /** GET /admin/plans */
  listPlans: () =>
    httpAdmin.get<{ plans: Plan[] }>('/admin/plans').then(r => r.data.plans),

  /** GET /admin/credits/overview */
  creditsOverview: () =>
    httpAdmin.get<{ overview: CreditsOverview }>('/admin/credits/overview').then(r => r.data.overview),

  /** PATCH /admin/accounts/:id/credits/adjust — único caminho de reembolso/ajuste, exige nota */
  adjustCredits: (id: string, data: { amount_cents: number; note: string }) =>
    httpAdmin.patch(`/admin/accounts/${id}/credits/adjust`, data).then(r => r.data),

  /** GET /admin/modules — catálogo completo de módulos */
  listModulesCatalog: () =>
    httpAdmin.get<{ modules: ModuleStatus[] }>('/admin/modules').then(r => r.data.modules),

  /** GET /admin/accounts/:id/modules — estado dos módulos de uma conta */
  getAccountModules: (accountId: string) =>
    httpAdmin.get<{ modules: ModuleStatus[] }>(`/admin/accounts/${accountId}/modules`).then(r => r.data.modules),

  /** PATCH /admin/accounts/:id/modules/:moduleKey — liga/desliga, exclusivo do admin da plataforma */
  setAccountModule: (accountId: string, moduleKey: string, enabled: boolean) =>
    httpAdmin.patch<{ modules: ModuleStatus[] }>(`/admin/accounts/${accountId}/modules/${moduleKey}`, { enabled }).then(r => r.data.modules),

  // ── CMS do módulo Educação (conteúdo da plataforma, não por conta) ────────

  /** GET /admin/education/trilhas */
  listTrilhas: () =>
    httpAdmin.get<{ trilhas: AdminTrilha[] }>('/admin/education/trilhas').then(r => r.data.trilhas),

  /** GET /admin/education/trilhas/:id */
  getTrilha: (id: string) =>
    httpAdmin.get<{ trilha: AdminTrilhaDetail }>(`/admin/education/trilhas/${id}`).then(r => r.data.trilha),

  /** POST /admin/education/trilhas */
  createTrilha: (data: { title: string; description?: string; cover_image_url?: string; display_order?: number; published?: boolean }) =>
    httpAdmin.post<{ trilha: AdminTrilhaDetail }>('/admin/education/trilhas', data).then(r => r.data.trilha),

  /** PUT /admin/education/trilhas/:id */
  updateTrilha: (id: string, data: Partial<{ title: string; description: string; cover_image_url: string; display_order: number; published: boolean }>) =>
    httpAdmin.put<{ trilha: AdminTrilhaDetail }>(`/admin/education/trilhas/${id}`, data).then(r => r.data.trilha),

  /** DELETE /admin/education/trilhas/:id */
  deleteTrilha: (id: string) =>
    httpAdmin.delete(`/admin/education/trilhas/${id}`).then(r => r.data),

  /** POST /admin/education/trilhas/:id/aulas */
  createAula: (trilhaId: string, data: { title: string; description?: string; video_provider?: string; video_id: string; duration_seconds?: number; display_order?: number; published?: boolean }) =>
    httpAdmin.post<{ aula: AdminAula }>(`/admin/education/trilhas/${trilhaId}/aulas`, data).then(r => r.data.aula),

  /** PUT /admin/education/aulas/:aulaId */
  updateAula: (aulaId: string, data: Partial<{ title: string; description: string; video_provider: string; video_id: string; duration_seconds: number; display_order: number; published: boolean }>) =>
    httpAdmin.put<{ aula: AdminAula }>(`/admin/education/aulas/${aulaId}`, data).then(r => r.data.aula),

  /** DELETE /admin/education/aulas/:aulaId */
  deleteAula: (aulaId: string) =>
    httpAdmin.delete(`/admin/education/aulas/${aulaId}`).then(r => r.data),

  // ── CMS do módulo Provas de conceito — um quiz por aula ───────────────────

  /** GET /admin/education/aulas/:aulaId/quiz — null se a aula ainda não tem prova */
  getQuizForAula: (aulaId: string) =>
    httpAdmin.get<{ quiz: AdminQuiz | null }>(`/admin/education/aulas/${aulaId}/quiz`).then(r => r.data.quiz),

  /** POST /admin/education/aulas/:aulaId/quiz */
  createQuiz: (aulaId: string, data: { title: string; passing_score_pct?: number; points_awarded?: number }) =>
    httpAdmin.post<{ quiz: AdminQuiz }>(`/admin/education/aulas/${aulaId}/quiz`, data).then(r => r.data.quiz),

  /** PUT /admin/quizzes/:id */
  updateQuiz: (id: string, data: Partial<{ title: string; passing_score_pct: number; points_awarded: number }>) =>
    httpAdmin.put<{ quiz: AdminQuiz }>(`/admin/quizzes/${id}`, data).then(r => r.data.quiz),

  /** DELETE /admin/quizzes/:id */
  deleteQuiz: (id: string) =>
    httpAdmin.delete(`/admin/quizzes/${id}`).then(r => r.data),

  /** POST /admin/quizzes/:id/questions */
  addQuizQuestion: (quizId: string, data: { prompt: string; options: { id: string; label: string }[]; correct_option_id: string; display_order?: number }) =>
    httpAdmin.post<{ question: AdminQuizQuestion }>(`/admin/quizzes/${quizId}/questions`, data).then(r => r.data.question),

  /** PUT /admin/quizzes/questions/:questionId */
  updateQuizQuestion: (questionId: string, data: Partial<{ prompt: string; options: { id: string; label: string }[]; correct_option_id: string; display_order: number }>) =>
    httpAdmin.put<{ question: AdminQuizQuestion }>(`/admin/quizzes/questions/${questionId}`, data).then(r => r.data.question),

  /** DELETE /admin/quizzes/questions/:questionId */
  deleteQuizQuestion: (questionId: string) =>
    httpAdmin.delete(`/admin/quizzes/questions/${questionId}`).then(r => r.data),

  // ── CMS do módulo Desafios semanais ────────────────────────────────────────

  /** GET /admin/challenges */
  listChallenges: () =>
    httpAdmin.get<{ challenges: AdminChallenge[] }>('/admin/challenges').then(r => r.data.challenges),

  /** POST /admin/challenges */
  createChallenge: (data: { title: string; description: string; attachment_url?: string; points_awarded?: number; starts_at: string; ends_at: string; published?: boolean }) =>
    httpAdmin.post<{ challenge: AdminChallenge }>('/admin/challenges', data).then(r => r.data.challenge),

  /** PUT /admin/challenges/:id */
  updateChallenge: (id: string, data: Partial<{ title: string; description: string; attachment_url: string; points_awarded: number; starts_at: string; ends_at: string; published: boolean }>) =>
    httpAdmin.put<{ challenge: AdminChallenge }>(`/admin/challenges/${id}`, data).then(r => r.data.challenge),

  /** DELETE /admin/challenges/:id */
  deleteChallenge: (id: string) =>
    httpAdmin.delete(`/admin/challenges/${id}`).then(r => r.data),

  // ── Moderação do módulo Comunidade ────────────────────────────────────────

  /** GET /admin/community/posts */
  listCommunityPosts: () =>
    httpAdmin.get<{ posts: AdminCommunityPost[] }>('/admin/community/posts').then(r => r.data.posts),

  /** DELETE /admin/community/posts/:id */
  deleteCommunityPost: (id: string) =>
    httpAdmin.delete(`/admin/community/posts/${id}`).then(r => r.data),
}

export default http
