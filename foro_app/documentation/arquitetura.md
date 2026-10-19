# Arquitetura do Foro

## Visão geral

```
                        VPS (porta 3040)
                               │
                        ┌──────▼──────┐
                        │  Docker     │
                        │  Compose    │
                        └──────┬──────┘
                               │
               ┌───────────────┼───────────────┐
               │                               │
        ┌──────▼──────┐               ┌────────▼───────┐
        │  api service │               │   db service   │
        │  Node 20     │               │   MySQL 8.0    │
        │  porta 3040  │◄──────────────│   porta 3306   │
        └──────┬───────┘               └────────────────┘
               │
       ┌───────┴────────┐
       │                │
  /api/*          /*  (SPA)
  Express          dist/index.html
  REST API         (React build)
```

O container `api` serve duas coisas no mesmo processo Node.js:
1. A API REST em `/api/*`
2. O build estático do React em qualquer outra rota (SPA catch-all)

---

## Camadas do backend

```
Requisição HTTP
      │
      ▼
 server.js          ← entry point, middlewares globais (helmet, cors, morgan, rate limit)
      │
      ▼
 api.routes.js      ← ÚNICO arquivo de rotas
      │
      ├── [auth middlewares]   authenticate() + loadClientContext()
      │
      ▼
 controllers/       ← recebem req/res, delgam para services, formatam response
      │
      ▼
 services/          ← lógica de negócio, queries no banco, chamadas externas
      │
      ▼
 configs/db.config.js  ← pool mysql2, helpers query() e transaction()
      │
      ▼
 MySQL 8.0
```

---

## Multi-tenancy

Cada escritório de advocacia é uma **conta** (`accounts` table). Tudo na aplicação é filtrado por `account_id`.

Fluxo por requisição:
1. `authenticate()` valida o JWT e injeta `req.user = { id, account_id, role, email }`
2. `loadClientContext()` carrega a conta do banco e injeta `req.account = { id, name, status, plan_id }`
3. Se a conta estiver `suspended` ou `cancelled` → 403
4. Todos os services recebem `accountId` como parâmetro obrigatório e usam em todos os `WHERE`

---

## Autenticação

- JWT com expiração de 7 dias (`ACCESS_TOKEN_EXPIRY=7d`)
- Token armazenado no `localStorage` do browser (chave: `foro_token`)
- Refresh token: `POST /api/auth/refresh-token`
- Roles: `admin` (dono do escritório) e `user` (advogados/assistentes)

---

## IA como interface do CRM

O diferencial do Foro é usar a IA como primeira interface. O advogado descreve em linguagem natural o que quer fazer; a IA executa via **tool use (function calling)** da Anthropic.

### Fluxo de um turno de chat

```
Usuário envia mensagem
       │
       ▼
ai.service.js
  1. Carrega histórico (últimas 20 mensagens)
  2. Carrega schema dos campos customizados (para o system prompt)
  3. Chama Anthropic API com tools
       │
       ▼
  Anthropic retorna stop_reason
       │
  ┌────┴────────────────────┐
  │                         │
"end_turn"             "tool_use"
  │                         │
  │                    ai-tools.service.js
  │                    executeTool(name, input, context)
  │                         │
  │                    leads.service.js
  │                    (create, update, search...)
  │                         │
  │                    Resultado → re-envia para Anthropic
  │                         │
  │                    (loop até end_turn ou max 8 tools)
  │                         │
  └─────────────────────────┘
       │
       ▼
  Salva mensagens em ai_messages
  Registra custo em ai_usage
  Retorna { conversation_id, message, usage }
```

### 10 tools disponíveis

| Tool               | Descrição                                 |
|--------------------|-------------------------------------------|
| `create_lead`      | Cria novo lead                            |
| `update_lead`      | Atualiza dados do lead                    |
| `move_lead_stage`  | Move lead para outro estágio do funil     |
| `add_note`         | Adiciona nota ao lead                     |
| `create_task`      | Cria tarefa vinculada ao lead             |
| `complete_task`    | Marca tarefa como concluída               |
| `search_leads`     | Busca leads por texto + filtros           |
| `get_lead`         | Retorna dados completos de um lead        |
| `get_funnel_summary` | Resumo de todos os estágios do funil   |
| `list_tasks`       | Lista tarefas pendentes                   |

---

## Campos customizáveis (EAV)

Os campos do CRM são configuráveis por conta via padrão EAV (Entity-Attribute-Value):

```
field_definitions     →  define os campos (name, label, field_type, collect_via_ai...)
lead_field_values     →  armazena os valores (um registro por campo por lead)
```

Tipos suportados: `text`, `textarea`, `number`, `date`, `boolean`, `select`

O schema dos campos é injetado no **system prompt da IA** a cada turno, permitindo que a IA colete, valide e preencha campos de acordo com o perfil do escritório.

---

## Pagamentos e NFS-e

Ver [pagamentos.md](./pagamentos.md)

---

## Banco de dados

Schema completo em `backend/configs/init.sql`.

Tabelas principais:

| Tabela              | Descrição                                         |
|---------------------|---------------------------------------------------|
| `accounts`          | Escritórios (tenants)                             |
| `users`             | Usuários de cada escritório                       |
| `field_definitions` | Definição dos campos customizáveis do CRM         |
| `leads`             | Leads/clientes                                    |
| `lead_field_values` | Valores dos campos customizáveis por lead         |
| `lead_notes`        | Notas/observações do lead                         |
| `tasks`             | Tarefas vinculadas ao lead                        |
| `ai_conversations`  | Conversas com a IA                                |
| `ai_messages`       | Mensagens das conversas                           |
| `ai_usage`          | Custo e uso de tokens por turno                   |
| `audit_events`      | Log de auditoria (canal: ui, ai_chat, api, etc.)  |
| `payments`          | Registros de pagamentos via Asaas                 |
| `nfse_records`      | Registros de NFS-e emitidas via NFE.io            |

Todas as PKs são UUID gerados pelo MySQL: `DEFAULT (UUID())`.

---

## Auditoria

Toda ação significativa gera um registro em `audit_events` com o campo `channel`:
- `ui` — ação feita pelo usuário via interface web
- `ai_chat` — ação executada pela IA em resposta a uma mensagem
- `whatsapp_automation` — (futuro) ações via automação WhatsApp
- `api` — ações via API externa

Isso permite rastrear exatamente quem fez o quê e por qual meio.
