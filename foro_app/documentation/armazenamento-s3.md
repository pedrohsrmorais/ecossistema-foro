# Armazenamento S3 e processos salvos

Arquivos (hoje: o PDF dos processos salvos) ficam num armazenamento **compatível com S3**; os **metadados** ficam no MySQL (`saved_processes`).
Na fase de teste o S3 é um **MinIO** no próprio `docker compose`. Para a AWS, só mudam variáveis de ambiente — o código é o mesmo (`@aws-sdk/client-s3`).

## Fluxo

1. `POST /api/process-search {q}` — pesquisa. Com `PROCESS_SEARCH_PROVIDER=mock` qualquer termo devolve 3 processos fictícios (números CNJ válidos; se o termo for um CNJ válido, ele vem em 1º). Cada resultado traz um `ref` assinado (JWT de 30 min, preso à conta e ao usuário).
2. `GET /api/process-search/preview?ref=` — PDF de teste (gerado, determinístico por número). Não grava nada.
3. `POST /api/process-search/save {ref}` — baixa o documento, calcula SHA-256, **grava no S3** e **insere os metadados no MySQL**. `201` ao salvar; `200` + `already_saved:true` se o mesmo arquivo já está salvo na conta. Se o INSERT falhar, o objeto é removido do S3.
4. `GET /api/saved-processes` (`q`, `page`, `limit`), `GET /api/saved-processes/:id`, `GET /api/saved-processes/:id/file` (`?download=1` baixa), `DELETE /api/saved-processes/:id`.

Segurança: o bucket é privado; o arquivo sempre passa pela API (login + conta + `view_scope`). Salvar exige a permissão `create_cases`; remover, `delete_records`. O `ref` impede adulterar os metadados. Chave do objeto: `accounts/<account_id>/processos/<id>/<arquivo>.pdf`. A exclusão é lógica (`deleted_at`) e **mantém o objeto no S3**.

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

Console web só em `127.0.0.1:9001` (túnel: `ssh -L 9001:127.0.0.1:9001 usuario@servidor`); a porta 9000 não é publicada. Dados no volume `foro_minio_data` — inclua-o no backup.

## Migrar para a AWS

1. Crie o bucket (privado, *Block Public Access* ligado) e um usuário IAM com `s3:GetObject/PutObject/DeleteObject/ListBucket/CreateBucket` nele.
2. Copie os objetos: `mc mirror local/foro-arquivos s3aws/<bucket>` (ou `aws s3 sync`), mantendo as chaves.
3. No `.env`: `S3_ENDPOINT=`, `S3_FORCE_PATH_STYLE=false`, região, bucket e chaves; atualize `s3_bucket` em `saved_processes` se o nome mudar. Remova o serviço `minio` do compose e `docker compose up -d --build`.

## Banco

Migração `010_processos_salvos`: tabela `saved_processes` (conta, quem salvou, número CNJ, tribunal, classe, assunto, partes JSON, última movimentação, `s3_bucket`, `s3_key`, `file_name`, `size_bytes`, `sha256`, `pages`, `case_id` opcional, `created_at`, `deleted_at`).
