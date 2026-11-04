# Integração com o Google Agenda

Botão **Conectar Google** em *Configurações → Integrações*. Escopos: `openid`, `email`, `profile` e `https://www.googleapis.com/auth/calendar.events` (escopo *sensível*: verificação gratuita, sem auditoria CASA). **Não há acesso ao Gmail.**

## Fluxo
1. `POST /integrations/google/start` assina um `state` (JWT, 10 min, usuário/escritório/nonce) e o grava também em cookie HttpOnly `foro_g_state`; devolve a URL do Google (`access_type=offline`, `prompt=consent`).
2. O Google volta em `GET /integrations/google/callback` (pública). O `state` do link precisa bater com o cookie e com o JWT; só então o `code` é trocado por tokens.
3. Tokens são cifrados com AES-256-GCM (`utils/secret-box.js`) com `GOOGLE_TOKEN_ENCRYPTION_KEY` (ou derivada do `JWT_SECRET`) e nunca vão para logs (o morgan oculta a query do callback).
4. Falha ao renovar token (`invalid_grant`) marca a conexão como `revoked`; a tela pede "Reconectar".

## Sincronização
- **Google → Foro** (job a cada 15 min + botão *Sincronizar agora*): janela −30 a +180 dias; importa título, horário, local e link de reunião; atualiza e remove o que mudou/sumiu. Eventos importados são privados do usuário, somente leitura, fora dos alertas/resumo e **invisíveis para a IA** (`list_events` chama o serviço sem `viewerId`; nada do Google vai ao provedor de IA).
- **Foro → Google**: criar/editar/cancelar/excluir compromissos reflete no Google (desmarque *Adicionar também ao Google Agenda* para manter só no Foro). Observações internas nunca são enviadas. Compromissos criados antes de conectar não são reenviados.
- **Desconectar**: revoga o acesso no Google, apaga tokens e eventos importados na hora e solta o vínculo dos eventos do Foro.

## Configuração
Ver `.env.example`. O `google_cliente.json` fica em `backend/configs/` (gitignored) e precisa existir antes do `docker compose up --build`. URI de redirecionamento: `https://SEU_DOMINIO/api/integrations/google/callback`.

## Verificação no Google
Domínio verificado no Search Console, página inicial pública (`/`), Política (`/privacidade`) e Termos (`/termos`) no mesmo domínio, vídeo de demonstração do consentimento e do uso do escopo. Em modo *Teste*, o refresh token expira em 7 dias e há limite de 100 usuários.
