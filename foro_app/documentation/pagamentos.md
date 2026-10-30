# Pagamentos — Stripe (assinatura, só cartão) + NFS-e (NFE.io)

> O Asaas foi **removido**. Não há mais Pix nem recarga de carteira: a cobrança é só a assinatura mensal por cartão, via Stripe.
> O trial de 14 dias é controlado pelo app (sem cartão); o Stripe só entra quando a pessoa assina.

## Visão geral do fluxo

```
Tela /planos → "Assinar Pro"
      │  POST /api/payments/checkout { plan: "pro" }          (só admin da conta)
      ▼
stripe.service.createCheckout()   → cria/reutiliza o Customer da conta, resolve o preço do plano,
      │                              abre uma Checkout Session (mode=subscription, só cartão, pt-BR)
      ▼
Navegador vai para a página do Stripe (o cartão NUNCA passa pelo nosso servidor)
      │  paga → volta para  /planos?checkout=ok
      ▼
Stripe ──webhook assinado──► POST /api/webhooks/stripe
      │   invoice.paid  →  ativa o plano, grava a fatura em `payments`, dispara a NFS-e
      ▼
/planos detecta (polling de até 40 s) e mostra "Assinatura ativada"
```

**Quem ativa o plano é sempre o webhook (`invoice.paid`)** — nunca a volta do navegador. `checkout.session.completed` só guarda os ids.

## Como o plano acha o preço no Stripe

Cada plano em `plans` tem `stripe_lookup_key` (padrão: `foro_starter_monthly_brl_v1`, `foro_pro_monthly_brl_v1`, `foro_business_monthly_brl_v1`, os mesmos da collection do Postman em `documentation/stripe/`). O backend busca o preço ativo por esse `lookup_key`. Opcionalmente `plans.stripe_price_id` (um `price_...`) tem prioridade.

**Trava de segurança:** antes de abrir o Checkout, confere que o preço no Stripe é **BRL, mensal e com o mesmo valor** do catálogo (`plans.price`). Se divergir, responde `503 PLAN_PRICE_MISMATCH` e não cobra. Preços do Stripe são imutáveis: para mudar um valor, crie `..._v2`, atualize `plans.stripe_lookup_key` e arquive o antigo.

## Configuração no Stripe (Dashboard)

1. **Webhook** (Developers → Webhooks → Add destination → "Your account" → payload "Snapshot"):
   - URL: `https://SEU_DOMINIO/api/webhooks/stripe`
   - Eventos — **exatamente estes 5**:
     `checkout.session.completed` · `invoice.paid` · `invoice.payment_failed` · `customer.subscription.updated` · `customer.subscription.deleted`
   - Copie o *Signing secret* (`whsec_...`) para `STRIPE_WEBHOOK_SECRET`.
2. **Portal do cliente** (Settings → Billing → Customer portal): ative e configure — permitir atualizar cartão, ver faturas, cancelar assinatura e **trocar de plano** (adicione os 3 preços do produto Foro).
3. **Chaves**: `STRIPE_SECRET_KEY` (`sk_test_...` no sandbox, `sk_live_...` em produção). Use uma *restricted key* em produção, com permissão de escrita só em Customers, Checkout Sessions, Customer portal e leitura de Prices.
4. Teste local: `stripe listen --forward-to localhost:3040/api/webhooks/stripe` (o CLI mostra o `whsec_` temporário).

Variáveis: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (ambas obrigatórias para cobrar; sem elas `/payments/checkout` responde `503 PAYMENTS_UNAVAILABLE`).

## O que cada evento faz

| Evento | Efeito |
|---|---|
| `checkout.session.completed` | Guarda `stripe_customer_id` / `stripe_subscription_id` na conta. **Não** ativa o plano. |
| `invoice.paid` | Ativa o plano (`plan_id`, `status='active'`), grava `current_period_end`, insere a fatura em `payments` (valor, link do recibo e PDF) e dispara a NFS-e. |
| `invoice.payment_failed` | `subscription_status='past_due'`. O acesso continua enquanto o Stripe retenta a cobrança; a tela de Planos avisa para atualizar o cartão. |
| `customer.subscription.updated` | Trocas pelo Portal (upgrade/downgrade) e cancelamento agendado (`cancel_at_period_end`). `canceled`/`unpaid` expiram a conta. |
| `customer.subscription.deleted` | Conta vira `expired` (CRM e IA bloqueados, exceto planos/faturas). Ignora assinaturas antigas que não são a vigente. |

Garantias: assinatura validada sobre o corpo bruto (`req.rawBody`); cada `evt_` é processado uma única vez (`stripe_events`); se o processamento falhar a API responde 500 e o Stripe reenvia; `payments.stripe_invoice_id` é único (uma linha por fatura).

**Janela semanal de créditos:** `plan_started_at` só reinicia na 1ª assinatura ou na reassinatura (conta que não estava `active`). Trocar de plano no meio do ciclo mantém a janela — senão dava para ganhar créditos alternando entre planos.

## Estados da conta (`accounts.status`)

| Status | Significado | Acesso |
|---|---|---|
| `trialing` | Teste grátis (14 dias) | CRM liberado até `trial_ends_at`, depois `403 TRIAL_EXPIRED` |
| `active` | Assinatura paga (inclui `past_due` durante as retentativas) | Liberado |
| `expired` | Assinatura terminou / não paga | `403 SUBSCRIPTION_EXPIRED`; só vê planos, faturas e portal |
| `suspended` / `cancelled` | Decisão manual da plataforma (admin) | Bloqueado |

## Endpoints

| Método | Rota | |
|---|---|---|
| POST | `/api/payments/checkout` `{ plan }` | admin → `{ url }` (Checkout do Stripe). `409 ALREADY_SUBSCRIBED` se já assina (use o portal) |
| POST | `/api/payments/portal` | admin → `{ url }` do Portal do Cliente |
| GET | `/api/payments` | faturas pagas (`hosted_invoice_url`, `invoice_pdf`) |
| GET | `/api/payments/:id` · `/:id/nfse` | detalhe / NFS-e |
| GET | `/api/settings/plan` | plano + `subscription { status, current_period_end, cancel_at_period_end, can_manage }` |
| POST | `/api/webhooks/stripe` | webhook (sem JWT; autenticado pela assinatura) |

Teste automatizado do fluxo completo (contra um Stripe simulado): ver `backend/` → scripts de teste descritos em `documentation/stripe/LEIA-ME.md`.

---

## NFE.io — NFS-e

### Configuração do município
| Campo       | Valor                                   |
|-------------|-----------------------------------------|
| Cidade      | Porto Alegre                            |
| Código IBGE | `4314902`                               |
| Regime      | Simples Nacional                        |
| Código ISS  | `01.07` (atividades jurídicas em geral) |
| Alíquota    | `2%`                                    |

### Variáveis de ambiente necessárias
```
NFEIO_API_KEY=sua_chave
NFEIO_COMPANY_ID=id_da_empresa_no_nfeio
NFEIO_ENVIRONMENT=Development  # ou Production
```

### Fluxo de emissão

1. Quando o Stripe confirma a fatura (`invoice.paid`, ver acima)
2. `nfse.service.js` cria um registro `pending` em `nfse_records`
3. Chama `POST /companies/{companyId}/serviceinvoices` no NFE.io
4. NFE.io retorna o `id` da nota (status assíncrono)
5. Webhook NFE.io confirma quando a nota é emitida

**Deduplicação**: antes de emitir, verifica se já existe um `nfse_records` para o `payment_id`. Nunca emite duas vezes.

### Webhook NFE.io

Configure no painel do NFE.io:
- URL: `https://sua-vps.com/api/webhooks/nfeio`

O webhook atualiza `nfse_records` com:
- `status`: `issued` / `error`
- `nfeio_id`: ID da nota no NFE.io
- `invoice_number`: número da NFS-e
- `series`: série da NFS-e
- `pdf_url`: link para baixar o PDF
- `xml_url`: link para baixar o XML

### Acessar NFS-e de um pagamento
```
GET /api/payments/:id/nfse

Response: {
  payment: { id, amount, status, ... },
  nfse: {
    status: "issued",
    invoice_number: "000001",
    pdf_url: "https://...",
    xml_url: "https://..."
  }
}
```

---

## Tabela de status

### Pagamentos (`payments.status`)
Só entram faturas **pagas**: `PAID`. (Estornos e disputas são tratados no painel do Stripe.)

### NFS-e (`nfse_records.status`)
| Status      | Descrição                             |
|-------------|---------------------------------------|
| `pending`   | Aguardando emissão                    |
| `processing`| Em processamento no NFE.io            |
| `issued`    | Nota emitida com sucesso              |
| `error`     | Falha na emissão (ver `error_msg`)    |
| `cancelled` | Nota cancelada                        |

---

## Notas de desenvolvimento

- O webhook do Stripe responde `200` só **depois** de processar (e `500` se falhar, para o Stripe reenviar).
- Para testar localmente, use o Stripe CLI (`stripe listen --forward-to localhost:3040/api/webhooks/stripe`).
- `STRIPE_API_BASE` existe só para testes automatizados (aponta o SDK para um Stripe simulado) — **não defina em produção**.
- Em Development do NFE.io, as notas são emitidas no ambiente de homologação.
