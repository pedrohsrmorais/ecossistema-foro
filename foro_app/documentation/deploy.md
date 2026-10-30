# Deploy em produção (VPS + nginx + Docker)

Arquitetura: **internet → nginx (HTTPS, porta 443) → 127.0.0.1:3040 (container `foro_app`) → MySQL (container `foro_db`, rede interna, sem porta publicada)**.

## 1. Primeira subida
```bash
git clone https://github.com/pedrohsrmorais/ecossistema-foro.git && cd ecossistema-foro/foro_app
cp .env.example .env && nano .env      # preencha os OBRIGATÓRIOS (o compose recusa subir sem eles)
docker compose up -d --build
curl -s http://127.0.0.1:3040/health   # {"status":"ok"} — só responde "ok" se o MySQL responde
```
Gere segredos com `openssl rand -hex 32`. Em produção (`NODE_ENV=production`) a API **recusa iniciar** com `JWT_SECRET` fraco/curto ou `DB_PASSWORD` padrão.

> **Já existe um volume MySQL criado com as senhas antigas (`foro_secret`/`root_secret`)?** O MySQL só lê `MYSQL_PASSWORD` na criação do volume — trocar o `.env` depois NÃO muda a senha do usuário. Ou mantenha as mesmas senhas no `.env`, ou troque dentro do banco: `docker compose exec db mysql -uroot -p -e "ALTER USER 'foro_user'@'%' IDENTIFIED BY 'NOVA'; ALTER USER 'root'@'localhost' IDENTIFIED BY 'NOVA_ROOT';"` e então atualize o `.env`.

## 2. nginx e HTTPS
Use `deploy/nginx.conf.example` (ajuste o domínio), depois `certbot --nginx -d app.seudominio.com.br`. Firewall: só 22, 80 e 443 abertas. A API confia no `X-Forwarded-For` do nginx (`TRUST_PROXY=1`) para limitar tentativas por IP real.

## 3. Atualizar
```bash
git pull && docker compose up -d --build
```
As migrações de banco (`backend/migrations/`) rodam sozinhas no boot, antes de a API abrir a porta. **Faça backup antes** (item 4).

## 4. Backup
`deploy/backup.sh` gera um dump comprimido (retenção de 14 dias). Agende no cron (`15 3 * * *`) e copie `/var/backups/foro` para FORA do servidor. Restauração: comando no final do script.

## 5. Checklist antes de abrir para clientes
- [ ] `RESEND_API_KEY` + domínio verificado no Resend (sem isso ninguém confirma o e-mail)
- [ ] `ANTHROPIC_API_KEY` com limite de gasto definido no painel da Anthropic
- [ ] Troque a senha do admin da plataforma (`admin@intellsn.com.br`) para algo forte
- [ ] Webhook do Stripe (usa `req.rawBody` para validar a assinatura) + `STRIPE_WEBHOOK_SECRET`
- [ ] Backup agendado **e** copiado para fora do servidor; teste uma restauração
- [ ] Termos de uso e política de privacidade (LGPD) publicados
