/**
 * Sincronização periódica do Google Agenda (Google → Foro), a cada 15 minutos, em segundo plano.
 * Só roda se as credenciais do Google estiverem configuradas. Desligar: GOOGLE_SYNC=off.
 */
const googleConfig = require('../configs/google.config');
const google = require('../services/google.service');

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try { await google.syncAll(); } catch (e) { console.error('[google] job:', e.name); } finally { running = false; }
}

function start() {
  if (process.env.GOOGLE_SYNC === 'off' || !googleConfig.load().configured) return;
  setTimeout(tick, 60_000).unref();
  setInterval(tick, 15 * 60_000).unref();
}

module.exports = { start, tick };
