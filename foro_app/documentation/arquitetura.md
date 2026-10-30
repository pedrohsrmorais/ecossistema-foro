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

### Cadastro, verificação de e-mail e trial

O cadastro **não exige pagamento** para liberar o acesso, mas **exige e-mail confirmado**: `POST /api/auth/register` cria a conta (status `trialing`, 14 dias) + usuário admin, já retorna o JWT, e dispara automaticamente um código de verificação por e-mail (via Resend — ver `services/email.service.js`). O JWT é emitido imediatamente porque é ele que autentica a própria chamada de confirmação (`POST /auth/verify-code`) — sem token não haveria como confirmar o código.

A partir daí, o middleware `requireVerifiedEmail` (em `auth.middleware.js`) bloqueia **todas** as rotas protegidas com `403 { code: 'EMAIL_NOT_VERIFIED' }` até que `users.email_verified_at` seja preenchido. Ficam deliberadamente fora desse bloqueio — registradas antes do `router.use(requireVerifiedEmail)` em `api.routes.js` — apenas três rotas: `POST /auth/send-verification`, `POST /auth/verify-code` e `GET /users/me` (para a tela "Confirme seu e-mail" conseguir mostrar o e-mail e reenviar o código). No frontend, `components/RequireVerified.tsx` replica essa mesma regra redirecionando para `/verify-email`.

A verificação de **celular** (`channel: 'phone'`) usa a mesma tabela/endpoints, mas não é obrigatória — nenhum provedor de SMS foi integrado ainda (ver pendências em [banco-de-dados.md](./banco-de-dados.md)).

Quando o trial expira (`accounts.trial_ends_at`) sem uma assinatura ativa, o `client.middleware.js` responde `403 { code: 'TRIAL_EXPIRED' }` em toda rota protegida, até que `POST /api/payments/subscription` seja chamado (o que muda `accounts.status` para `active`).

### Painel administrativo da plataforma

Fora do conceito de tenant existe a equipe da intellsn, que administra todos os escritórios cadastrados. Login via `POST /api/auth/platform-login` (tabela `platform_admins`, seedada no `init.sql`), autenticado por um middleware próprio (`authenticatePlatform`) que não depende de `account_id`. Rotas: `GET /api/admin/accounts`, `GET /api/admin/accounts/:id`, `PATCH /api/admin/accounts/:id/status`, `GET /api/admin/plans`, além de créditos, módulos e o CMS de Educação (ver [api-reference.md](./api-reference.md)). Tem frontend próprio em `frontend/src/pages/admin/`, com contexto de autenticação separado (`AdminAuthContext.tsx`) — nunca compartilha sessão com o app do tenant.

### Módulos (feature toggle por conta)

Cada funcionalidade (`crm`, `pesquisa_cpf_cnpj`, `pesquisa_processual`, `educacao`) pode ser desativada por conta, exclusivamente por um admin da plataforma — nunca pelo próprio tenant. Middleware `requireModule('crm')` (`middlewares/modules.middleware.js`) protege as rotas e responde `403 { code: 'MODULE_DISABLED' }` quando desativado; "sem configuração" em `account_modules` significa ativo por padrão. Ver [banco-de-dados.md](./banco-de-dados.md#8-módulos--ligadesliga-funcionalidade-por-conta).

### Educação

Módulo de trilhas/aulas em vídeo sobre tecnologia para escritórios de advocacia. Conteúdo é da **plataforma**, não por conta — criado pela equipe intellsn no CMS do painel administrativo, visível para todo tenant com o módulo `educacao` ativo. Vídeo hospedado externamente (Vimeo privado recomendado); o banco só guarda o `video_id`. Progresso (`aula_progresso`) é por usuário individual. Ver [banco-de-dados.md](./banco-de-dados.md#9-educação--trilhas-e-aulas-em-vídeo).

### Provas de conceito, Desafios semanais e Comunidade — o "ecossistema"

Três módulos novos que estendem a ideia de Educação pra um ciclo completo de engajamento: ver conteúdo → testar o que aprendeu → ganhar pontos → compartilhar com o escritório. Cada um é um módulo independente (`provas_conceito`, `desafios_semanais`, `comunidade`), desativável por conta como qualquer outro.

- **Provas de conceito** (`quizzes.service.js`): um quiz de múltipla escolha vinculado a UMA aula (no máximo um por aula), criado no CMS do admin. Pontos (`quizzes.points_awarded`) são concedidos só na primeira vez que o usuário atinge a nota mínima — tentativas seguintes ficam no histórico (`quiz_attempts`) mas não pontuam de novo.
- **Desafios semanais** (`challenges.service.js`): desafios publicados pela equipe intellsn, com janela de vigência (`starts_at`/`ends_at`). Conclusão é **auto-declarada** pelo usuário — sem verificação nem evidência — decisão deliberada pra manter o MVP simples.
- **Comunidade** (`community.service.js`): duas coisas separadas por design —
  1. Um **feed de conquistas isolado por conta** (`community_posts`) — nunca cross-tenant, porque escritórios de advocacia costumam ser concorrentes entre si. Posts são gerados automaticamente ao passar numa prova de conceito ou concluir um desafio, ou escritos livremente pelo usuário.
  2. Um **ranking de pontos entre escritórios** (`GET /community/leaderboard`) — esse sim é cross-tenant, por decisão explícita do dono da plataforma. Não existe tabela de pontos própria: é agregação, calculada na hora, de `quiz_attempts.points_awarded` + `weekly_challenge_completions.points_awarded`.

Ver [banco-de-dados.md](./banco-de-dados.md#10-provas-de-conceito--quiz-vinculado-a-uma-aula) (seções 10-12).

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

Schema completo em `backend/configs/init.sql`. Documentação detalhada (relacionamentos, seeds, pendências): [banco-de-dados.md](./banco-de-dados.md).

Tabelas principais:

| Tabela                  | Descrição                                         |
|-------------------------|-----------------------------------------------------|
| `platform_admins`       | Equipe intellsn — administra todos os tenants       |
| `plans`                 | Catálogo de planos (preço/recursos)                 |
| `accounts`              | Escritórios (tenants)                               |
| `users`                 | Usuários de cada escritório                         |
| `verification_codes`    | Códigos OTP de verificação de e-mail/celular        |
| `password_reset_tokens` | Tokens do fluxo "esqueci minha senha"               |
| `field_definitions`     | Definição dos campos customizáveis do CRM           |
| `leads`                 | Leads/clientes                                      |
| `lead_field_values`     | Valores dos campos customizáveis por lead           |
| `lead_notes`            | Notas/observações do lead                           |
| `tasks`                 | Tarefas vinculadas ao lead                          |
| `ai_conversations`      | Conversas com a IA                                  |
| `ai_messages`           | Mensagens das conversas                             |
| `ai_usage`              | Custo e uso de tokens por turno                     |
| `audit_events`          | Log de auditoria (canal: ui, ai_chat, api, etc.)    |
| `payments`              | Faturas pagas via Stripe                   |
| `nfse_records`          | Registros de NFS-e emitidas via NFE.io              |

Todas as PKs são UUID gerados pelo MySQL: `DEFAULT (UUID())`.

---

## Auditoria

Toda ação significativa gera um registro em `audit_events` com o campo `channel`:
- `ui` — ação feita pelo usuário via interface web
- `ai_chat` — ação executada pela IA em resposta a uma mensagem
- `whatsapp_automation` — (futuro) ações via automação WhatsApp
- `api` — ações via API externa

Isso permite rastrear exatamente quem fez o quê e por qual meio.
