# Modelos de documentos do escritório

Coloque aqui, **no servidor (VPS)**, os modelos de peças que o escritório já usa e que são aceitos na prática dos tribunais.
Esta pasta é montada em `/app/modelos` (somente leitura) e **sobrepõe** os modelos embutidos de mesma `key`.

Estrutura: `modelos/<area>/<key>.md`, onde `<area>` é uma de: `geral`, `civel`, `trabalhista`, `criminal`, `contratacoes_publicas`, `consultivo`.

Formato, regras e como marcar os trechos que a IA pode preencher: veja `documentation/documentos-e-modelos.md`.
Modelo de exemplo: `civel/_exemplo.md.txt` (renomeie para `.md` e edite).

Depois de adicionar/alterar arquivos, reinicie o app: `docker compose restart app`.
