// Re-exports all types from api.ts for convenience
// A fonte canônica de cada tipo vive em src/api.ts — este arquivo só reexporta.

export type {
  AuthResponse,
  User,
  Lead,
  Note,
  Task,
  FieldDefinition,
  PaginatedResult,
  FunnelStage,
  AiMessage,
  AiChatResponse,
  Payment,
} from '../api'
