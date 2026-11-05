# Importação e exportação de listas — CRM Comercial

Importa planilhas **Excel (.xlsx) ou CSV** para o CRM e exporta os leads no mesmo formato ("Modelo Foro"), de modo que o que sai pode voltar a entrar. **Não há enriquecimento** (Assertiva ou similar): é uma etapa posterior; o CPF/CNPJ guardado em `leads.document` é a chave que ele vai usar.

## Fluxo (tela `CRM Comercial → Importar`)

1. **Arquivo** — arrastar/escolher a planilha; baixar os modelos; ver e desfazer importações anteriores.
2. **Colunas** — o Foro detecta o modelo e sugere o destino de cada coluna (pelo título e, se o título não ajudar, pelo conteúdo). A pessoa pode trocar modelo, aba, linha dos títulos e o destino de cada coluna. Opções: etapa, responsável (admin), duplicados, origem, DDD padrão, ajustar nomes em CAIXA ALTA.
3. **Prévia** — nada é gravado. Mostra novos / a completar / duplicados / recusadas, avisos por linha, campos personalizados que serão criados e o limite do plano.
4. **Resultado** — resumo, download das linhas com problema (CSV) e **Desfazer importação**.

O arquivo fica no servidor apenas como rascunho (`lead_imports`, status `analisada`) até a conclusão; rascunhos com mais de 24 h são apagados. Ao concluir, arquivo e linhas lidas são apagados e fica só o resumo + as linhas com problema.

## Modelos

| Chave | Quando usar |
|-------|-------------|
| `foro` | O formato da exportação do Foro (reconhecido por ≥ 9 títulos iguais). |
| `lista_cadastral` | Lista de cadastro/mailing: nome, CPF/CNPJ, telefones, e-mails, endereço. |
| `contatos` | Exportação de agenda (Google Contatos, Outlook, celular): nome, sobrenome, telefones/e-mails numerados. |
| `texto_livre` | Uma coluna com tudo junto ("Maria – (51) 99999-0000 – maria@x.com – CPF …"); extraída por regex. |
| `generico` | Qualquer outra planilha; o mapeamento é feito pelo título/conteúdo. |

Cada modelo tem planilha de exemplo (`.xlsx` com aba "Como preencher", ou `.csv`). Linhas começando com `(EXEMPLO)` são ignoradas.

Destinos possíveis de uma coluna: nome, sobrenome, CPF/CNPJ, telefone, e-mail, empresa, endereço, cidade, UF, CEP, etapa, origem, responsável, observações, **texto livre (extrair por regex)**, **campo personalizado** (a coluna vira um campo da conta) e ignorar.

## Normalização (`utils/lead-normalize.js`)

- **CPF/CNPJ**: só dígitos com dígito verificador válido; células numéricas do Excel recebem zeros à esquerda (≤ 11 → CPF, 12–14 → CNPJ). Inválido é descartado e anotado no lead.
- **Telefone**: DDD válido; remove +55/0 inicial; celular antigo de 8 dígitos ganha o 9; DDD padrão para números sem DDD; internacional (`+`) é mantido; várias linhas na mesma célula (`; / |`, " e ").
- **E-mail**: regex; UF por sigla ou nome; CEP com 8 dígitos; nomes TODOS EM MAIÚSCULAS/minúsculas viram "Nome Próprio" (partículas da/de/do preservadas); "Razão social" vira nome quando não há outro nome.
- **Texto livre**: extrai e-mails, CNPJ/CPF, CEP, telefones; o que sobra (sem rótulos como "tel:", "cpf") é o nome.
- Valores inválidos nunca derrubam a linha: viram aviso e entram nas **Observações** do lead. Linha sem nome, telefone, e-mail ou CPF/CNPJ é recusada.

## Duplicados

Chaves, nesta ordem: CPF/CNPJ → e-mail → telefone (sem chave: nome idêntico). Modos: `skip` (padrão, não mexe no existente), `merge` (preenche só campos vazios, nunca sobrescreve, registra nota) e `create` (cria mesmo assim). Repetidos dentro do próprio arquivo são pulados, salvo `create`.

## Limites

| Item | Padrão | Ajuste |
|------|--------|--------|
| Tamanho do arquivo | 5 MB | `MAX_IMPORT_MB` |
| Linhas por importação | 5.000 | `MAX_IMPORT_ROWS` |
| Colunas / tamanho de célula | 60 / 2.000 caracteres | fixo |
| Campos personalizados novos por importação | 10 | fixo |
| Tentativas | 40 por hora por usuário | `importLimiter` |
| Exportação | 20.000 leads | fixo |

O limite de leads do plano é verificado na prévia (aviso) e no commit (`403 PLAN_LIMIT_LEADS`). O corpo da requisição é binário (`express.raw`) — o limite de 6 MB padrão do nginx cobre o arquivo de 5 MB; se subir `MAX_IMPORT_MB`, suba também `client_max_body_size`. Arquivos `.xls` antigos são recusados com instrução para salvar como `.xlsx`; `.xlsx` passa por proteção contra zip bomb.

## Desfazer

`DELETE /leads/import/:id` numa importação concluída remove (soft delete) os leads criados por ela, **exceto** os que já têm processo ou tarefa (a resposta informa `removidos` e `mantidos`). Leads apenas "completados" (`merge`) não são revertidos. Em rascunho, o mesmo endpoint apenas descarta.

## Exportação

`GET /leads/export?format=xlsx|csv` — colunas do Modelo Foro + campos personalizados. CSV com BOM, `;` e CRLF (abre direto no Excel BR). Células que começam com `= + - @` recebem `'` (anti injeção de fórmula). Respeita `view_scope=own` e filtros (`stage`, `search`, `assigned`). Exige a permissão `export_leads` (padrão: liberada). Gera auditoria `lead_export`.

## Auditoria e permissões

Importar exige `create_leads`; exportar, `export_leads`. Eventos em `audit_events`: `lead_import` (`imported`/`undone`) e `lead_export`. Membros com visão "só os meus" importam sempre atribuindo a si mesmos e só veem as próprias importações.

## Limitação conhecida

O quadro do CRM carrega os **500 leads mais recentes**; acima disso aparece um aviso e a busca passa a consultar o servidor (nome, telefone, e-mail, CPF/CNPJ). A lista completa está na Exportação. Paginação real do quadro é um próximo passo.
