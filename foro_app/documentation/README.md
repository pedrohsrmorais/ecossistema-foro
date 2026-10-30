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
| Pagamentos  | Stripe (assinatura, só cartão)          |
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
│   │   ├── settings.controller.js
│   │   ├── admin.controller.js     # Painel administrativo (equipe intellsn)
│   │   ├── credits.controller.js   # Carteira de créditos pré-pagos
│   │   ├── lookup.controller.js    # Consultas pagas (CPF/CNPJ/processual + resumo IA)
│   │   ├── quizzes.controller.js   # Provas de conceito (tenant) + CMS (admin)
│   │   ├── challenges.controller.js # Desafios semanais (tenant) + CMS (admin)
│   │   └── community.controller.js  # Comunidade: feed por conta + ranking cross-tenant + moderação (admin)
│   ├── services/               # Lógica de negócio e acesso ao banco
│   │   ├── auth.service.js
│   │   ├── users.service.js
│   │   ├── leads.service.js
│   │   ├── ai.service.js       # Orquestra o chat com a IA + tool use
│   │   ├── ai-tools.service.js # Define e executa as tools da IA
│   │   ├── payments.service.js # Stripe (webhook) + consulta de faturas
│   │   ├── nfse.service.js     # Emissão automática NFS-e via NFE.io
│   │   ├── settings.service.js # Configurações + campos customizáveis
│   │   ├── admin.service.js        # Operações cross-tenant do painel administrativo
│   │   ├── credits.service.js      # Ledger/carteira de créditos (débito, reembolso, ajuste manual)
│   │   ├── external-lookup.service.js # Wrapper único: debita → chama provedor → reembolsa se falhar
│   │   ├── cnpj.service.js / cpf.service.js / processo.service.js # Consultas pagas por provedor externo
│   │   ├── modules.service.js      # Catálogo de módulos + estado (ativo/inativo) por conta
│   │   ├── education.service.js    # Trilhas/aulas (tenant) + CMS (admin)
│   │   ├── quizzes.service.js      # Quiz por aula, pontuação só na 1ª aprovação
│   │   ├── challenges.service.js   # Desafios semanais, conclusão auto-declarada
│   │   └── community.service.js    # Feed por conta (nunca cross-tenant) + ranking de pontos (cross-tenant)
│   ├── middlewares/
│   │   ├── auth.middleware.js       # Valida JWT
│   │   ├── client.middleware.js     # Carrega contexto do tenant
│   │   ├── error.middleware.js      # Handler global de erros
│   │   ├── modules.middleware.js    # requireModule('crm') — bloqueia rota se módulo desativado
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
│   │   │   ├── AuthContext.tsx       # Sessão do tenant (escritório)
│   │   │   └── AdminAuthContext.tsx  # Sessão do admin da plataforma — totalmente separada
│   │   ├── config/
│   │   │   └── featureFlags.ts         # LOCKED_FEATURES — "em breve" por recurso, independente do toggle de módulo
│   │   ├── components/
│   │   │   ├── Layout.tsx              # Sidebar do app do tenant — nav em Aplicativos/Inteligência, filtrada por módulo ativo
│   │   │   ├── AdminLayout.tsx         # Sidebar do painel administrativo
│   │   │   ├── ComingSoon.tsx          # Selo "Em breve" reutilizável (ver featureFlags.ts)
│   │   │   ├── ProtectedRoute.tsx / AdminProtectedRoute.tsx
│   │   │   └── RequireVerified.tsx
│   │   └── pages/
│   │       ├── Login.tsx / Register.tsx
│   │       ├── Chat.tsx        # Interface principal da IA
│   │       ├── Dashboard.tsx   # Painel com funil
│   │       ├── Leads.tsx       # Lista de leads
│   │       ├── LeadDetail.tsx  # Detalhe com notas e tarefas
│   │       ├── Tasks.tsx
│   │       ├── Settings.tsx
│   │       ├── Education.tsx / TrilhaDetail.tsx   # Módulo Educação (tenant)
│   │       ├── ModuloDesativado.tsx                # Tela ao cair num módulo desativado
│   │       ├── aplicativos/    # Consultas pagas — construídas, travadas por LOCKED_FEATURES
│   │       │   ├── PesquisaInteligente.tsx   # Entrada única — detecta CPF/CNPJ e busca tudo
│   │       │   ├── ConsultaCnpj.tsx / ConsultaCpf.tsx
│   │       │   └── ConsultaProcessual.tsx    # + resumo por IA
│   │       ├── inteligencia/   # Fecha o ciclo: conteúdo → prova → pontos → comunidade
│   │       │   ├── ProvasDeConceito.tsx      # Lista de provas disponíveis + melhor resultado
│   │       │   ├── QuizTake.tsx              # Fazer uma prova (/provas-de-conceito/:aulaId)
│   │       │   ├── DesafiosSemanais.tsx      # Lista + "marcar como concluído" (auto-declarado)
│   │       │   └── Comunidade.tsx            # Feed por conta + ranking entre escritórios
│   │       └── admin/   # Painel administrativo — login e sessão à parte do app do tenant
│   │           ├── AdminLogin.tsx
│   │           ├── AdminAccounts.tsx / AdminAccountDetail.tsx
│   │           ├── AdminCreditsOverview.tsx
│   │           ├── AdminEducationTrilhas.tsx / AdminEducationTrilhaDetail.tsx  # CMS de Educação
│   │           ├── AdminQuizDetail.tsx       # CMS de Provas de conceito (quiz de uma aula)
│   │           ├── AdminChallenges.tsx       # CMS de Desafios semanais
│   │           └── AdminCommunity.tsx        # Moderação do feed de Comunidade (todas as contas)
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts          # Build aponta para ../backend/dist
│   └── tailwind.config.js
├── documentation/
│   ├── README.md               # Este arquivo
│   ├── arquitetura.md          # Decisões de arquitetura
│   ├── banco-de-dados.md       # Schema completo, tabelas e relacionamentos
│   ├── pagamentos.md           # Stripe + NFS-e
│   ├── mercado-requisitos.md   # pesquisa de mercado jurídico e Must-Have
│   ├── api-reference.md        # Referência de todas as rotas
│   ├── plataforma-e-precificacao.md # Requisitos, diferenciais, APIs avaliadas e precificação (planos + créditos)
│   └── diretrizes-frontend.md  # O que precisa existir no frontend, regras de negócio e UX obrigatórias
├── Dockerfile                  # Imagem única: build do frontend + API
├── docker-compose.yml          # MySQL + app (docker compose up -d --build)
└── .env.example                # Variáveis lidas pelo compose
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

### Tudo em Docker (um comando)

```bash
cd foro_app
cp .env.example .env            # preencha os OBRIGATÓRIOS: JWT_SECRET, DB_PASSWORD, DB_ROOT_PASSWORD, FRONTEND_URL
                                # (local: NODE_ENV=development e FRONTEND_URL=http://localhost:3040)
docker compose up -d --build    # MySQL 8 + API + frontend (build multi-etapas no Dockerfile)

# Aplicação: http://127.0.0.1:3040   ·   Health: http://127.0.0.1:3040/health
# O schema base (init.sql) é aplicado na 1ª subida; mudanças posteriores vêm de backend/migrations/ e rodam sozinhas no boot.
# O MySQL não é publicado no host. Produção (nginx + HTTPS + backup): ver deploy.md
# Recriar do zero (apaga os dados):  docker compose down -v
```

O `Dockerfile` (na raiz de `foro_app/`) compila o frontend e embute o resultado na imagem da API — não é preciso rodar `npm run build` antes. O MySQL sobe com fuso de Brasília (`--default-time-zone=-03:00`), igual ao do pool da API.

---

## Variáveis de ambiente obrigatórias

| Variável           | Descrição                                        |
|--------------------|--------------------------------------------------|
| `JWT_SECRET`       | Segredo para assinar tokens JWT (mín. 32 chars; a API recusa iniciar em produção com valor fraco)  |
| `DB_PASSWORD`, `DB_ROOT_PASSWORD` | Senhas do MySQL (sem padrão; a API recusa a senha padrão do repo em produção) |
| `FRONTEND_URL`     | URL pública do app (links dos e-mails e CORS)    |
| `RESEND_API_KEY`   | Envio dos e-mails de confirmação/convite (sem ele ninguém confirma a conta em produção) |
| `ANTHROPIC_API_KEY`| Chave da API da Anthropic (IA interna do CRM)    |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Chave secreta e segredo de assinatura do webhook do Stripe |
| `NFEIO_API_KEY`    | Chave do NFE.io (notas fiscais)                  |
| `NFEIO_COMPANY_ID` | ID da empresa no NFE.io                          |

### Variáveis opcionais — consultas pagas (créditos)

Sem provedor configurado, cada serviço roda em **modo mock** (sem custo, sem chamar nada externo) — permite testar todo o fluxo de créditos antes de contratar qualquer API. Ver [plataforma-e-precificacao.md](./plataforma-e-precificacao.md#4-apis-externas--avaliadas-e-recomendadas) para comparação de provedores.

| Variável                     | Descrição                              |
|-------------------------------|-------------------------------------------|
| `CNPJ_PROVIDER_BASE_URL/API_KEY`    | Provedor de consulta de CNPJ        |
| `CPF_PROVIDER_BASE_URL/API_KEY`     | Provedor de consulta de CPF         |
| `PROCESS_PROVIDER_BASE_URL/API_KEY` | Provedor de consulta processual     |

Estas chaves pertencem à **conta da intellsn** (plataforma), nunca ao tenant — o modelo de negócio centraliza a compra das APIs externas numa única conta paga pelo dono da plataforma (ver [plataforma-e-precificacao.md](./plataforma-e-precificacao.md#52-créditos-pré-pagos-consultas-de-terceiros)).

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
