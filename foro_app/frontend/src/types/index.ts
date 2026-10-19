// Re-exports all types from api.ts for convenience
// The canonical type definitions live in src/api.ts

export type {
  AuthResponse,
  User,
  Lead,
  LeadStage,
  Note,
  Task,
  FieldDefinition,
  FieldType,
  PaginatedResult,
  FunnelStage,
  AiMessage,
  AiChatResponse,
  AiUsage,
  Payment,
  NfseRecord,
  AccountSettings,
} from '../api'
