/**
 * google.config.js — credenciais do OAuth do Google (cliente "FORO Web").
 *
 * Onde fica o segredo: o JSON baixado do Google Cloud (Credenciais → seu cliente OAuth → Baixar JSON) é salvo como
 *   backend/configs/google_cliente.json        (ignorado pelo git — ver .gitignore)
 * Para usar outro nome/local, defina GOOGLE_CLIENT_FILE (caminho absoluto ou relativo a backend/configs).
 * Alternativa sem arquivo: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET e GOOGLE_REDIRECT_URI no .env.
 *
 * O segredo nunca vai para o frontend nem para os logs.
 */
const fs = require('fs');
const path = require('path');

const DEFAULT_FILE = 'google_cliente.json';
const DEFAULT_REDIRECT = '/api/integrations/google/callback';

function _fromFile() {
  const name = process.env.GOOGLE_CLIENT_FILE || DEFAULT_FILE;
  const file = path.isAbsolute(name) ? name : path.join(__dirname, name);
  if (!fs.existsSync(file)) return null;
  try {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    const c = json.web || json.installed || json;
    if (!c.client_id || !c.client_secret) return null;
    return { clientId: c.client_id, clientSecret: c.client_secret, redirectUris: c.redirect_uris || [] };
  } catch {
    console.error('[google] google_cliente.json inválido (não é o JSON baixado do Google Cloud).');
    return null;
  }
}

function load() {
  const f = _fromFile();
  const base = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
  const clientId = f?.clientId || process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = f?.clientSecret || process.env.GOOGLE_CLIENT_SECRET || '';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI
    || f?.redirectUris.find(u => u.endsWith(DEFAULT_REDIRECT))
    || f?.redirectUris[0]
    || (base ? base + DEFAULT_REDIRECT : '');
  return { configured: Boolean(clientId && clientSecret), clientId, clientSecret, redirectUri };
}

module.exports = { load, DEFAULT_REDIRECT };
