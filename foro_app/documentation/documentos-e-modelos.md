# Áreas do direito, kanban e Documentos

Esta rodada adicionou ao Foro: **núcleo jurídico** (kanban editável por área, partes, equipe responsável, campos específicos por área) e o **módulo Documentos** (modelos prontos + redação assistida por IA com trava anti-alucinação).

## 1. Áreas

`geral`, `civel`, `trabalhista`, `criminal`, `contratacoes_publicas`, `consultivo` — definidas em `backend/configs/legal-areas.js`. Cada área tem:

| Item | Para quê |
|---|---|
| `stages` | Etapas padrão do kanban (copiadas para cada conta e **editáveis** por ela) |
| `fields` | Campos técnicos do processo (ex.: trabalhista → rito, data de admissão, verbas; contratações → modalidade, previsto no PCA, valor estimado) gravados em `cases.details` (JSON) |
| `refs` | Lista **curada** de dispositivos legais que a IA pode citar nessa área |
| `guidance` | Orientação técnica enviada à IA ao analisar um processo |

Para acrescentar um campo ou uma etapa padrão, edite esse arquivo (não precisa migração: `details` é JSON; etapas novas valem para contas novas — contas existentes usam "Restaurar padrão" ou criam a etapa na tela).

## 2. Kanban editável

- Tela **Processos → Quadro**: uma aba por área; as colunas são as etapas da área; arrastar o card muda a etapa (`PUT /cases/:id/stage`).
- **Editar etapas** (somente administrador): renomear, trocar cor, reordenar, criar, excluir (com destino dos processos) e marcar **etapa final**. Entrar numa etapa final marca o processo como `encerrado`; sair dela reabre (`ativo`).
- Trocar a **área** de um processo o leva para a 1ª etapa da nova área; campos que não existem na nova área são descartados.

## 3. Partes e responsáveis

- `case_parties`: nome, papel (cliente, autor, réu, empregador, empregado, investigado, vítima, órgão público, fornecedor…), CPF/CNPJ **validado**, e-mail, telefone, endereço, nacionalidade, estado civil, profissão, **responsável no escritório** (`responsible_user_id`) e vínculo opcional com um lead.
- `case_members`: quem do escritório responde pelo processo (`responsavel` / `colaborador`). O primeiro `responsavel` é espelhado em `cases.responsible_user_id`. **Os alertas de prazo e audiência (sino e e-mail diário) passam a considerar toda a equipe do processo.**
- A **qualificação** da parte para as peças (`case-parties.service.qualify`) é montada **sem IA**; o que faltar vira `[PREENCHER: …]`.
- OAB do advogado: Configurações → *Meu perfil profissional* (`users.oab_number`); assina as peças.

## 4. Documentos — como funciona (anti-alucinação)

```
modelo (.md)  ──►  {{placeholders}} preenchidos pelo sistema (sem IA)
                     └─ dado ausente → [PREENCHER: …]
              ──►  [[IA: instrução]] preenchidos pela IA (uma chamada, JSON por trecho)
                     └─ guard: citação fora da lista → [CONFERIR: citação não verificada]
              ──►  advogado edita/revisa  ──►  Word (.docx) ou PDF (impressão)
```

Regras fixas do sistema:

1. A **estrutura** da peça vem do modelo; a IA não a inventa.
2. A IA só recebe os dados do processo (partes sem CPF, andamentos recentes, campos da área) e as **referências permitidas** (`legal_basis` do modelo + `refs` da área). O *system prompt* proíbe fatos, datas, valores e precedentes não fornecidos e manda usar `[PREENCHER]` na falta de dado.
3. Depois da resposta, `document-guard.js` varre o texto: artigos (`CPC art. 319`, `art. 319 do CPC`, `Lei 14.133/2021, art. 18`), súmulas, temas, REsp/RE/ADI/HC/OJ… **que não estejam na lista permitida recebem `[CONFERIR]`** (nada é apagado). Súmulas/jurisprudência nunca são "permitidas" por padrão.
4. Documentos nascem `rascunho`; o status (`rascunho → revisado → final`) é decisão humana. O painel mostra pendências, se o modelo foi revisado e a base legal permitida.
5. Cada edição/geração grava uma **versão** (`document_versions`), com restauração.
6. A geração consome **créditos de IA** (mesma regra do chat: `(input + cache + 5×output) ÷ 2500`), limitada a 4.000 tokens por chamada; sem trechos pendentes não há chamada nem custo.

## 5. Modelos embutidos (14)

| Área | Modelos |
|---|---|
| Cível | Petição inicial (CPC art. 319), Contestação |
| Trabalhista | Reclamação trabalhista (CLT art. 840 §1º), Contestação |
| Criminal | Resposta à acusação (CPP 396-A), Liberdade provisória / revogação de preventiva |
| Contratações públicas | DFD, **ETP** (art. 18 §1º, I–XIII da Lei 14.133/2021), **TR** (art. 6º XXIII, a–j), Matriz de riscos |
| Consultivo | Parecer jurídico, Notificação extrajudicial |
| Geral | Contrato de honorários, Procuração *ad judicia* |

> **Importante — status dos modelos embutidos:** todos estão `reviewed: false`. Foram montados a partir da **estrutura exigida em lei** (e, para o ETP, conferida com um modelo público de universidade federal). **Não foram copiados de modelos oficiais** (não foi possível abrir Planalto/AGU/tribunais a partir do ambiente de desenvolvimento) e **não passaram por revisão de advogado**. O app mostra "modelo-base ainda não revisado" no editor. Substitua-os pelos modelos aceitos que o escritório já usa (seção 6) e/ou marque `reviewed: true` após revisão.

## 6. Colocando seus modelos na VPS

1. No servidor, na pasta do projeto, use `modelos/` (já existe; é montada em `/app/modelos` somente leitura — `MODELOS_DIR` no `.env` muda o caminho).
2. Crie `modelos/<area>/<chave>.md`, onde `<area>` ∈ `geral | civel | trabalhista | criminal | contratacoes_publicas | consultivo`.
3. Se a `key` for igual à de um modelo embutido, **o seu substitui o embutido**; se for nova, aparece como novo modelo ("do seu escritório").
4. `docker compose restart app` (os modelos são lidos na subida). Arquivos inválidos são **ignorados** e o motivo aparece no log (`[templates] ignorado — …`).

### Formato do arquivo

```markdown
---
key: etp_prefeitura_x            # a-z 0-9 _ (2–60)
title: ETP — padrão da Prefeitura X
area: contratacoes_publicas
version: 3
reviewed: true                   # você, advogado, aprovou
description: Texto curto exibido na galeria
source: De onde veio / quem aprovou
legal_basis:                     # ÚNICOS dispositivos que a IA pode citar neste documento
  - Lei 14.133/2021 art. 18, §1º
---
# TÍTULO

{{cliente.qualificacao}} ... {{processo.numero}} ... {{detalhes.valor_estimado}}

## 1. Necessidade
[[IA: Descreva a necessidade usando só os dados fornecidos.]]
```

**Placeholders** (`{{...}}`, ausente → `[PREENCHER: …]`): `processo.{numero,titulo,tribunal,comarca,vara,magistrado,area,fase,valor_causa}`, `cliente.{nome,qualificacao,documento}`, `parte_contraria.{nome,qualificacao}`, `detalhes.<chave do campo da área>`, `advogado.{nome,oab}`, `escritorio`, `cidade` (= comarca), `data.{hoje,extenso}`.

**Trechos de IA**: `[[IA: instrução]]` (pode conter `[PREENCHER]` dentro). Quanto mais específica a instrução, menos a IA inventa. Um modelo **sem** trechos `[[IA…]]` é preenchido 100% sem IA (ideal para procuração, contrato, etc.).

**Dica:** para peças que o tribunal já aceita "como está", deixe o texto fixo no modelo e use `[[IA]]` só onde o caso concreto exige redação (fatos, pedidos).

## 7. IA do chat (insights técnicos)

O assistente passou a poder analisar processos: `get_case` devolve um contexto compacto (dados, campos da área e o que falta, partes, equipe, andamentos, prazos, documentos, orientação da área e **`legal_refs_allowed`**). O prompt exige: basear-se só nesses dados; citar apenas as referências permitidas; tratar prazos calculados como **estimativa** a confirmar no tribunal; não escrever peças inteiras no chat (criar o documento a partir de um modelo). Novas tools: `add_party`, `list_document_templates`, `create_document`; `create_case`/`update_case` aceitam `area_key`, `comarca`, `vara`, `magistrate`, `details`.

## 8. Limitações conhecidas

- Modelos e referências legais curadas **não foram revisados por advogado** (ver §5); a lista `refs` por área é pequena de propósito.
- A trava só reconhece citações no formato textual usual; paráfrases sem número de artigo não são detectáveis. **A revisão humana continua obrigatória.**
- Não há upload de arquivos/provas, movimentações automáticas (DataJud), publicações/intimações, honorários/despesas nem histórico de comunicação — ver `mercado-requisitos.md`.
- Os modelos embutidos são lidos na subida do app (reiniciar para recarregar).
