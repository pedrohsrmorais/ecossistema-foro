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
    // 401 em /auth/* (ex.: senha errada no login) NÃO é sessão expirada: o erro tem que aparecer na tela.
    if (err.response?.status === 401 && !String(err.config?.url || '').startsWith('/auth/')) {
      localStorage.removeItem('foro_token')
      localStorage.removeItem('foro_user')
      window.location.href = '/login'
    }
    // Teste grátis acabou: só resta escolher um plano (ver client.middleware.js)
    if (err.response?.status === 403 && ['TRIAL_EXPIRED', 'SUBSCRIPTION_EXPIRED'].includes(err.response?.data?.code)
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
  cases_count?: number
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
  case_id?: string | null
  case_number?: string | null
  is_deadline?: number
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
  case_id?: string | null
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
  type: string
  status: string
  amount: number
  description: string | null
  /** página da fatura no Stripe (recibo) e PDF */
  hosted_invoice_url: string | null
  invoice_pdf: string | null
  paid_at: string | null
  created_at: string
}

/** GET /settings/plan — plano atual + estado da assinatura (Stripe) */
export interface CurrentPlan {
  current: string
  name: string
  price: number
  max_users: number | null
  max_leads: number | null
  ai_credits_week: number
  lookups_week: number
  features: string[]
  account_status: 'trialing' | 'active' | 'suspended' | 'cancelled' | 'expired'
  trial_ends_at: string | null
  subscription: {
    status: 'active' | 'past_due' | 'canceled' | null
    current_period_end: string | null
    cancel_at_period_end: boolean
    can_manage: boolean
  }
}

export interface User {
  id: string
  name: string
  email: string
  role: string
  active: boolean
  created_at: string
  /** true enquanto a pessoa não confirmou o e-mail / aceitou o convite */
  pending_invite?: boolean
  email_verified?: boolean
  oab_number?: string | null
  is_owner?: boolean
  permissions?: Permissions
}
export type Permissions = {
  templates_manage: boolean; ai_drafts: boolean; delete_records: boolean
  access_leads: boolean; access_cases: boolean; access_documents: boolean; access_agenda: boolean; access_ai: boolean
  view_scope: 'all' | 'own'
}
export interface PermissionDef { key: Exclude<keyof Permissions, 'view_scope'>; label: string; default: boolean; group: 'module' | 'action' }

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
  register: (data: { name: string; email: string; password: string; phone?: string; accountName?: string }) =>
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
  updateMe: (data: { name?: string; oab_number?: string }) =>
    http.put<User>('/users/me', data).then(r => r.data),

  /** PUT /users/me/password */
  changePassword: (data: { currentPassword: string; newPassword: string }) =>
    http.put('/users/me/password', data).then(r => r.data),

  /** GET /users/:id */
  getById: (id: string) =>
    http.get<User>(`/users/${id}`).then(r => r.data),

  /** PUT /users/:id */
  update: (id: string, data: Omit<Partial<User>, 'permissions'> & { permissions?: Partial<Permissions> }) =>
    http.put<User>(`/users/${id}`, data).then(r => r.data),

  /** DELETE /users/:id */
  deactivate: (id: string) =>
    http.delete(`/users/${id}`).then(r => r.data),

  /** POST /users/invite — admin convida por e-mail (respeita o limite de usuários do plano) */
  invite: (data: { name: string; email: string; role?: 'admin' | 'user' }) =>
    http.post<User>('/users/invite', data).then(r => r.data),

  /** POST /users/:id/resend-invite */
  resendInvite: (id: string) =>
    http.post(`/users/${id}/resend-invite`).then(r => r.data),
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
  createTask: (leadId: string, data: { description: string; due_date?: string; case_id?: string; is_deadline?: boolean }) =>
    http.post<Task>(`/leads/${leadId}/tasks`, data).then(r => r.data),

  /** PATCH /leads/:leadId/tasks/:taskId/complete */
  completeTask: (leadId: string, taskId: string) =>
    http.patch<Task>(`/leads/${leadId}/tasks/${taskId}/complete`).then(r => r.data),
}

// ─── PROCESSOS e AGENDA ──────────────────────────────────────────────────────

export type CaseStatus = 'ativo' | 'suspenso' | 'arquivado' | 'encerrado'

export interface Case {
  id: string
  lead_id: string | null
  lead_name: string | null
  lead_phone?: string | null
  lead_email?: string | null
  case_number: string | null
  title: string | null
  tribunal: string | null
  court_url: string | null
  area: string | null
  status: CaseStatus
  phase: string | null
  client_role: string | null
  opposing_party: string | null
  cause_value: string | null
  responsible_name: string | null
  next_deadline: string | null
  created_at: string
  area_key: string
  comarca: string | null
  vara: string | null
  magistrate: string | null
  stage_id: string | null
  stage_label: string | null
  stage_color: string | null
  parties_count?: number
}

export interface CaseUpdate { id: string; update_date: string; text: string; source: string; created_at: string }

export interface CrmEvent {
  id: string
  type: 'reuniao' | 'audiencia' | 'pericia' | 'outro'
  title: string
  starts_at: string
  ends_at: string | null
  location: string | null
  meeting_url: string | null
  notes: string | null
  status: 'agendado' | 'realizado' | 'cancelado'
  lead_id: string | null
  lead_name: string | null
  case_id: string | null
  case_number: string | null
  case_title: string | null
}

export interface AreaField { key: string; label: string; type: 'text' | 'textarea' | 'select' | 'multiselect' | 'number' | 'date'; options?: string[]; help?: string }
export interface AreaMeta { key: string; label: string; short: string; description: string; fields: AreaField[] }
export interface CaseStage { id: string; area_key: string; stage_key: string; label: string; color: string; position: number; is_final: number; cases_count?: number }
export interface CaseParty {
  id: string; name: string; role: string; role_label: string; document: string | null; document_formatted: string
  email: string | null; phone: string | null; address: string | null; nationality: string | null; marital_status: string | null; profession: string | null
  responsible_user_id: string | null; responsible_name: string | null; notes: string | null
}
export interface CaseMember { id: string; user_id: string; role: 'responsavel' | 'colaborador'; name: string; email: string }
export interface DocumentSummary { id: string; case_id: string | null; template_key: string | null; area_key: string; title: string; status: 'rascunho' | 'revisado' | 'final'; ai_generated: number; open_flags: number; updated_at: string; case_title?: string | null; case_number?: string | null }
export interface DocumentTemplate { id?: string; key: string; title: string; area: string; version: string; reviewed: boolean; source: string | null; description: string | null; legal_basis: string[]; origin: string; ai_slots: number }
export interface DocumentFull extends DocumentSummary {
  content: string; pending_ai_slots: number
  versions: { version_no: number; note: string | null; created_at: string }[]
  template: { key: string; title: string; reviewed: boolean; origin: string; source: string | null; legal_basis: string[] } | null
}

export interface CaseDetail extends Case {
  area_label: string
  area_fields: AreaField[]
  details: Record<string, string | number | string[]>
  missing_fields: string[]
  parties: CaseParty[]
  members: CaseMember[]
  documents: DocumentSummary[]
  tribunal_name: string | null
  suggested_url: string | null
  number_valid?: boolean | null
  updates: CaseUpdate[]
  tasks: Task[]
  events: CrmEvent[]
}

export interface CaseNumberAnalysis { case_number: string; tribunal: string | null; tribunal_name?: string | null; valid: boolean; suggested_url: string | null }

export const casesApi = {
  list: (params?: { status?: string; search?: string; lead_id?: string; area_key?: string }) =>
    http.get<{ data: Case[]; total: number }>('/cases', { params }).then(r => r.data),
  getById: (id: string) => http.get<CaseDetail>(`/cases/${id}`).then(r => r.data),
  create: (data: Partial<Case> & { cause_value?: string | number }) =>
    http.post<CaseDetail>('/cases', data).then(r => r.data),
  update: (id: string, data: Record<string, unknown>) => http.put<CaseDetail>(`/cases/${id}`, data).then(r => r.data),
  remove: (id: string) => http.delete(`/cases/${id}`).then(r => r.data),
  analyze: (number: string) => http.get<CaseNumberAnalysis>('/cases/analyze', { params: { number } }).then(r => r.data),
  addUpdate: (id: string, data: { text: string; update_date?: string }) =>
    http.post<CaseUpdate>(`/cases/${id}/updates`, data).then(r => r.data),
  deleteUpdate: (id: string, updateId: string) => http.delete(`/cases/${id}/updates/${updateId}`).then(r => r.data),
}

export const areasApi = { list: () => http.get<AreaMeta[]>('/areas').then(r => r.data) }

export const stagesApi = {
  list: (area_key?: string) => http.get<CaseStage[]>('/case-stages', { params: { area_key } }).then(r => r.data),
  create: (d: { area_key: string; label: string; color?: string; is_final?: boolean }) => http.post<CaseStage>('/case-stages', d).then(r => r.data),
  update: (id: string, d: Partial<{ label: string; color: string; is_final: boolean }>) => http.put<CaseStage>(`/case-stages/${id}`, d).then(r => r.data),
  reorder: (area_key: string, ids: string[]) => http.put<CaseStage[]>('/case-stages/reorder', { area_key, ids }).then(r => r.data),
  remove: (id: string, move_to?: string) => http.delete(`/case-stages/${id}`, { params: { move_to } }).then(r => r.data),
  reset: (area_key: string) => http.post<CaseStage[]>('/case-stages/reset', { area_key }).then(r => r.data),
}

export const casePeopleApi = {
  addParty: (caseId: string, d: Partial<CaseParty> & { name: string; role: string }) => http.post<CaseParty>(`/cases/${caseId}/parties`, d).then(r => r.data),
  updateParty: (caseId: string, partyId: string, d: Partial<CaseParty>) => http.put<CaseParty>(`/cases/${caseId}/parties/${partyId}`, d).then(r => r.data),
  removeParty: (caseId: string, partyId: string) => http.delete(`/cases/${caseId}/parties/${partyId}`).then(r => r.data),
  setMembers: (caseId: string, members: { user_id: string; role: 'responsavel' | 'colaborador' }[]) => http.put<CaseMember[]>(`/cases/${caseId}/members`, { members }).then(r => r.data),
  moveStage: (caseId: string, stage_id: string) => http.put<CaseDetail>(`/cases/${caseId}/stage`, { stage_id }).then(r => r.data),
}

export interface DraftResult { document: DocumentFull; flagged_citations: string[]; unfilled_slots: number; credits_used: number }
export interface OfficeTemplate extends DocumentTemplate { id: string; body: string; unknown_placeholders: string[]; created_by?: string }
export interface OfficeTemplateRow { id: string; key: string; title: string; area_key: string; description: string | null; reviewed: number; version: number; legal_basis: string[]; created_by: string; created_by_name: string | null; updated_at: string; size: number }
export interface ConvertResult { title: string; description: string | null; area_key: string; body: string; legal_basis: string[]; modified_fragments: string[]; unknown_placeholders: string[]; ai_slots: number; credits_used: number }
export interface TemplateInput { title: string; area_key: string; description?: string | null; body: string; reviewed?: boolean; legal_basis?: string[] }
export interface Office {
  configured: boolean; id: string; name: string; cnpj: string | null; address: string | null; city: string | null; state: string | null; phone: string | null
  owner_user_id: string | null; created_at: string; seats_used: number; is_admin: boolean
  plan: { id: string; name: string; max_users: number | null; status: string; trial_ends_at: string | null }
  code?: string; pending_requests?: number
  my_join_request?: { id: string; office_name: string; created_at: string } | null
}
export interface OfficeData { name?: string; cnpj?: string; address?: string; city?: string; state?: string; office_phone?: string }
export interface JoinRequest { id: string; name: string; email: string; created_at: string }
export interface ActivityRow {
  user_id: string; name: string; email: string; role: string; active: boolean; seconds: number; active_days: number; actions: number
  last_seen_at: string | null; level: 'inativo' | 'baixo' | 'médio' | 'alto'; ai_credits: number; ai_calls: number; documents_created: number; cases_responsible: number
}
export interface ActivityReport { days: number; users: ActivityRow[]; series: { day: string; seconds: number }[] }
export const officeApi = {
  get: () => http.get<Office>('/office').then(r => r.data),
  create: (d: OfficeData) => http.post<Office>('/office', d).then(r => r.data),
  update: (d: OfficeData) => http.put<Office>('/office', d).then(r => r.data),
  regenerateCode: () => http.post<Office>('/office/code/regenerate').then(r => r.data),
  join: (code: string) => http.post<{ office_name: string }>('/office/join', { code }).then(r => r.data),
  cancelJoin: () => http.delete('/office/join').then(r => r.data),
  requests: () => http.get<JoinRequest[]>('/office/requests').then(r => r.data),
  decide: (id: string, approve: boolean) => http.post(`/office/requests/${id}`, { approve }).then(r => r.data),
  activity: (days: number) => http.get<ActivityReport>('/office/activity', { params: { days } }).then(r => r.data),
  ping: () => http.post('/activity/ping').then(r => r.data),
}
export const permissionsApi = { defs: () => http.get<PermissionDef[]>('/permissions').then(r => r.data) }
export const officeTemplatesApi = {
  list: () => http.get<OfficeTemplateRow[]>('/office-templates').then(r => r.data),
  get: (id: string) => http.get<OfficeTemplate>(`/office-templates/${id}`).then(r => r.data),
  create: (d: TemplateInput) => http.post<OfficeTemplate>('/office-templates', d).then(r => r.data),
  update: (id: string, d: Partial<TemplateInput>) => http.put<OfficeTemplate>(`/office-templates/${id}`, d).then(r => r.data),
  remove: (id: string) => http.delete(`/office-templates/${id}`).then(r => r.data),
  check: (body: string, area_key: string) => http.post<{ unknown_placeholders: string[]; ai_slots: number }>('/office-templates/check', { body, area_key }).then(r => r.data),
  extract: (data_base64: string) => http.post<{ text: string; truncated: boolean }>('/office-templates/extract', { data_base64 }).then(r => r.data),
  convert: (text: string, area_key?: string) => http.post<ConvertResult>('/office-templates/convert', { text, area_key }).then(r => r.data),
}

export const documentsApi = {
  templates: (area_key?: string) => http.get<{ templates: DocumentTemplate[] }>('/document-templates', { params: { area_key } }).then(r => r.data.templates),
  list: (params?: { case_id?: string; area_key?: string; status?: string; search?: string }) => http.get<DocumentSummary[]>('/documents', { params }).then(r => r.data),
  get: (id: string) => http.get<DocumentFull>(`/documents/${id}`).then(r => r.data),
  create: (d: { template_key?: string; case_id?: string; title?: string; area_key?: string }) => http.post<DocumentFull>('/documents', d).then(r => r.data),
  update: (id: string, d: { title?: string; content?: string; status?: string }) => http.put<DocumentFull>(`/documents/${id}`, d).then(r => r.data),
  remove: (id: string) => http.delete(`/documents/${id}`).then(r => r.data),
  draft: (id: string, instructions?: string) => http.post<DraftResult>(`/documents/${id}/draft`, { instructions }).then(r => r.data),
  version: (id: string, n: number) => http.get<{ version_no: number; content: string }>(`/documents/${id}/versions/${n}`).then(r => r.data),
  restore: (id: string, n: number) => http.post<DocumentFull>(`/documents/${id}/versions/${n}/restore`).then(r => r.data),
  exportDocx: async (id: string, filename: string) => {
    const r = await http.get(`/documents/${id}/export.docx`, { responseType: 'blob' })
    const url = URL.createObjectURL(r.data); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10_000)
  },
}

export const eventsApi = {
  list: (params?: { from?: string; to?: string; lead_id?: string; case_id?: string }) =>
    http.get<CrmEvent[]>('/events', { params }).then(r => r.data),
  create: (data: Partial<CrmEvent>) => http.post<CrmEvent>('/events', data).then(r => r.data),
  update: (id: string, data: Partial<CrmEvent>) => http.put<CrmEvent>(`/events/${id}`, data).then(r => r.data),
  remove: (id: string) => http.delete(`/events/${id}`).then(r => r.data),
}

// ─── TASKS (visão global) ─────────────────────────────────────────────────────

export const tasksApi = {
  /** GET /tasks */
  listAll: (params?: { pending_only?: boolean; page?: number; limit?: number }) =>
    http.get<Task[]>('/tasks', { params }).then(r => r.data),

  /** POST /tasks — tarefa ou prazo, com ou sem lead/processo */
  create: (data: { description: string; due_date?: string; lead_id?: string | null; case_id?: string; is_deadline?: boolean }) =>
    http.post<Task>('/tasks', data).then(r => r.data),
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

  /** POST /payments/checkout — abre o Checkout do Stripe (cartão). Redirecionar o navegador para `url`. */
  checkout: (plan: string) =>
    http.post<{ url: string }>('/payments/checkout', { plan }).then(r => r.data),

  /** POST /payments/portal — Portal do Cliente do Stripe (trocar de plano, cartão, cancelar, faturas). */
  portal: () =>
    http.post<{ url: string }>('/payments/portal').then(r => r.data),

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
    http.get<CurrentPlan>('/settings/plan').then(r => r.data),
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
    http.get<{ transactions: CreditTransaction[] }>('/credits/transactions', { params }).then(r => r.data)
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


// ─── ALERTAS DE PRAZO ────────────────────────────────────────────────────────

export type AlertKind = 'prazo' | 'tarefa' | 'audiencia' | 'pericia' | 'reuniao' | 'evento'
export interface AlertItem {
  id: string
  kind: AlertKind
  title: string
  at: string
  days: number // negativo = atrasado
  case_id: string | null
  case_label: string | null
  lead_id: string | null
  lead_name: string | null
  meeting_url?: string | null
}
export interface AlertsSummary {
  counts: { overdue: number; today: number; upcoming: number; urgent: number }
  overdue: AlertItem[]
  today: AlertItem[]
  upcoming: AlertItem[]
}

export const alertsApi = {
  summary: () => http.get<AlertsSummary>('/alerts').then(r => r.data),
  getPrefs: () => http.get<{ deadlines_email: boolean; email: string }>('/alerts/preferences').then(r => r.data),
  setPrefs: (deadlines_email: boolean) => http.put<{ deadlines_email: boolean }>('/alerts/preferences', { deadlines_email }).then(r => r.data),
  sendTest: () => http.post<{ sent_to: string }>('/alerts/digest/test').then(r => r.data),
}

// ─── PAINEL ──────────────────────────────────────────────────────────────────

export interface DashboardData {
  alerts: { counts: AlertsSummary['counts']; overdue: AlertItem[]; today: AlertItem[]; upcoming: AlertItem[] }
  leads: {
    total: number; new_30d: number; converted: number; conversion_rate: number; stale: number; converted_no_case: number
    funnel: { stage: string; total: number }[]
    weekly: { week_start: string; total: number }[]
    stale_list: { id: string; name: string | null; stage: string; last_touch: string }[]
    converted_no_case_list: { id: string; name: string | null }[]
  }
  cases: { total: number; active: number; active_value: number; active_no_deadline: number; by_area: { area: string; total: number }[] }
  tasks: { pending: number }
  fees: { projected: number; closed: number }
}

export const dashboardApi = { get: () => http.get<DashboardData>('/dashboard').then(r => r.data) }

// ─── SUPORTE ─────────────────────────────────────────────────────────────────

export interface SupportInfo { email: string | null; whatsapp: string | null; hours: string; categories: string[] }
export interface SupportTicket { id: string; category: string; subject: string; message: string; status: 'aberto' | 'respondido' | 'fechado'; created_at: string }

export const supportApi = {
  info: () => http.get<SupportInfo>('/support').then(r => r.data),
  list: () => http.get<SupportTicket[]>('/support/tickets').then(r => r.data),
  create: (data: { category: string; subject: string; message: string; page?: string }) =>
    http.post<{ id: string; status: string; emailed: boolean; reply_to: string }>('/support/tickets', data).then(r => r.data),
}
