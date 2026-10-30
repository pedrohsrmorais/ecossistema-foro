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

## 6.1 Modelos do escritório (feitos pelos próprios usuários)

Além dos modelos-base do Foro (arquivo) e dos da VPS, **cada escritório (conta) tem a sua biblioteca**, visível só para ele (`office_templates`). Tela: **Documentos → Modelos do escritório**.

- **Quem cria:** administradores sempre; usuários comuns só se o admin marcar a permissão *Criar e editar modelos* (Configurações → Equipe → Permissões). Quem não tem a permissão **usa** os modelos, mas não cria. Usuário comum só edita/exclui os que ele criou; só o admin marca **revisado** (e qualquer alteração de texto remove a marca).
- **Importar peça pronta (pré-molde):** cole o texto ou envie `.docx/.txt/.md`. A IA mantém o texto original, troca dados do caso por campos (`{{cliente.qualificacao}}`…) e marca com `[[IA: …]]` só o que depende do caso. Salvaguardas: (1) a IA é proibida de reescrever/acrescentar fundamentos; (2) o sistema compara o resultado com o original e **lista as frases que a IA alterou** para você conferir antes de salvar; (3) campos fora da lista viram `[PREENCHER]`; (4) os dispositivos que **o seu próprio texto já cita** viram a base legal liberada para a IA naquele modelo — nada além disso.
- **Edição manual:** editor com botões para inserir campos automáticos e trechos de IA, e aviso de campos desconhecidos.
- Limites: 60 mil caracteres por modelo, 200 modelos por escritório, importação até 20 mil caracteres (arquivo ≤ 3 MB).
- Documentos já criados guardam o próprio texto; apagar/alterar o modelo não os afeta.

### Modelos oficiais da AGU (licitações e contratos)

A AGU publica modelos de editais, TR, contratos, contratação direta e listas de verificação em `.docx` (portal: <https://www.gov.br/compras/pt-br/nllc/modelos-de-licitacoes-e-contratos>). **O Foro não traz esses textos embutidos**: o ambiente de desenvolvimento não consegue baixar os `.docx` e não é correto reproduzi-los de memória. Para usá-los: baixe o arquivo da AGU e **importe em Modelos do escritório** (ou coloque na pasta `modelos/` da VPS). Depois de conferir, o admin marca como *revisado*. Para petições, não existe biblioteca oficial única — use as peças aprovadas do próprio escritório.

## 6.2 Escritório, administrador principal e permissões

- Escritório = **conta**. Todos os dados (clientes, processos, documentos, modelos, equipe, créditos) são isolados por conta. Quem se cadastra cria o escritório e vira o **administrador principal** (`accounts.owner_user_id`), que **não pode ser rebaixado nem desativado**; novos usuários entram por convite do admin.
- Permissões por usuário comum (`users.permissions`, mescladas ao salvar): `templates_manage` (padrão **não**), `ai_drafts` (padrão sim — gerar rascunho com IA, gasta créditos) e `delete_records` (padrão sim — excluir processos/documentos). Administradores sempre podem tudo. Bloqueio devolve `403 PERMISSION_DENIED` com a permissão faltante; a tela esconde/desabilita as ações.
- **Ainda não feito (próxima rodada):** painel do admin com consumo de IA por usuário e tempo de uso na plataforma; mais permissões (ex.: ver só os próprios processos).

## 7. IA do chat (insights técnicos)

O assistente passou a poder analisar processos: `get_case` devolve um contexto compacto (dados, campos da área e o que falta, partes, equipe, andamentos, prazos, documentos, orientação da área e **`legal_refs_allowed`**). O prompt exige: basear-se só nesses dados; citar apenas as referências permitidas; tratar prazos calculados como **estimativa** a confirmar no tribunal; não escrever peças inteiras no chat (criar o documento a partir de um modelo). Novas tools: `add_party`, `list_document_templates`, `create_document`; `create_case`/`update_case` aceitam `area_key`, `comarca`, `vara`, `magistrate`, `details`.

## 8. Limitações conhecidas

- Modelos e referências legais curadas **não foram revisados por advogado** (ver §5); a lista `refs` por área é pequena de propósito.
- A trava só reconhece citações no formato textual usual; paráfrases sem número de artigo não são detectáveis. **A revisão humana continua obrigatória.**
- Não há upload de arquivos/provas, movimentações automáticas (DataJud), publicações/intimações, honorários/despesas nem histórico de comunicação — ver `mercado-requisitos.md`.
- Os modelos embutidos e da VPS são lidos na subida do app (reiniciar para recarregar); os do escritório valem na hora.
