# Pagamentos e NFS-e

## Visão geral do fluxo

```
Usuário solicita pagamento (PIX / cartão / assinatura)
       │
       ▼
payments.service.js
  _getOrCreateAsaasCustomer()  ← cria cliente no Asaas se não existir
       │
       ▼
Asaas API  (cria cobrança)
       │
       ▼
Salva em payments (banco local)
       │
       ▼
[Usuário paga]
       │
       ▼
Webhook Asaas  →  POST /api/webhooks/asaas
       │
       ▼
paymentsService.handleAsaasWebhook()
  Atualiza status do pagamento
       │
  Se PAYMENT_CONFIRMED ou RECEIVED:
       │
       ▼
nfseService.emitNfse()   ← emissão automática e assíncrona
       │
       ▼
NFE.io API  →  NFS-e emitida
       │
       ▼
Webhook NFE.io  →  POST /api/webhooks/nfeio
  Atualiza nfse_records com número, série, PDF, XML
```

---

## Asaas

### Ambiente
- Sandbox: `https://sandbox.asaas.com/api/v3`
- Produção: `https://www.asaas.com/api/v3`
- Configurar `ASAAS_API_URL` no `.env` para alternar entre os ambientes.

### Modalidades de pagamento

#### PIX
```
POST /api/payments/pix
Body: {
  amount: 150.00,
  description: "Consulta inicial",
  dueDate: "2024-12-31"  // opcional, default hoje
}

Response: {
  payment: { id, status, amount, ... },
  pix: {
    encodedImage: "...",  // QR code base64
    payload: "00020126..."  // copia e cola
  }
}
```

#### Cartão de crédito
```
POST /api/payments/card
Body: {
  amount: 150.00,
  description: "Consulta inicial",
  card: {
    holderName: "NOME NO CARTÃO",
    number: "4111111111111111",
    expiryMonth: "12",
    expiryYear: "2025",
    ccv: "123"
  },
  holderInfo: {
    name: "Nome Completo",
    email: "email@exemplo.com",
    cpfCnpj: "12345678901",
    postalCode: "90000000",
    addressNumber: "100",
    phone: "51999999999"
  }
}
```

#### Assinatura mensal
```
POST /api/payments/subscription
Body: {
  plan: "starter"  // ou "pro"
}

Planos:
  starter: R$ 97/mês
  pro:     R$ 197/mês
```

### Webhook Asaas

Configure no painel do Asaas:
- URL: `https://sua-vps.com/api/webhooks/asaas`
- Eventos a monitorar: `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`

O endpoint responde `200` imediatamente e processa de forma assíncrona.

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

1. Quando o pagamento é confirmado no webhook do Asaas
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
| Status        | Descrição                           |
|---------------|-------------------------------------|
| `pending`     | Aguardando pagamento                |
| `confirmed`   | Pagamento confirmado                |
| `received`    | Pagamento recebido (liquidado)      |
| `overdue`     | Vencido                             |
| `refunded`    | Estornado                           |
| `deleted`     | Cancelado                           |

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

- O webhook do Asaas **não** espera processamento: responde `200 OK` imediatamente e processa em background com `.catch(console.error)`.
- Para testar localmente, use `ngrok` ou similar para expor a porta 3040 com HTTPS.
- Em sandbox do Asaas, simule pagamentos pelo painel web do Asaas Sandbox.
- Em Development do NFE.io, as notas são emitidas no ambiente de homologação.
