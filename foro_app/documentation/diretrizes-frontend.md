# Diretrizes para o Frontend — Foro

Documento para quem for construir (ou continuar) o frontend do Foro. Reúne **o que precisa existir**, **as regras de negócio que não podem ser quebradas** e **como a API já funciona**, para que o frontend seja construído em cima do contrato real do backend — não precisa adivinhar nada, o backend já está pronto e documentado.

Leitura complementar (mesma pasta `documentation/`):
- [`api-reference.md`](./api-reference.md) — todas as rotas, com body/response de cada uma.
- [`banco-de-dados.md`](./banco-de-dados.md) — schema completo (útil para entender o que cada tela precisa exibir).
- [`plataforma-e-precificacao.md`](./plataforma-e-precificacao.md) — modelo de negócio (assinatura + créditos) e por que certas regras existem.
- [`pagamentos.md`](./pagamentos.md) — fluxo Asaas/NFE.io.

Há um frontend de referência já funcionando em `frontend/` (React + Vite + TypeScript + Tailwind + React Query), com `frontend/src/api.ts` mapeando **1:1** todas as rotas da API. Mesmo que o novo frontend use outra stack, vale usar esse arquivo como checklist de "quais chamadas existem e com qual formato" — é o contrato mais atualizado que existe.

---

## 1. Como a API funciona (resumo essencial)

- REST, tudo sob `/api`, JSON.
- Autenticação por **JWT no header** `Authorization: Bearer <token>`.
- **Dois tipos de token, que nunca se misturam**:
  - **Usuário de escritório (tenant)**: `{ id, account_id, role, email }` — obtido em `POST /auth/login`.
  - **Admin da plataforma (equipe da intellsn)**: `{ platform_admin_id, email, type: 'platform_admin' }` — obtido em `POST /auth/platform-login`. Esse admin **não pertence a nenhum escritório** e não deve usar as telas normais do produto — ele usa um painel separado (ver seção 4.9).
- Multi-tenant: tudo que o usuário logado vê é automaticamente filtrado pela conta dele no backend. O frontend não precisa (e não deve) mandar `account_id` em nenhuma chamada — ele vem do token.
- Erros sempre no formato:
  ```json
  { "error": "mensagem em português, pronta para mostrar ao usuário", "details": [...] }
  ```
  `details` só aparece em erro de validação (400). Para praticamente todo outro erro, **a mensagem em `error` já é a mensagem final para o usuário** — não precisa criar uma mensagem própria por cima na maioria dos casos.

### Códigos de erro que o frontend precisa tratar de forma específica

| Status | O que significa | O que o frontend deve fazer |
|--------|------------------|-------------------------------|
| `401`  | Token ausente/inválido/expirado | Deslogar e redirecionar para `/login`. |
| `403` com `code: "EMAIL_NOT_VERIFIED"` | E-mail ainda não confirmado | Redirecionar para a tela de verificação — **nunca** deixar passar para o resto do app. |
| `403` com `code: "TRIAL_EXPIRED"` | Trial de 14 dias acabou sem assinatura | O interceptor do `api.ts` leva para `/planos?expirado=1` (única tela útil, junto com pagamentos). |
| `402` com `code: "AI_CREDITS_EXHAUSTED"` | Créditos de IA da semana acabaram | O chat mostra a mensagem com a data de renovação (`renews_at`) e o CTA para upgrade. |
| `403` com `code: "FEATURE_LOCKED"` | Consultas ainda indisponíveis | Já tratado pelo selo "Em breve"; nada a fazer. |
| `402` | Créditos insuficientes (rotas `/lookup/*`) | Mostrar CTA para comprar créditos — nunca travar a tela sem explicar por quê. |
| `409` | Conflito (ex: e-mail já cadastrado) | Mostrar a mensagem de `error` direto no formulário. |
| `502` | Falha técnica num provedor pago (créditos já foram devolvidos automaticamente) | Mostrar a mensagem genérica que já vem em `error` ("Erro na requisição... contate o suporte"). **Nunca** mostrar um botão de "solicitar reembolso" aqui — ver seção 3. |

---

## 2. Fluxo de autenticação obrigatório

Este é o fluxo que **tem que** existir, nessa ordem, sem pular etapa:

```
Cadastro (POST /auth/register)
   │  cria account + user (status trialing, trial_ends_at = +14 dias)
   ▼
Login BLOQUEADO até confirmar e-mail
   │
   ├─▶ POST /auth/send-verification { channel: "email" }   → envia código de 6 dígitos
   └─▶ POST /auth/verify-code       { channel: "email", code }
   ▼
Login liberado (POST /auth/login)
   ▼
App normal
```

Pontos não-negociáveis:

1. **O celular (`phone`) é opcional no cadastro**, mas se o usuário informar, dá para verificar do mesmo jeito (`channel: "phone"`). A verificação de **e-mail é obrigatória**; a de celular não bloqueia o login hoje, mas a tela deve incentivar o usuário a confirmar os dois — é isso que viabiliza recuperação de senha segura depois.
2. Depois de logado mas **antes** de confirmar o e-mail, o único lugar que o usuário pode acessar é a tela de verificação (`GET /users/me` funciona nesse estado para mostrar o e-mail/celular cadastrados). Qualquer outra rota retorna `403 EMAIL_NOT_VERIFIED`.
3. **Esqueci minha senha**: `POST /auth/forgot-password` (envia link por e-mail) → `POST /auth/reset-password` com o token do link. Isso só funciona porque o e-mail foi verificado no cadastro — reforça por que o bloqueio do item 2 existe.
4. **Trial de 14 dias**: a conta nasce em `trialing`. Quando expira sem assinatura ativa, toda rota tenant retorna `403 TRIAL_EXPIRED`. O frontend precisa de uma tela/modal de bloqueio nesse estado, com CTA para assinar um plano (ver seção 4.7) — **não existe hoje no frontend de referência e precisa ser construído**.
5. **Refresh token**: `POST /auth/refresh-token`. Implementar renovação silenciosa antes do token expirar evita deslogar o usuário no meio do trabalho.

---

## 3. Regras de negócio que o frontend NÃO PODE violar

Essas regras vieram de decisão explícita do dono da plataforma. Não são sugestões de UX — são requisitos de produto:

- ❌ **Nunca** criar um botão, formulário ou fluxo de "solicitar reembolso de créditos" para o usuário final. Isso não existe em nenhuma rota da API de propósito. Se o usuário reclamar de uma cobrança, a orientação é "fale com o suporte" — fora do produto.
- ✅ Em qualquer erro de consulta paga (CPF/CNPJ/processual/resumo IA), mostrar **exatamente** a mensagem que vem em `error` (ela já foi escrita para ser lida pelo usuário final — algo como "Erro na requisição. Tente novamente em alguns minutos ou contate o suporte."). Nunca inventar uma mensagem diferente nem expor detalhe técnico.
- ✅ Antes de qualquer consulta de CPF/CNPJ, pode (e deve) validar o dígito verificador no próprio frontend para dar feedback instantâneo — mas isso é só uma otimização de UX, o backend já valida de novo e **não cobra crédito** se o documento for inválido.
- ✅ Sempre mostrar o saldo de créditos de forma visível perto de onde ele é gasto (ex: nas telas de consulta de CPF/CNPJ/processo), e tratar `402` como "sem saldo" com CTA de recarga — não como erro genérico.
- ✅ Login de administrador da plataforma (`/auth/platform-login`) é uma tela **separada** do login de escritório — nunca o mesmo formulário, nunca o mesmo contexto de sessão/token.
- ✅ Valores monetários sempre em `R$` com 2 casas decimais, formatados em `pt-BR`. Os valores que a API devolve em `*_cents` (créditos) estão em **centavos** — dividir por 100 antes de exibir.

---

## 4. Mapa de telas

### 4.1 Autenticação & onboarding (obrigatório)
- Cadastro (nome, e-mail, senha, celular opcional, nome do escritório).
- Login.
- Verificação de e-mail/celular (OTP de 6 dígitos, com reenvio e contagem de tentativas — máximo 5).
- Esqueci minha senha / redefinir senha.

### 4.2 Dashboard (obrigatório)
- Resumo do funil de leads por estágio (`GET /leads/funnel`).
- Tarefas pendentes em destaque (`GET /tasks?pending_only=true`).
- Indicador de status da conta (trial, dias restantes até `trial_ends_at`, ou plano ativo).

### 4.3 CRM — Leads (✅ implementado no estilo monday em `pages/Leads.tsx`)
- **Quadro** com um grupo recolhível por etapa (cor própria), células editáveis inline (clique → Enter/blur salva, Esc cancela), pílula de etapa que troca por seletor, linha "+ Adicionar lead" por grupo, excluir/abrir no hover; **Kanban** alternável (drag-and-drop move a etapa). Edição é otimista via React Query.
- Lista com busca, filtro por estágio e por responsável, paginação.
- Criar/editar lead, incluindo os **campos customizáveis** da conta (`GET /fields` define quais existem e o tipo de cada um — a tela de lead precisa renderizar esses campos dinamicamente, não só os campos fixos).
- Mover estágio (ex: drag-and-drop tipo kanban, ou um seletor — a API já suporta `PATCH /leads/:id/stage`).
- Arquivar / excluir (soft delete).
- Detalhe do lead: notas (texto + canal) e tarefas vinculadas.

### 4.4 Chat com IA (obrigatório — é a interface principal do produto)
- Interface de conversa (`POST /ai/message`), histórico de conversas, possibilidade de apagar uma conversa.
- ✅ Implementado: `ChatContext` (conversa persiste entre telas) + `ChatPanel` (tela cheia em `/chat` e painel lateral `AiDock` em todas as telas). Cada ação executada aparece como chip (`actions` da resposta), o CRM aberto é atualizado sozinho e o `CreditMeter` mostra o saldo semanal com a regra tokens → créditos.
- **Importante**: essa IA executa ações reais (criar lead, mover estágio, criar tarefa, etc.) via tool use — o chat não é "só um FAQ". O frontend deve deixar isso claro na UX (ex: confirmar visualmente quando a IA executou uma ação, não só respondeu texto).

### 4.5 Tarefas (obrigatório)
- Visão global de todas as tarefas da conta, com filtro de pendentes/concluídas.
- Concluir tarefa direto da lista.

### 4.6 Configurações da conta (obrigatório)
- Dados da conta e plano atual.
- Gestão de campos customizáveis do CRM (criar, editar, reordenar, desativar).
- Gestão de usuários do escritório (listar, criar, desativar — ações restritas a `role: admin`).
- Alterar senha / dados do próprio perfil.

### 4.7 Créditos (obrigatório — já existe um exemplo funcionando em `frontend/src/pages/Settings.tsx` + `creditsApi` em `api.ts`)
- Saldo atual, tabela de preços por serviço, extrato de movimentações.
- Recarga via PIX (QR Code + copia-e-cola) e via cartão.
- **Nenhum botão de reembolso** (ver seção 3).

### 4.8 Consultas pagas — CPF / CNPJ / processual + resumo por IA (✅ telas construídas, 🔒 travadas por flag de produto — ver seção 4.12)
- `pages/aplicativos/ConsultaCnpj.tsx` (`POST /lookup/cnpj`) e `ConsultaCpf.tsx` (`POST /lookup/cpf`), mostrando o custo em créditos (via `GET /credits/prices`) antes de confirmar.
- `ConsultaProcessual.tsx`: busca de processos por CPF/CNPJ (`POST /lookup/processo`) e, a partir do resultado, botão para gerar o resumo por IA (`POST /lookup/processo/summary`, passando o objeto retornado pela busca).
- Tratamento de erro via `err.response.data.error` (mensagem pronta da API), seguindo o padrão do resto do projeto — ainda não há tratamento visual **diferenciado** para `402`/`502` (hoje cai no mesmo bloco de erro genérico); isso é o que falta antes de destravar essas telas, ver seção 7.
- Enquanto nenhum provedor externo estiver contratado, essas rotas respondem com dado **mock** (tem um campo `_mock: true`/`aviso` no retorno) — ainda não há aviso visual de "dados de exemplo" nas telas novas.

### 4.9 Pagamentos / Assinatura (✅ tela de planos em `pages/Plans.tsx`, rota `/planos`; histórico de pagamentos e NFS-e ainda pendentes)
- Tela de planos (`GET /settings/plan` para o atual; `GET /plans` para os disponíveis).
- Assinar/trocar de plano (`POST /payments/subscription`), com PIX ou cartão.
- Histórico de pagamentos (`GET /payments`) e acesso à NFS-e de cada pagamento (`GET /payments/:id/nfse`).
- Essa tela é o que resolve o bloqueio de `TRIAL_EXPIRED` citado na seção 2 — o modal de trial expirado deve linkar direto para aqui.

### 4.10 Painel administrativo da plataforma (✅ implementado em `frontend/src/pages/admin/`)
Produto separado dentro do mesmo build — login próprio (`/admin/login`, `POST /auth/platform-login`), contexto de auth separado (`AdminAuthContext.tsx`, chaves de `localStorage` próprias), nunca compartilha sessão/token com o app do tenant. Visual também deliberadamente distinto (ver seção 6) pra deixar claro que é backoffice, não um módulo do produto. Telas:
- `AdminAccounts.tsx` — lista de contas com status, plano, contagem de usuários/leads.
- `AdminAccountDetail.tsx` — detalhe da conta: usuários, pagamentos, saldo e extrato de créditos, **toggles de módulo** (seção 4.11) e o formulário de ajuste manual de créditos (`amount_cents` + `note` obrigatória — único lugar do sistema onde isso acontece).
- `AdminCreditsOverview.tsx` — visão agregada de créditos de todos os tenants.
- `AdminEducationTrilhas.tsx` / `AdminEducationTrilhaDetail.tsx` — CMS do módulo Educação (seção 4.11).

### 4.11 Módulos e Educação (✅ implementado)
- **Toggle de módulos**: `GET /modules` traz quais módulos (`crm`, `pesquisa_cpf_cnpj`, `pesquisa_processual`, `educacao`) estão ativos pra conta logada — `Layout.tsx` usa isso pra esconder itens de menu desativados. Se o usuário acessar uma rota de um módulo desativado diretamente (ou por link antigo), a API responde `403 { code: 'MODULE_DISABLED' }` e o interceptor do Axios (`api.ts`) já redireciona pra `/modulo-desativado`, uma tela amigável — **nunca deixe essa resposta quebrar a tela sem tratamento**, esse é o padrão a seguir pra qualquer nova rota gateada por módulo.
- **Educação**: `Education.tsx` (grade de trilhas com progresso) → `TrilhaDetail.tsx` (player embutido — Vimeo/YouTube via `iframe`, ou link direto — e marcação de aula concluída). Conteúdo não é por conta: é criado pela intellsn no CMS do painel admin e visível pra todo tenant com o módulo ativo.

### 4.12 Ecossistema — navegação em "Aplicativos" / "Inteligência" (✅ implementado) e flag de "em breve" por recurso
A ideia de produto é um ecossistema de serviços vinculados ao CRM, crescendo aos poucos. Isso virou duas coisas concretas no frontend:

- **Agrupamento de menu** (`Layout.tsx`, arrays `NAV_TOP`/`NAV_SECTIONS`/`NAV_BOTTOM`): IA/Leads/Painel/Tarefas ficam soltos no topo (são o core, não "um app"); **Aplicativos** reúne as ferramentas utilitárias avulsas (Pesquisa inteligente, Consulta CNPJ/CPF/processual); **Inteligência** reúne tudo que gira em torno do conteúdo educativo (Educação, Provas de conceito, Desafios semanais, Comunidade). Cada seção só aparece se tiver pelo menos um item visível depois do filtro de módulo.
- **`config/featureFlags.ts` (`LOCKED_FEATURES`)**: flag de **estágio de produto**, diferente do toggle de módulo por conta (seção 4.11). Uma tela pode já existir e já falar com a API real, mas ainda estar marcada como "em breve" pra **todo mundo**, até o negócio decidir lançar (ex: preço definido, provedor contratado). `components/ComingSoon.tsx` é o selo reutilizável — recebe a tela real como `children` e desenha um cartão de cadeado por cima, com a tela borrada ao fundo. Lançar um recurso é só virar a flag pra `false`, sem mexer em backend.
  - Hoje só os 4 apps de consulta paga (`pesquisa-inteligente`, `consulta-cnpj`, `consulta-cpf`, `consulta-processual`) nascem travados — o negócio ainda não decidiu lançar as consultas. Provas de conceito, Desafios semanais e Comunidade foram implementados **sem** essa trava (ver seção 4.13), porque o pedido do dono do produto foi lançar esses direto.
- **`pages/aplicativos/PesquisaInteligente.tsx`**: ponto de entrada único pra consulta — o usuário cola um CPF ou CNPJ, o frontend detecta o tipo pela quantidade de dígitos (11 → CPF, 14 → CNPJ) e dispara a consulta cadastral **e** a busca de processos vinculados em paralelo, com o mesmo botão de resumo por IA das outras telas. Não existe rota nova no backend pra isso — é só uma composição das rotas de `/lookup/*` que já existem.
- **Animações**: `tailwind.config.js` ganhou utilities (`animate-fade-in`, `animate-scale-in`, `animate-pulse-glow`, `animate-shimmer`) usadas no selo "Em breve", nos cards de resultado das consultas e numa transição sutil de troca de rota (`Layout.tsx` remonta o `<Outlet/>` com `key={pathname}`). Propositalmente discretas e via CSS puro (sem framer-motion) pra não pesar o bundle nem destoar do tom institucional.

### 4.13 Provas de conceito, Desafios semanais e Comunidade (✅ implementado)
Fecha o ciclo de engajamento do "ecossistema": ver conteúdo em Educação → testar → ganhar pontos → compartilhar com o escritório. Cada um é seu próprio módulo (`provas_conceito`, `desafios_semanais`, `comunidade`), desativável por conta como qualquer outro — ver [api-reference.md](./api-reference.md) pras rotas.

- **Provas de conceito**: `pages/inteligencia/ProvasDeConceito.tsx` lista todas as provas disponíveis (`GET /education/quizzes`), agrupadas por trilha, com o melhor resultado do usuário. `QuizTake.tsx` (rota `/provas-de-conceito/:aulaId`) é a tela de fazer a prova — múltipla escolha, resultado com nota/aprovação/pontos ganhos, "tentar de novo". `TrilhaDetail.tsx` também ganhou um botão "Fazer prova de conceito" por aula, quando ela tem uma. Pontos só contam na primeira vez que o usuário passa — isso é regra de **backend** (`quizzes.service.js::submitAttempt`), o frontend só exibe o resultado que vem da API.
- **Desafios semanais**: `pages/inteligencia/DesafiosSemanais.tsx` lista os desafios publicados com um botão "Marcar como concluído" — **auto-declarado**, sem upload de evidência nem verificação (decisão deliberada de produto, não limitação técnica). Idempotente: clicar de novo num já concluído não duplica pontos.
- **Comunidade**: `pages/inteligencia/Comunidade.tsx` tem duas partes lado a lado — um feed de posts (só da própria conta, nunca de outra) com campo pra postar mensagem livre, e um ranking de pontos entre escritórios (**esse sim é cross-tenant**, com a linha da própria conta destacada mesmo se estiver fora do top 10). Ao passar numa prova ou concluir um desafio, um post de "conquista" é gerado automaticamente nesse feed — isso é feito no **backend** (`community.service.js::createAchievementPost`, chamado por `quizzes.service.js` e `challenges.service.js`), o frontend só exibe.
- **CMS no painel admin**: `AdminQuizDetail.tsx` (criar/editar quiz + perguntas de uma aula, acessível a partir de `AdminEducationTrilhaDetail.tsx`), `AdminChallenges.tsx` (CRUD de desafios) e `AdminCommunity.tsx` (moderação — lista posts de **todas** as contas com opção de remover, já que o feed normal do tenant é isolado por conta).

---

## 5. Padrões de UX recomendados

- **Loading/empty/error state em toda tela que busca dados** — o frontend de referência já segue esse padrão (ver qualquer página em `frontend/src/pages/`), mantenha.
- **Confirmação antes de ações destrutivas** (excluir lead, desativar usuário, excluir nota).
- **Pt-BR em tudo**: datas (`toLocaleString('pt-BR')`), moeda (`toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })`), textos de erro (a API já devolve em português).
- **Responsivo** — muitos advogados vão abrir isso no celular entre audiências.
- **Nunca travar a navegação silenciosamente**: todo redirecionamento forçado (401 → login, EMAIL_NOT_VERIFIED → verificação, TRIAL_EXPIRED → bloqueio) deve vir acompanhado de uma explicação visível na tela de destino, não só o redirect.

---

## 6. Convenções técnicas (se for continuar/estender o stack atual)

O frontend de referência usa:
- **React 18 + Vite + TypeScript**, build com `tsc && vite build` → saída em `../backend/dist` (o backend serve o frontend compilado, não há servidor de frontend separado em produção).
- **React Query** (`@tanstack/react-query`) para toda chamada de API — cache, refetch, estados de loading/error já vêm de fábrica.
- **Tailwind CSS** para estilo, classes utilitárias próprias como `.card`, `.btn-primary`, `.input` (ver `index.css`/`tailwind.config.js`). Paleta institucional (`brand` = navy, `accent` = dourado/bronze) e raios de borda reduzidos — deliberado, pra ler como plataforma jurídica/corporativa e não como app de consumidor. Se for criar componentes novos, use os tokens `brand-*`/`accent-*` em vez de cores soltas, e a serifada (`font-serif`/`.logo-wordmark`) só no logotipo/títulos de destaque, nunca na UI densa.
- **`src/api.ts` como ponto único de chamadas** — cada função mapeia 1:1 para uma rota do backend, com os tipos TypeScript das respostas. Se for continuar nessa stack, **todo novo endpoint usado precisa ser adicionado aqui antes de ser consumido pelas páginas** — é o padrão do projeto inteiro, mantém o frontend inteiro recriável a partir de um único arquivo.
- Token JWT salvo em `localStorage` (`foro_token`), injetado automaticamente via interceptor do Axios; interceptor de resposta já trata `401` e `EMAIL_NOT_VERIFIED` globalmente — reaproveitar esse padrão evita duplicar lógica de auth em cada tela.

Se a decisão for trocar de stack (Next.js, outra lib de estado, etc.), o único contrato que **precisa** ser respeitado é a API REST documentada em [`api-reference.md`](./api-reference.md) — o resto é livre.

---

## 7. Checklist antes de considerar o frontend "pronto"

- [x] Login bloqueado até e-mail verificado, com tela de verificação funcional (reenvio + 6 dígitos).
- [x] Esqueci minha senha funcionando de ponta a ponta.
- [ ] Bloqueio visível e com CTA quando `TRIAL_EXPIRED` (ainda falta — depende da tela de assinatura abaixo).
- [x] CRM completo: leads, campos customizáveis dinâmicos, notas, tarefas.
- [x] Chat com IA mostrando quando uma ação real foi executada (não só texto).
- [x] Carteira de créditos: saldo, preços, recarga via PIX, extrato — **sem botão de reembolso**.
- [x] Telas de consulta paga (CPF/CNPJ/processual + Pesquisa inteligente + resumo IA) construídas e já atrás do selo "Em breve" (`config/featureFlags.ts`) — **falta** tratamento visual diferenciado pra `402`/`502` (seção 3) antes de destravar pra valer.
- [ ] Tela de assinatura/planos e histórico de pagamentos com acesso à NFS-e. **Ainda não construído.**
- [x] Painel administrativo separado, com login próprio, incluindo a tela de ajuste manual de créditos.
- [x] Toggle de módulos (CRM/pesquisa/educação) por conta, só pelo admin da plataforma, com tela de "módulo desativado" pro tenant.
- [x] Módulo Educação: trilhas/aulas em vídeo + CMS no painel admin.
- [x] Navegação reorganizada em Aplicativos/Inteligência, com flag de estágio de produto (`LOCKED_FEATURES`) separada do toggle de módulo por conta.
- [x] **Provas de conceito**: quiz por aula, com CMS no admin, pontuação só na primeira aprovação.
- [x] **Desafios semanais**: CMS no admin, conclusão auto-declarada, pontuação.
- [x] **Comunidade**: feed isolado por conta + ranking de pontos entre escritórios (cross-tenant, por decisão explícita) + moderação no admin.
- [x] Toda mensagem de erro mostrada ao usuário vem do campo `error` da API, sem reescrever o texto.


## Telas jurídicas

- **Processos** (`/processos`, `/processos/:id`): lista com status, validação do número CNJ, tribunal identificado, link do processo (manual ou sugerido para TJSP), andamentos, prazos e eventos.
- **Agenda** (`/agenda`): calendário mensal e lista; reuniões com link de videoconferência, audiências e perícias.
- **Planos** (`/planos`): planos, cotas semanais e assinatura (PIX/cartão).
