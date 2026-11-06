# Consulta processual (DataJud + DJEN)

> **Estado atual (06/11/2026):** *Pesquisar* aceita **período de datas** (padrão: 01/01/1990 até hoje = todo o histórico) e tem **Salvar em Meus processos**: cria (ou vincula, se já existe com o mesmo número) o processo em *Meus processos* e guarda as publicações do DJEN e os andamentos do DataJud. Na ficha do processo, o quadro **Publicações e andamentos do tribunal** mostra o retrato salvo e tem **Acompanhar este processo** (para processos cadastrados à mão) / **Atualizar** (consulta de novo e avisa quantas publicações/movimentações são novas). A antiga aba *Salvos* segue fora; anexar PDF segue só no backend.

Tela **Monitoramento Processual → Pesquisar** (`/monitoramento-processual/pesquisar`) e **Salvos** (`/monitoramento-processual/salvos`).
Consulta gratuita às duas bases públicas do Poder Judiciário, junta o resultado, guarda o **estado atual** do processo e permite **anexar o PDF** manualmente.

## O que cada fonte entrega

| | DataJud (CNJ) | DJEN (Comunica PJe) |
|---|---|---|
| Capa (classe, assuntos, órgão julgador, sistema, ajuizamento) | ✅ | parcial (classe/órgão da última publicação) |
| Movimentações (andamentos) | ✅ (todas as instâncias somadas) | — |
| Partes | — | ✅ (destinatários, com polo ativo/passivo) |
| Publicações / intimações (texto) e advogados (OAB) | — | ✅ |
| Processos sigilosos | não aparecem | só o que foi publicado |
| PDF / autos | ❌ | ❌ |

O DataJud atualiza com atraso (os tribunais enviam em lote); o DJEN só tem o que foi **publicado**. Nenhum dos dois traz os autos: o PDF é anexado à mão por enquanto.

## Como a busca funciona

O campo aceita:

- **Número CNJ** (com ou sem máscara) → consulta **DataJud e DJEN em paralelo** e mescla. Dígitos verificadores inválidos → erro 422.
- **OAB** (`OAB/RS 12345`, `12345/RS` ou `RS12345`) ou **nome da parte** → só DJEN (o DataJud não busca por advogado/parte), agrupado por processo. A tela avisa que processos sem publicação recente podem não aparecer; para o histórico completo, pesquise pelo número.
- **CPF/CNPJ** → não suportado pelas fontes gratuitas (erro 422 explicando).

Se uma fonte cair, a outra continua valendo (fallback), e a tela mostra o status de cada uma (`ok`, `sem registros`, `indisponível` + motivo, `não configurado`). Só devolve erro 502 se **nenhuma** fonte responder e ao menos uma tiver falhado.

## Período (filtro de datas)

O DJEN recebe `dataDisponibilizacaoInicio`/`dataDisponibilizacaoFim`. Sem datas, a busca usa `DJEN_DATA_INICIO` (padrão `1990-01-01`) até hoje, o que traz todas as publicações. O usuário pode informar **De / Até** na pesquisa: vale para o DJEN e também filtra as movimentações do DataJud (que não aceita filtro por data). Datas inválidas ou início depois do fim → `422`. **Salvar e Atualizar sempre gravam o histórico completo**, independentemente do filtro usado na busca.

Só com o **número do processo** já dá para consultar (sem token). O DJEN traz **publicações/intimações** (cada uma cita o movimento, ex. "seq. 77 JUNTADA DE CERTIDÃO"), não a lista completa de andamentos, que vem do DataJud (`DATAJUD_API_KEY`).

## Acompanhamento em Meus processos

- `POST /process-search/save { ref }` → grava o retrato (`saved_processes`) e vincula a um processo de `cases`: o já vinculado, o que tem o mesmo número ou um novo (título "Classe — primeira parte", vara = órgão). Responde `case_id` e `case_created`.
- `GET /cases/:id/tracking` → `{ process }` com o retrato salvo (ou `null`).
- `POST /cases/:id/tracking` → primeira consulta (`first: true`) ou atualização: `{ process, novos_movimentos, novas_comunicacoes, novos }`. Exige número CNJ válido (`422 NO_CASE_NUMBER`), `create_cases` e o módulo `pesquisa_processual`.

## Fluxo na tela

> Os itens 3 a 5 abaixo descrevem a funcionalidade que está **desligada no front** (ver aviso no topo).

1. **Pesquisar** → cartões com capa resumida, partes, última movimentação e contagens.
2. **Ver andamentos** → janela com status das fontes, capa, partes por polo e abas *Movimentações* / *Publicações* (texto limpo, advogados, link do tribunal). Nada é gravado.
3. **Salvar estado atual** → grava o retrato no MySQL (`saved_processes.snapshot`). Se o processo já estava salvo, o retrato é **atualizado** (não duplica).
4. Em **Salvos**: lista com data da consulta, contagem de movimentações/publicações e se há PDF. Clique na linha: com PDF abre o PDF; sem PDF abre o detalhe.
5. **Detalhe**: *Atualizar andamentos* (consulta de novo e informa quantas movimentações/publicações novas), *Anexar/Substituir PDF*, *Abrir/Baixar PDF*, *Remover PDF*, *Remover processo*.

## Retrato (snapshot)

JSON em `saved_processes.snapshot`: `capa`, `partes`, `movimentos` (mais recentes primeiro, até 2000), `comunicacoes` (até 300, texto até 20 000 caracteres), `fontes` (status por fonte) e `consultado_em`. Os tetos acima limitam o tamanho (no pior caso alguns MB por processo). `movements_count`/`communications_count` ficam em colunas para listar sem abrir o JSON.

## PDF opcional

`PUT /api/saved-processes/:id/file` com o **PDF cru** no corpo (`Content-Type: application/pdf`, `?name=arquivo.pdf`). Valida o `%PDF-`, limita a `MAX_PDF_MB` (padrão 25), calcula SHA-256 e nº de páginas e grava no S3 em `accounts/<conta>/processos/<id>/<timestamp>-<nome>.pdf`. Substituir ou remover **apaga o objeto do S3**; remover o processo também. Atenção ao nginx: o exemplo em `deploy/nginx.conf.example` já libera 30 MB nessa rota (o padrão geral é 6 MB).

## Configuração

| Variável | Para quê |
|---|---|
| `PROCESS_SEARCH_PROVIDER` | `cnj` = consulta real (padrão do compose) · `mock` = dados fictícios + PDF de teste |
| `DATAJUD_API_KEY` | chave **pública** do DataJud (a mesma para todos; o CNJ publica na wiki do DataJud e pode trocar). Não vai no código |
| `DATAJUD_BASE_URL` / `DJEN_BASE_URL` | padrões `https://api-publica.datajud.cnj.jus.br` e `https://comunicaapi.pje.jus.br` |
| `DATAJUD_TIMEOUT_MS` / `DJEN_TIMEOUT_MS` | 30000 / 20000 (1 nova tentativa em erro de rede, 429 e 5xx) |
| `DJEN_DATA_INICIO` | início padrão do período (padrão `1990-01-01`) |
| `MAX_PDF_MB` | tamanho máximo do PDF anexado |

**Importante:** o DJEN **bloqueia IPs fora do Brasil** (403). O servidor precisa estar no Brasil; senão a tela mostra "o DJEN bloqueou o acesso" e usa só o DataJud.

## Validar na VPS (formatos reais)

O desenvolvimento foi feito contra um mock; confirme com dados reais:

```bash
cd ~/ecossistema-foro/foro_app
docker compose exec api node scripts/test-process-sources.js 0001234-56.2023.8.26.0100
docker compose exec api node scripts/test-process-sources.js "OAB/RS 12345"
```

O script mostra a configuração, o status HTTP e as chaves cruas de cada fonte e o resultado interpretado. Se algum campo vier diferente do esperado, o parser está em `backend/services/cnj-sources.service.js` (`normDatajudHit`, `normComunicacao`).

## API

Ver `api-reference.md` → "Pesquisa de processos e processos salvos". Permissões: pesquisar/salvar/atualizar/anexar = `create_cases`; remover processo/PDF = `delete_records`. Atualizar consome o limitador de IA/consulta e exige o módulo `pesquisa_processual`.
