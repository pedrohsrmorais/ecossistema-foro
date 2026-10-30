/** Normaliza page/limit vindos da query string (nunca NaN, negativo ou gigante). */
function paging(page, limit, { defaultLimit = 50, maxLimit = 200 } = {}) {
  let p = parseInt(page, 10); if (!Number.isFinite(p) || p < 1) p = 1;
  let l = parseInt(limit, 10); if (!Number.isFinite(l) || l < 1) l = defaultLimit;
  if (l > maxLimit) l = maxLimit;
  return { page: p, limit: l };
}
module.exports = { paging };
