# Consulta processual (DataJud + DJEN)

> **Estado atual (05/11/2026):** a interface **não oferece mais salvar processo nem anexar PDF** — a aba *Salvos* foi removida (`/monitoramento-processual/salvos` e `/processos-salvos` redirecionam para *Meus processos*) e *Pesquisar* é só consulta (resultados + *Ver andamentos*, nada é gravado). O backend (`/process-search/save`, `/saved-processes/*`, PDF no S3), a tabela `saved_processes` e o MinIO continuam no ar e testados, prontos para reativar; só falta o front. O foco passa a ser o **monitoramento** dos processos.

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
| `PROCESS_SEARCH_PROVIDER` | `cnj` = consulta real · `mock` = dados fictícios + PDF de teste (padrão do compose) |
| `DATAJUD_API_KEY` | chave **pública** do DataJud (a mesma para todos; o CNJ publica na wiki do DataJud e pode trocar). Não vai no código |
| `DATAJUD_BASE_URL` / `DJEN_BASE_URL` | padrões `https://api-publica.datajud.cnj.jus.br` e `https://comunicaapi.pje.jus.br` |
| `DATAJUD_TIMEOUT_MS` / `DJEN_TIMEOUT_MS` | 30000 / 20000 (1 nova tentativa em erro de rede, 429 e 5xx) |
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
