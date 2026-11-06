# Consultas CPF / CNPJ / Processos (Direct Data) e enriquecimento de listas

Fonte de dados: **Direct Data** (`https://apiv3.directd.com.br`). A conta (e o token) é da plataforma, nunca do escritório; o escritório paga em **créditos** da carteira (ver `plataforma-e-precificacao.md`).

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

## Preços (editáveis em `service_prices`)

`cpf_lookup` R$ 1,00 · `cnpj_lookup` R$ 0,50 · `process_lookup` R$ 3,00 (custo de referência 0,16 / 0,16 / 1,50). A migração 018 só ajusta `process_lookup` se ainda estiver no valor antigo (R$ 1,00).

## Regras de cobrança

- **Débito antes da chamada**, estorno automático em erro técnico (resposta genérica `502`).
- **CPF/CNPJ sem resultado (404)** → crédito devolvido ao escritório (`DIRECT_DATA_CHARGE_NOT_FOUND=true` muda isso).
- **Processos com 0 resultado** contam como consulta feita (cobra).
- **Cache por conta** em `lookup_cache` (30 dias): repetir a mesma consulta é grátis; `refresh: true` força nova consulta (cobra).
- Documento é validado (dígitos verificadores) antes de debitar. Log de uso guarda só o documento mascarado.

## Rotas (`/api/lookup/*`; exigem módulo `pesquisa_cpf_cnpj` e `FEATURE_LOOKUPS_ENABLED`)

| Rota | Descrição |
|---|---|
| `GET /lookup/status` | `{ configured, balance_cents, prices:{cpf,cnpj,processos}, cache_days }` |
| `POST /lookup/cpf` `{ cpf, refresh? }` | `{ data, meta:{ cached, fetched_at, price_cents, charged_cents, balance_cents, consulta_uid } }` |
| `POST /lookup/cnpj` `{ cnpj, refresh? }` | idem |
| `POST /lookup/processo` `{ documento, refresh? }` | processos por CPF ou CNPJ — **desligado** (403 `FEATURE_LOCKED`) |
| `POST /lookup/processo/summary` `{ processo }` | resumo por IA (cobrança própria) — **desligado** |
| `POST /lookup/:kind(cpf\|cnpj)/create-lead` `{ document, stage? }` | cria lead a partir da consulta **já salva no servidor** (não consulta nem cobra) — exige `create_leads` e módulo CRM |

Erros: `400 INVALID_DOCUMENT` · `402` créditos insuficientes · `404 LOOKUP_NOT_FOUND` · `404 LOOKUP_NOT_CACHED` (criar lead sem consultar antes) · `409 LEAD_EXISTS` (`lead_id`) · `422 LOOKUP_EMPTY` · `502` falha técnica (estornado) · `503 DIRECT_DATA_NOT_CONFIGURED`.

### Criar lead

Nome (CPF: nome; CNPJ: razão social), telefone (prefere WhatsApp > celular > primeiro), e-mail, CPF/CNPJ e origem `consulta`. Extras viram campos personalizados criados sozinhos: `empresa`, `cidade`, `uf`, `cep`, `endereco`, `telefone_2`, `email_2`; uma nota registra a origem (e os sócios no caso de CNPJ). Duplicidade só por documento.

## Enriquecer lista

Tela: **Pesquisa inteligente → Enriquecer lista** (também botão no CRM Comercial).

1. Baixar o modelo (`GET /lookup/enrich/template?format=xlsx|csv`: CPF/CNPJ, Nome, Telefone, E-mail; linhas começando com "(EXEMPLO)" são ignoradas). CPF e CNPJ podem estar misturados.
2. Enviar a planilha (`POST /lookup/enrich`, corpo = bytes). Nada é cobrado: o backend conta **linhas, inválidas, repetidas, já completas, já em cache (grátis) e consultas necessárias (CPF × CNPJ)** e devolve o orçamento (preço × quantidade, saldo, faltante). A coluna do documento é detectada (pode ser trocada) e o usuário marca o que quer preencher (telefones/e-mails por padrão; nome/endereço opcionais) via `POST /lookup/enrich/:id/analyze`.
3. `POST /lookup/enrich/:id/start { confirm_queries }` — exige o número exato de consultas mostrado (`409 QUOTE_CHANGED` se mudou; `402` se faltar saldo). Roda em segundo plano (4 consultas simultâneas, progresso salvo a cada 20 linhas). Se o servidor cair o lote vira `interrompida` e pode ser retomado sem pagar de novo (resultados e cache reaproveitados).
4. Resultado: `GET .../download?format=xlsx|csv` (colunas fixas + colunas originais extras; **só preenche o que estava em branco**; coluna "Situação da consulta") ou `POST .../to-import` — abre o assistente de importação do CRM já na escolha de colunas.

Limites: `MAX_ENRICH_ROWS` linhas; arquivos e resultados ficam **7 dias** (job de manutenção a cada 6 h); membros com visão "só os meus" só veem os próprios lotes.

## Tabelas (migração 018)

`lookup_cache` (account_id, kind, document, payload, consulta_uid, fetched_at; único por conta+kind+document) e `enrichment_jobs` (planilha, opções, análise, progresso, resultados).

## Pontos de atenção

- Confirmar no extrato da Direct Data se consulta sem resultado/0 processos é cobrada (hoje: CPF/CNPJ sem resultado são devolvidos ao escritório; processos vazios são cobrados).
- LGPD: usar só com finalidade legítima; as telas avisam e o uso fica registrado.
- Créditos ainda são adicionados pelo admin da plataforma (`PATCH /admin/accounts/:id/credits/adjust`); não há compra pelo escritório.
