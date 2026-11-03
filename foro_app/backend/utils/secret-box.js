/**
 * secret-box.js — criptografia de segredos em repouso (tokens do Google): AES-256-GCM.
 * Chave: GOOGLE_TOKEN_ENCRYPTION_KEY (hex de 64 caracteres ou qualquer texto longo → SHA-256).
 * Sem a variável, deriva a chave do JWT_SECRET (funciona, mas definir a variável própria é o recomendado:
 * trocar a chave invalida os tokens guardados e a pessoa precisa reconectar).
 * Formato guardado: v1:<iv>:<tag>:<texto cifrado>, tudo em base64.
 */
const crypto = require('crypto');

function key() {
  const raw = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (raw) return /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : crypto.createHash('sha256').update(raw).digest();
  return crypto.createHash('sha256').update('foro-google-tokens:' + (process.env.JWT_SECRET || '')).digest();
}

function encrypt(plain) {
  if (plain == null || plain === '') return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), enc.toString('base64')].join(':');
}

function decrypt(blob) {
  if (!blob) return null;
  const [v, iv, tag, enc] = String(blob).split(':');
  if (v !== 'v1' || !iv || !tag || !enc) throw new Error('Formato de segredo inválido.');
  const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(enc, 'base64')), d.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt };
