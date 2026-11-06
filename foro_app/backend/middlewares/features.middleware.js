/**
 * features.middleware.js — liga/desliga funcionalidades inteiras da plataforma.
 *
 * Consultas pagas (CPF/CNPJ/processual via Direct Data) estão BLOQUEADAS nesta
 * fase para focar no CRM. Para liberar: FEATURE_LOOKUPS_ENABLED=true no .env
 * (e remover o bloqueio de frontend em src/config/featureFlags.ts).
 */
function requireLookupsEnabled(req, res, next) {
  if (process.env.FEATURE_LOOKUPS_ENABLED === 'true') return next();
  return res.status(403).json({
    error: 'As consultas (CPF, CNPJ e processual) estarão disponíveis em breve.',
    code: 'FEATURE_LOCKED',
  });
}

/**
 * Busca de processos por CPF/CNPJ (Direct Data, R$ 1,50 por consulta): desligada por
 * padrão — será reimplementada de outra forma. Liga com FEATURE_PROCESS_LOOKUP_ENABLED=true
 * (e `consultaProcessos: false` em src/config/featureFlags.ts).
 */
function requireProcessLookupEnabled(req, res, next) {
  if (process.env.FEATURE_PROCESS_LOOKUP_ENABLED === 'true') return next();
  return res.status(403).json({
    error: 'A busca de processos por CPF/CNPJ estará disponível em breve.',
    code: 'FEATURE_LOCKED',
  });
}

module.exports = { requireLookupsEnabled, requireProcessLookupEnabled };
