# Foro — Ecossistema Jurídico

**CRM com IA como interface principal para escritórios de advocacia.**

---

## Visão geral

O Foro é uma plataforma SaaS multi-tenant para escritórios de advocacia. O primeiro módulo é um CRM onde a IA (via tool use / function calling) é a interface principal: o advogado fala em linguagem natural, a IA executa ações reais no CRM.

---

## Stack

| Camada      | Tecnologia                              |
|-------------|-----------------------------------------|
| Frontend    | React + Vite + TypeScript + Tailwind CSS |
| Backend     | Node.js + Express (RESTful API)         |
| Banco       | MySQL 8 via `mysql2` (connection pool)  |
| IA interna  | Anthropic API (`@anthropic-ai/sdk`)     |
| Pagamentos  | Asaas (PIX + cartão + assinatura)       |
| NFS-e       | NFE.io (emissão automática)             |
| Container   | Docker + Docker Compose                 |

---

## Estrutura de pastas

```
foro_app/
├── backend/
│   ├── server.js               # Entrada principal; serve o dist/ do frontend
│   ├── routes/
│   │   └── api.routes.js       # ÚNICO arquivo de rotas — mapeia todas as rotas
│   ├── controllers/            # Recebem req/res, delegam para services
│   │   ├── auth.controller.js
│   │   ├── users.controller.js
│   │   ├── leads.controller.js
│   │   ├── fields.controller.js
│   │   ├── ai.controller.js
│   │   ├── payments.controller.js
│   │   ├── webhooks.controller.js
│   │   └── settings.controller.js
│   ├── services/               # Lógica de negócio e acesso ao banco
│   │   ├── auth.service.js
│   │   ├── users.service.js
│   │   ├── leads.service.js
│   │   ├── ai.service.js       # Orquestra o chat com a IA + tool use
│   │   ├── ai-tools.service.js # Define e executa as tools da IA
│   │   ├── payments.service.js # Integração Asaas
│   │   ├── nfse.service.js     # Emissão automática NFS-e via NFE.io
│   │   └── settings.service.js # Configurações + campos customizáveis
│   ├── middlewares/
│   │   ├── auth.middleware.js       # Valida JWT
│   │   ├── client.middleware.js     # Carrega contexto do tenant
│   │   ├── error.middleware.js      # Handler global de erros
│   │   ├── validation.middleware.js # Express-validator helper
│   │   └── validators.js            # Regras de validação
│   ├── configs/
│   │   ├── db.config.js        # Pool mysql2 + helpers query/transaction
│   │   └── init.sql            # Schema inicial do banco (executado pelo Docker)
│   ├── .env.example
│   ├── package.json
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── api.ts              # ÚNICO arquivo de chamadas à API — mapeia TODAS as rotas
│   │   ├── main.tsx
│   │   ├── App.tsx             # Roteamento SPA
│   │   ├── context/
│   │   │   └── AuthContext.tsx
│   │   ├── components/
│   │   │   ├── Layout.tsx
│   │   │   └── ProtectedRoute.tsx
│   │   └── pages/
│   │       ├── Login.tsx / Register.tsx
│   │       ├── Chat.tsx        # Interface principal da IA
│   │       ├── Dashboard.tsx   # Painel com funil
│   │       ├── Leads.tsx       # Lista de leads
│   │       ├── LeadDetail.tsx  # Detalhe com notas e tarefas
│   │       ├── Tasks.tsx
│   │       └── Settings.tsx
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts          # Build aponta para ../backend/dist
│   └── tailwind.config.js
├── documentation/
│   ├── README.md               # Este arquivo
│   ├── arquitetura.md          # Decisões de arquitetura
│   ├── banco-de-dados.md       # Schema completo, tabelas e relacionamentos
│   ├── pagamentos.md           # Asaas + NFS-e
│   └── api-reference.md        # Referência de todas as rotas
└── docker-compose.yml
```

---

## Como rodar

### Desenvolvimento

```bash
# 1. Subir o banco de dados
cd foro_app
docker compose up db -d

# 2. Backend
cd backend
cp .env.example .env   # preencha as variáveis
npm install
npm run dev            # nodemon na porta 3040

# 3. Frontend (em outro terminal)
cd frontend
npm install
npm run dev            # Vite na porta 5173 (proxy /api → 3040)
```

### Produção (Docker)

```bash
# 1. Build do frontend (gera o dist/ que o backend serve)
cd foro_app/frontend
npm run build          # Saída: ../backend/dist/

# 2. Subir tudo com Docker Compose
cd ..
cp backend/.env.example backend/.env   # preencha
docker compose up -d --build

# A aplicação estará disponível em: http://sua-vps:3040
```

---

## Variáveis de ambiente obrigatórias

| Variável           | Descrição                                        |
|--------------------|--------------------------------------------------|
| `JWT_SECRET`       | Segredo para assinar tokens JWT (min. 32 chars)  |
| `DB_PASSWORD`      | Senha do MySQL                                   |
| `ANTHROPIC_API_KEY`| Chave da API da Anthropic (IA interna do CRM)    |
| `ASAAS_API_KEY`    | Chave do Asaas (pagamentos)                      |
| `NFEIO_API_KEY`    | Chave do NFE.io (notas fiscais)                  |
| `NFEIO_COMPANY_ID` | ID da empresa no NFE.io                          |

---

## Multi-tenancy

Cada conta (`account_id`) é completamente isolada. O `client.middleware.js` injeta o contexto do tenant em toda requisição autenticada. Nenhuma query é executada sem o filtro `account_id`.

---

## Princípio do `api.ts`

O arquivo `frontend/src/api.ts` enumera **todas** as chamadas à API, mapeando 1:1 com `routes/api.routes.js`. Se você precisar recriar o frontend do zero, todas as operações disponíveis estão documentadas nesse arquivo único.

Veja: [api-reference.md](./api-reference.md)

---

## Banco de dados

Schema único e versionado em `backend/configs/init.sql` — executado automaticamente pelo Docker. Ver documentação completa (tabelas, relacionamentos, seeds): [banco-de-dados.md](./banco-de-dados.md)
