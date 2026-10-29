# Foro — Requisitos da Plataforma, Diferenciais e Precificação

Este documento descreve o Foro como produto: o que ele exige para funcionar, o que oferece, os diferenciais em relação a alternativas do mercado jurídico, quais APIs externas são usadas (ou avaliadas), e como a precificação funciona — assinatura mensal **e** créditos pré-pagos para serviços de consulta de terceiros.

---

## 1. Requisitos da plataforma

### 1.1 Infraestrutura

| Item                  | Requisito                                                        |
|-----------------------|--------------------------------------------------------------------|
| Servidor              | 1 VPS com Docker + Docker Compose (testado com 1 vCPU / 2GB RAM para começar) |
| Banco de dados        | MySQL 8, provisionado automaticamente pelo `init.sql` no 1º boot do container |
| Domínio + HTTPS       | Recomendado um reverse proxy (Nginx/Caddy/Traefik) na frente da porta 3040 para TLS |
| E-mail transacional   | Conta Resend (ou SMTP compatível) — obrigatório para verificação de cadastro e reset de senha |
| Pagamentos            | Conta Asaas (PIX + cartão de crédito + assinatura recorrente)      |
| Nota fiscal           | Conta NFE.io vinculada ao CNPJ da intellsn, para emissão automática de NFS-e |
| IA                    | Chave da API Anthropic (Claude) — usada no chat do CRM e no resumo de processos |

### 1.2 Requisitos de conta/acesso (regra de negócio)

- **Cadastro → verificação → acesso.** O usuário cria a conta, mas o **login é bloqueado** até confirmar e-mail (celular é opcional, mas também pode ser verificado). Isso é proposital: sem e-mail/celular confirmado não há como recuperar senha de forma segura depois.
- **Trial de 14 dias** a partir do cadastro (`accounts.trial_ends_at`). Expirado sem assinatura ativa, o acesso é bloqueado com `403 TRIAL_EXPIRED` até o escritório assinar um plano.
- **Multi-tenancy real**: cada escritório (`account_id`) só vê os próprios dados. Nenhuma query do sistema roda sem esse filtro.
- **Dois níveis de autenticação, sem mistura**: usuários de escritório (`authenticate` + `loadClientContext`) e administradores da plataforma (`authenticatePlatform`), que não pertencem a nenhum tenant e administram todas as contas.

---

## 2. O que a plataforma oferece

### 2.1 CRM com IA como interface principal

O diferencial central do Foro **não é um CRM com um chatbot anexado** — é um CRM onde a IA é a própria interface de operação. O advogado ou atendente escreve em linguagem natural ("move o lead do João pra 'proposta enviada' e marca uma tarefa pra sexta") e a IA, via *tool use* da Anthropic, executa a ação real no banco (criar lead, mover estágio, criar nota, criar tarefa, consultar o funil) — sem o usuário precisar navegar em telas e formulários para operações do dia a dia.

### 2.2 Campos customizáveis (EAV)

Cada escritório define seus próprios campos de lead (ex: "área do direito", "valor da causa", "urgência") sem alteração de schema — modelo Entity-Attribute-Value. Esses campos também podem ser configurados para serem **coletados pela própria IA** durante a conversa, não só preenchidos manualmente.

### 2.3 Cobrança e nota fiscal automatizadas

- PIX, cartão de crédito e assinatura recorrente via Asaas.
- **Emissão automática de NFS-e** disparada pelo webhook de confirmação de pagamento — o escritório (e a intellsn, no caso dos créditos) não precisa emitir nota manualmente.

### 2.4 Consultas de dados jurídicos e cadastrais (créditos)

- Consulta de CNPJ (dados cadastrais).
- Consulta de CPF (dados básicos, conforme provedor contratado).
- Consulta processual por CPF/CNPJ (processos vinculados ao documento).
- **Resumo de processo por IA**: a partir do resultado da consulta processual, a Claude gera um resumo em linguagem simples (o que é o processo, última movimentação relevante, se há prazo/ação pendente aparente).

Todos os quatro itens acima são **serviços pagos em créditos**, detalhados na seção 5.

### 2.5 Painel administrativo da plataforma

Visão cross-tenant exclusiva da equipe intellsn: listar/detalhar contas, alterar status (suspender/reativar/cancelar), visão agregada de consumo de créditos por serviço, e o único ponto do sistema que pode ajustar créditos manualmente (ver seção 5.4).

---

## 3. Diferenciais

| Diferencial                                   | Por quê importa                                                                 |
|------------------------------------------------|-----------------------------------------------------------------------------------|
| **IA como interface, não só como chatbot**     | A maioria dos "CRMs com IA" no mercado jurídico brasileiro usa IA só para resumo/triagem de texto. Aqui a IA executa ações reais via tool use — reduz fricção operacional de verdade. |
| **Créditos centralizados, risco zero de estouro de cartão** | O dono da plataforma contrata e paga as APIs externas com uma única conta própria, recarregada manualmente. O tenant nunca toca o provedor terceiro — só compra crédito interno. Elimina o cenário de um bug gerar cobrança descontrolada no cartão da intellsn (ver seção 5). |
| **Sem fluxo de reembolso self-service**         | Decisão deliberada: evita disputa/chargeback descontrolado dentro do produto. Qualquer reembolso é decisão manual e pessoal do dono da plataforma — mantém controle financeiro total sobre o que sai de créditos vendidos. |
| **Validação local antes de gastar crédito**     | CPF/CNPJ passam por validação de dígito verificador **gratuita e local** antes de qualquer chamada paga — documento malformado nunca consome crédito. |
| **Schema único e documentado (`init.sql`)**      | Toda a estrutura do banco está em um único arquivo, comentado, versionável e reconstituível do zero — sem dependência de múltiplas migrations dispersas enquanto o produto está pré-produção. |
| **Multi-tenant desde o dia 1**                   | Diferente de ferramentas internas adaptadas, o isolamento por `account_id` já nasceu como requisito de arquitetura, não como retrofit. |

---

## 4. APIs externas — avaliadas e recomendadas

Pesquisa feita para decidir quais provedores usar nos serviços de CPF/CNPJ/consulta processual. Nenhum destes está contratado por padrão — o sistema roda em **modo mock** (dado de exemplo, sem custo) até as variáveis de ambiente do provedor escolhido serem preenchidas (`CNPJ_PROVIDER_*`, `CPF_PROVIDER_*`, `PROCESS_PROVIDER_*`).

### 4.1 Consulta de CNPJ

| Provedor      | Observação                                                                      |
|---------------|-----------------------------------------------------------------------------------|
| **cnpj.ws** (API pública) | Gratuita, mas limitada a ~3 requisições/minuto por IP em alguns planos — viável para baixo volume, mas precisa ser medida sob carga real antes de depender dela como única fonte. |
| APIs pagas de CNPJ (ex: Dabra Data, API PJ, OpenCNPJ) | Preço e rate limit variam bastante; vale testar o limite real antes de assinar, não só o anunciado. |

**Recomendação**: começar com um provedor gratuito/barato para CNPJ (baixo custo por consulta, comparado a CPF e processual), validar o rate limit sob o volume esperado do escritório, e só migrar para um provedor pago se o volume justificar.

### 4.2 Consulta de CPF

| Provedor        | Observação                                                                   |
|------------------|---------------------------------------------------------------------------------|
| Serpro / Receita Federal (canal oficial) | Requer certificado e-CNPJ e contrato direto — burocrático para o estágio atual, mas é a fonte mais confiável/oficial. |
| APIs de terceiros (ex: CPF.CNPJ, Dabra Data) | Mais simples de integrar, mas repassam dados de fontes variadas — qualidade e cobertura precisam ser validadas antes de produção. |

**Recomendação**: por ser dado sensível (LGPD), priorizar um provedor com política clara de uso de dados, e manter o mascaramento de CPF nos logs internos (já implementado em `cpf.service.js`) independentemente do provedor escolhido.

### 4.3 Consulta processual

| Provedor                  | Observação                                                                         |
|----------------------------|----------------------------------------------------------------------------------------|
| **DataJud (CNJ)**          | Gratuito e oficial, mas é só metadados de processos — **não permite busca por CPF/CNPJ diretamente**, só por número de processo/tribunal. Não resolve o caso de uso principal (buscar processos de um documento). |
| **TrackJud / Vigilant**    | ~R$ 0,10/crédito de consulta — mais barato entre os avaliados, mas **sem cobertura de TRTs** (Justiça do Trabalho) em alguns planos — verificar cobertura antes de contratar se o escritório atua na área trabalhista. |
| **Escavador**               | O produto voltado a advogados (site/app) é consumidor final, não API; preço de API não é público — exige contato comercial para avaliar custo real. |
| **JUDIT**                   | Robusto, mas caro (~R$ 1.000+/mês nos planos avaliados) — só compensa com volume alto e recorrente. |

**Recomendação**: **TrackJud/Vigilant** como ponto de partida pelo custo por consulta mais baixo entre os provedores com busca real por CPF/CNPJ, aceitando a limitação de cobertura trabalhista até haver volume que justifique um provedor mais completo (Escavador ou JUDIT).

### 4.4 Resumo de processo

Não é uma API de dados — é a própria Anthropic (Claude), reaproveitando a chave já usada no chat interno do CRM. Cobrado como serviço de preço fixo em créditos (não por token), porque o tenant não deve se preocupar com variação de custo por tamanho do processo.

---

## 5. Modelos de precificação

A Foro combina **dois modelos** de cobrança, que não se misturam:

### 5.1 Assinatura mensal + recursos que renovam por SEMANA

O preço é mensal, mas os recursos de uso (créditos de IA e consultas) **renovam toda semana**, em janelas de 7 dias ancoradas no início do trial/assinatura (`accounts.plan_started_at`). O que sobra **não acumula**. Quantidades definidas na tabela `plans` (editáveis sem deploy):

| Plano | Mensal | Créditos IA / semana | Consultas / semana | Usuários | Leads | Margem a 100% de uso | Margem a 50% de uso |
|-------|--------|----------------------|--------------------|----------|-------|----------------------|---------------------|
| Teste grátis (14 dias) | R$ 0 | 50 | 2 | 1 | 100 | custo ≈ R$ 5 por trial | – |
| Starter  | R$ 97  | 150 | 5  | 1  | 500      | 53,6% | 69,5% |
| Pro      | R$ 197 | 300 | 10 | 5  | ilimitado | 56,9% | 72,6% |
| Business | R$ 397 | 700 | 20 | 15 | ilimitado | 55,7% | 72,7% |

Premissas da margem: 52/12 semanas por mês; custo por crédito R$ 0,02586 (Sonnet 4.6 com prompt caching, câmbio 5,34); consulta média R$ 0,647 (mix CNPJ/CPF/processual, Direct Data); imposto 6% (estimativa), cartão Asaas 2,99% + R$ 0,49 (estimativa), R$ 5/conta/mês de outros custos. **Regra de projeto: margem a 100% de uso nunca abaixo de 50%.** Planilha: `precificacao_foro_semanal.xlsx`.

**Free trial:** 14 dias com o plano `trial` (o menor de todos). Depois, a conta fica bloqueada (`403 TRIAL_EXPIRED`) e só consegue ver planos, assinar e sair — assinar é obrigatório para continuar.

**Consultas (CPF/CNPJ/processual):** a cota semanal já existe no catálogo, mas as consultas ficam **indisponíveis nesta fase** (backend: `FEATURE_LOOKUPS_ENABLED=false` → `403 FEATURE_LOCKED`; frontend: `LOCKED_FEATURES`). Provedor previsto: Direct Data.

#### Regra entre tokens de IA e créditos de IA

```
créditos = (tokens de entrada totais + 5 × tokens de saída) ÷ 2.500
tokens de entrada totais = input_tokens + cache_creation_input_tokens + cache_read_input_tokens
```
- O 5 é a razão de preço saída/entrada do Claude Sonnet 4.6 ($15 ÷ $3 por 1M tokens). 1 crédito = 2.500 tokens de entrada ou 500 de saída.
- O cache de prompt **não** reduz os créditos cobrados do cliente; a economia vira margem.
- Um turno de chat soma todas as chamadas ao modelo do turno (loop de ferramentas). Uma resposta curta custa ~1,6 crédito; com uma ação no CRM ~3,3; com três ações ~8,9.
- Antes de cada turno o backend confere o saldo da semana (`402 AI_CREDITS_EXHAUSTED` se zerado); depois do turno grava em `ai_usage` os tokens, os créditos e o custo real em USD. O último turno pode ultrapassar levemente o saldo.
- Implementação única: `backend/services/ai-credits.service.js`.

### 5.2 Créditos pré-pagos (consultas de terceiros)

Este é o ponto central pedido pelo dono da plataforma, e o motivo de existir uma carteira de créditos em vez de cobrança direta por uso:

> **Modelo de negócio**: a intellsn contrata e paga as APIs externas com uma **conta própria e centralizada** — por exemplo, aporta R$ 200 num provedor, e quando o saldo nesse provedor cai para ~R$ 100, aporta mais R$ 200, e assim por diante. Os escritórios (tenants) **nunca** pagam ou se cadastram diretamente no provedor externo: eles compram créditos na própria Foro, via Asaas (PIX ou cartão), e cada consulta debita dessa carteira interna.

Por que isso resolve o medo original (bug estourando o cartão da intellsn num provedor pago): o saldo disponível para gasto nos provedores é **sempre limitado ao que já foi efetivamente pago por um tenant e creditado na carteira dele**. Não existe caminho no código onde uma consulta é disparada sem débito prévio confirmado (ver `external-lookup.service.js`), então o pior cenário de bug é "a consulta falha e nada é cobrado" — nunca "o provedor é chamado sem limite".

#### Preços atuais por serviço (tabela `service_prices`, editável sem deploy)

| Serviço                         | Preço cobrado do tenant | Custo estimado do provedor (referência interna) |
|----------------------------------|--------------------------|----------------------------------------------------|
| Consulta de CNPJ                 | R$ 0,50                  | ~R$ 0,00 (provedor gratuito, sujeito a mudança)     |
| Consulta de CPF                  | R$ 1,00                  | ~R$ 0,24                                             |
| Consulta processual               | R$ 1,00                  | ~R$ 0,10                                             |
| Resumo de processo por IA         | R$ 1,50                  | variável (tokens Claude; não há "provider_cost" fixo) |

A margem entre o preço cobrado e o custo estimado do provedor cobre a própria operação da plataforma (e o fato de que "não encontrado" também tem custo real, pois o provedor foi chamado mesmo sem retornar dado útil).

#### 5.3 O que acontece em caso de erro

- **Falha técnica do provedor** (timeout, 5xx, erro de rede): o crédito debitado é **devolvido automaticamente**, sem qualquer ação do usuário, e o tenant recebe apenas: *"Erro na requisição. Tente novamente em alguns minutos ou contate o suporte."* — nunca o erro técnico real.
- **"Não encontrado"** (documento válido, mas sem resultado no provedor): **não é erro** — o crédito é mantido, porque o provedor foi efetivamente chamado e isso tem custo real para a intellsn, independentemente do resultado.

#### 5.4 Política de reembolso — **deliberadamente sem self-service**

> Por decisão explícita do dono da plataforma: **não existe, em nenhum lugar do produto, uma forma do usuário final solicitar reembolso de créditos.** Quando o tenant compra crédito na Foro, o dinheiro já foi recebido pela intellsn. Qualquer pedido de reembolso por insatisfação (não por falha técnica) precisa ser resolvido **diretamente com a intellsn**, fora do produto.

O único mecanismo de reversão de créditos por decisão humana é administrativo:

```
PATCH /api/admin/accounts/:id/credits/adjust
Body: { amount_cents, note }
```

Exige autenticação de administrador de plataforma e uma nota obrigatória — toda reversão manual fica registrada no ledger (`credit_transactions`, tipo `adjustment`) com o id de qual admin aplicou. Isso é auditável, mas **não é autoatendimento**: o tenant não tem acesso a esse endpoint, e a interface do produto não expõe nenhum botão de "solicitar reembolso".

---

## 6. Resumo rápido (TL;DR)

1. Acesso exige cadastro + verificação de e-mail (celular opcional) antes de liberar login — essencial para recuperação de senha segura.
2. O CRM é cobrado por assinatura mensal (planos Starter/Pro).
3. Consultas de CPF/CNPJ/processual e resumo por IA são cobradas em **créditos pré-pagos**, comprados via PIX/cartão na própria Foro.
4. A intellsn paga os provedores externos com uma conta própria centralizada, recarregada manualmente — o tenant nunca é exposto a esse provedor, e o risco de estouro de cartão por bug é estruturalmente eliminado (o limite de gasto é sempre o saldo já pago).
5. Erros técnicos do provedor geram reembolso automático do crédito + mensagem genérica de suporte. **Não há reembolso solicitado pelo usuário** — qualquer exceção é tratada manualmente pela intellsn via painel administrativo.
