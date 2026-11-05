/**
 * Manutenção das consultas pagas: ao subir, marca como "interrompidos" os lotes de enriquecimento que estavam
 * rodando; a cada 6 h apaga cache de consultas vencido (LOOKUP_CACHE_DAYS) e lotes antigos (7 dias) — dados pessoais.
 */
const enrich = require('../services/lookup-enrich.service');
const lookup = require('../services/lookup.service');

async function runOnce() {
  const cache = await lookup.purgeExpired();
  const jobs = await enrich.purgeOld();
  return { cache, jobs };
}

function start() {
  enrich.recoverInterrupted().then(n => { if (n) console.log(`[lookup] ${n} lote(s) de enriquecimento marcados como interrompidos.`); }).catch(e => console.error('[lookup] recover:', e.message));
  const t = setInterval(() => runOnce().catch(e => console.error('[lookup-maintenance]', e.message)), 6 * 60 * 60 * 1000);
  t.unref?.();
  setTimeout(() => runOnce().catch(() => {}), 60 * 1000).unref?.();
}

module.exports = { start, runOnce };
