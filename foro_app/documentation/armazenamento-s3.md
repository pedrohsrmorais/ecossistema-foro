# Armazenamento S3 e processos salvos

Arquivos (hoje: o PDF dos processos salvos) ficam num armazenamento **compatível com S3**; os **metadados** ficam no MySQL (`saved_processes`).
Na fase de teste o S3 é um **MinIO** no próprio `docker compose`. Para a AWS, só mudam variáveis de ambiente — o código é o mesmo (`@aws-sdk/client-s3`).

## Fluxo

1. `POST /api/process-search {q}` — pesquisa. Com `PROCESS_SEARCH_PROVIDER=mock` qualquer termo devolve 3 processos fictícios (números CNJ válidos; se o termo for um CNJ válido, ele vem em 1º). Cada resultado traz um `ref` assinado (JWT de 30 min, preso à conta e ao usuário).
2. `GET /api/process-search/preview?ref=` — PDF de teste (gerado, determinístico por número). Não grava nada.
3. `POST /api/process-search/save {ref}` — baixa o documento, calcula SHA-256, **grava no S3** e **insere os metadados no MySQL**. `201` ao salvar; `200` + `already_saved:true` se o mesmo arquivo já está salvo na conta. Se o INSERT falhar, o objeto é removido do S3.
4. `GET /api/saved-processes` (`q`, `page`, `limit`), `GET /api/saved-processes/:id`, `GET /api/saved-processes/:id/file` (`?download=1` baixa), `DELETE /api/saved-processes/:id`.

Segurança: o bucket é privado; o arquivo sempre passa pela API (login + conta + `view_scope`). Salvar exige a permissão `create_cases`; remover, `delete_records`. O `ref` impede adulterar os metadados. Chave do objeto: `accounts/<account_id>/processos/<id>/<arquivo>.pdf`. A exclusão é lógica (`deleted_at`) e **mantém o objeto no S3**.

## Ver os processos salvos

- **No app:** menu *Monitoramento Processual → aba Salvos* (`/monitoramento-processual/salvos`): resumo (total, páginas, espaço, último salvo), busca (número, parte, classe, assunto, caminho), filtros (tribunal, datas), ordenação, paginação, detalhe com bucket, **caminho no S3**, SHA-256 e botão de copiar, abrir/baixar/remover.
- **No MinIO:** abra o console por túnel (`ssh -L 9001:127.0.0.1:9001 usuario@servidor`) → http://localhost:9001 → login com `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` → *Object Browser* → bucket `foro-arquivos` → `accounts/<id da conta>/processos/<id>/<arquivo>.pdf`. O caminho exato de cada arquivo aparece na tela de Processos salvos.
- **No MySQL:** `SELECT numero_cnj, s3_bucket, s3_key, size_bytes FROM saved_processes WHERE deleted_at IS NULL;`

Busca: tudo sai do MySQL (nunca lista o S3). Colunas `numero_digits` (CNJ só dígitos, busca por prefixo indexada) e `parties_text` (nomes das partes) + índices por conta/data, tribunal e quem salvou (migração 011). `GET /api/saved-processes` aceita `q`, `tribunal`, `from`, `to` (AAAA-MM-DD), `sort` (`recent|oldest|number|tribunal|size`), `page`, `limit`; `GET /api/saved-processes/summary` devolve totais e tribunais.

## Variáveis

| Variável | Teste (MinIO) | AWS |
|---|---|---|
| `S3_ENDPOINT` | `http://minio:9000` | vazio |
| `S3_FORCE_PATH_STYLE` | `true` | `false` |
| `S3_REGION` | `us-east-1` | ex.: `sa-east-1` |
| `S3_BUCKET` | `foro-arquivos` (criado sozinho no boot) | bucket real |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | = `MINIO_ROOT_USER` / `MINIO_ROOT_PASSWORD` | usuário IAM restrito ao bucket |
| `PROCESS_SEARCH_PROVIDER` | `mock` | (futuro provedor real) |

Os valores de teste já vêm preenchidos no `.env.example`. **Rotacione antes de qualquer uso real** (`openssl rand -hex 16`), apagando o volume `foro_minio_data` se trocar as credenciais do MinIO.

## MinIO

> **Atenção (leia primeiro):** o serviço `minio` do compose agora é OPCIONAL (perfil `minio`) e **não sobe** com `docker compose up -d`: a imagem `minio/minio` não existe mais no Docker Hub (`pull access denied`) e travava o deploy inteiro. Sem ele, a pesquisa de processos funciona, mas *salvar* um processo falha com erro claro até você configurar um S3 (AWS S3: `S3_ENDPOINT=` vazio).
>
> Histórico: em out/2025 a MinIO deixou de publicar imagens Docker e binários oficiais da edição comunitária e o repositório entrou em modo manutenção/arquivado. A imagem `minio/minio:latest` ainda pode ser baixada, mas está congelada (sem correções de segurança futuras). Use só na fase de teste, fixe a tag (`MINIO_IMAGE`) e planeje migrar para AWS S3 (ou outro servidor S3 como Garage/SeaweedFS) — a aplicação só fala o protocolo S3. A API sobe mesmo sem o MinIO; só o salvar processo fica indisponível.

Console web só em `127.0.0.1:9001` (túnel: `ssh -L 9001:127.0.0.1:9001 usuario@servidor`); a porta 9000 não é publicada. Dados no volume `foro_minio_data` — inclua-o no backup.

## Migrar para a AWS

1. Crie o bucket (privado, *Block Public Access* ligado) e um usuário IAM com `s3:GetObject/PutObject/DeleteObject/ListBucket/CreateBucket` nele.
2. Copie os objetos: `mc mirror local/foro-arquivos s3aws/<bucket>` (ou `aws s3 sync`), mantendo as chaves.
3. No `.env`: `S3_ENDPOINT=`, `S3_FORCE_PATH_STYLE=false`, região, bucket e chaves; atualize `s3_bucket` em `saved_processes` se o nome mudar. Remova o serviço `minio` do compose e `docker compose up -d --build`.

## Banco

Migrações `010_processos_salvos` e `011_processos_salvos_busca` (colunas/índices de busca): tabela `saved_processes` (conta, quem salvou, número CNJ, tribunal, classe, assunto, partes JSON, última movimentação, `s3_bucket`, `s3_key`, `file_name`, `size_bytes`, `sha256`, `pages`, `case_id` opcional, `created_at`, `deleted_at`).
