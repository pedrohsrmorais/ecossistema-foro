# Consultas CPF / CNPJ / Processos (Direct Data) e enriquecimento de listas

Fonte de dados: **Direct Data** (`https://apiv3.directd.com.br`). A conta (e o token) é da plataforma, nunca do escritório. CPF e CNPJ usam a **cota semanal de cada usuário** (ver abaixo); a carteira de créditos não é usada para eles.

## Configuração

No `.env` da raiz (VPS):

```
FEATURE_LOOKUPS_ENABLED=true
DIRECT_DATA_TOKEN=<token do painel Direct Data → Configurações → Integrações>
```

Depois: `cd ~/ecossistema-foro && git pull && cd foro_app && docker compose up -d --build` (a migração 018 roda sozinha).

**Busca de processos por CPF/CNPJ está desligada ("em breve")**: `FEATURE_PROCESS_LOOKUP_ENABLED=false` (padrão) faz `/lookup/processo` e `/lookup/processo/summary` responderem `403 FEATURE_LOCKED` sem cobrar nem chamar a Direct Data, e a tela mostra "Em breve" no lugar do botão (`LOCKED_FEATURES.consultaProcessos` no front). O código segue pronto; para religar basta `FEATURE_PROCESS_LOOKUP_ENABLED=true` e `consultaProcessos: false`. A precificação considera só CPF e CNPJ.

Opcionais: `DIRECT_DATA_BASE_URL`, `DIRECT_DATA_TIMEOUT_MS` (60000), `DIRECT_DATA_CHARGE_NOT_FOUND` (`false`), `LOOKUP_CACHE_DAYS` (30), `MAX_ENRICH_ROWS` (2000).

Sem `DIRECT_DATA_TOKEN` as rotas respondem `503 DIRECT_DATA_NOT_CONFIGURED` **antes** de debitar nada (não existe mais dado "mock").

## Endpoints usados na Direct Data

| Consulta | Endpoint | Custo p/ a plataforma |
|---|---|---|
| CPF — Cadastro Pessoa Física Básica | `GET /api/CadastroPessoaFisica?CPF=` | R$ 0,16 |
| CNPJ — Cadastro Pessoa Jurídica Básica | `GET /api/CadastroPessoaJuridica?CNPJ=` | R$ 0,16 |
| Processos Judiciais Simplificada | `GET /api/ProcessosJudiciaisSimplificada?Cpf=` ou `?Cnpj=` | R$ 1,50 |

Autenticação `Authorization: Bearer <token>`. Resposta `{ metaDados, retorno }`; o backend normaliza para snake_case (`services/direct-data.normalize.js`).

## Cota semanal (CPF + CNPJ)

- Por **usuário e escritório**, conforme o plano do usuário (`plans.lookups_week`): teste grátis 10, Starter 20, Pro 40, Business 60. Janela de 7 dias igual à dos créditos de IA (`ai-credits.service.getStatus`); não acumula.
- Uma linha em `lookup_usage` por consulta que **conta**: foi à Direct Data e trouxe resultado. **Não contam**: cache (30 dias, por conta), documento sem resultado (`DIRECT_DATA_CHARGE_NOT_FOUND=true` passa a contar), erro técnico, documento inválido. "Atualizar" (`refresh: true`) conta.
- Esgotou → `429 LOOKUP_QUOTA_EXHAUSTED` (mensagem com a data de renovação e o plano Consulting; `quota` no corpo). Usuário sem assento numa conta paga → `429 LOOKUP_NO_PLAN`. Consultas em cache e "Criar lead" continuam funcionando.
- `lookup-quota.service.js`: `reserve()` grava antes de chamar a fonte e confere o total (seguro contra abas/cliques simultâneos); `release()` desfaz quando a consulta não conta.
- Enriquecer lista: o orçamento mostra consultas necessárias × disponíveis; acima do disponível o lote não inicia (`429`). Se a cota acabar no meio (outra aba), o lote para como `interrompida` e pode ser retomado quando renovar.
- Processos (desligado) seguiria na carteira (`service_prices.process_lookup`).

## Rotas (`/api/lookup/*`; exigem módulo `pesquisa_cpf_cnpj` e `FEATURE_LOOKUPS_ENABLED`)

| Rota | Descrição |
|---|---|
| `GET /lookup/status` | `{ configured, quota:{ limit, used, remaining, renews_at, has_plan }, cache_days }` |
| `POST /lookup/cpf` `{ cpf, refresh? }` | `{ data, meta:{ cached, counted, fetched_at, quota, consulta_uid } }` |
| `POST /lookup/cnpj` `{ cnpj, refresh? }` | idem |
| `POST /lookup/processo` `{ documento, refresh? }` | processos por CPF ou CNPJ — **desligado** (403 `FEATURE_LOCKED`) |
| `POST /lookup/processo/summary` `{ processo }` | resumo por IA (cobrança própria) — **desligado** |
| `POST /lookup/:kind(cpf\|cnpj)/create-lead` `{ document, stage? }` | cria lead a partir da consulta **já salva no servidor** (não consulta nem cobra) — exige `create_leads` e módulo CRM |

Erros: `400 INVALID_DOCUMENT` · `429 LOOKUP_QUOTA_EXHAUSTED` / `LOOKUP_NO_PLAN` · `404 LOOKUP_NOT_FOUND` · `404 LOOKUP_NOT_CACHED` (criar lead sem consultar antes) · `409 LEAD_EXISTS` (`lead_id`) · `422 LOOKUP_EMPTY` · `502` falha técnica (estornado) · `503 DIRECT_DATA_NOT_CONFIGURED`.

### Criar lead

Nome (CPF: nome; CNPJ: razão social), telefone (prefere WhatsApp > celular > primeiro), e-mail, CPF/CNPJ e origem `consulta`. Extras viram campos personalizados criados sozinhos: `empresa`, `cidade`, `uf`, `cep`, `endereco`, `telefone_2`, `email_2`; uma nota registra a origem (e os sócios no caso de CNPJ). Duplicidade só por documento.

## Enriquecer lista

Tela: **Pesquisa inteligente → Enriquecer lista** (também botão no CRM Comercial).

1. Baixar o modelo (`GET /lookup/enrich/template?format=xlsx|csv`: CPF/CNPJ, Nome, Telefone, E-mail; linhas começando com "(EXEMPLO)" são ignoradas). CPF e CNPJ podem estar misturados.
2. Enviar a planilha (`POST /lookup/enrich`, corpo = bytes). Nada é consumido: o backend conta **linhas, inválidas, repetidas, já completas, já em cache (não contam) e consultas necessárias (CPF × CNPJ)** e devolve `quote: { needed, limit, used, remaining, renews_at, shortfall }`. A coluna do documento é detectada (pode ser trocada) e o usuário marca o que quer preencher (telefones/e-mails por padrão; nome/endereço opcionais) via `POST /lookup/enrich/:id/analyze`.
3. `POST /lookup/enrich/:id/start { confirm_queries }` — exige o número exato de consultas mostrado (`409 QUOTE_CHANGED` se mudou; `429 LOOKUP_QUOTA_EXHAUSTED` se passar do que resta na cota). Roda em segundo plano (4 consultas simultâneas, progresso salvo a cada 20 linhas). Se o servidor cair o lote vira `interrompida` e pode ser retomado sem pagar de novo (resultados e cache reaproveitados).
4. Resultado: `GET .../download?format=xlsx|csv` (colunas fixas + colunas originais extras; **só preenche o que estava em branco**; coluna "Situação da consulta") ou `POST .../to-import` — abre o assistente de importação do CRM já na escolha de colunas.

Limites: `MAX_ENRICH_ROWS` linhas; arquivos e resultados ficam **7 dias** (job de manutenção a cada 6 h); membros com visão "só os meus" só veem os próprios lotes.

## Tabelas (migração 018)

`lookup_cache` (account_id, kind, document, payload, consulta_uid, fetched_at; único por conta+kind+document) e `enrichment_jobs` (planilha, opções, análise, progresso, resultados).

## Pontos de atenção

- Confirmar no extrato da Direct Data se consulta sem resultado/0 processos é cobrada (hoje: CPF/CNPJ sem resultado são devolvidos ao escritório; processos vazios são cobrados).
- LGPD: usar só com finalidade legítima; as telas avisam e o uso fica registrado.
- Pendência: compra de créditos pelo escritório (consultas extras/produtos avulsos) — adiada para evitar reembolsos. Hoje, mais consultas = plano Consulting.
