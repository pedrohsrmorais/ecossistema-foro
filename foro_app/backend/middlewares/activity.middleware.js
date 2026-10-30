const office = require('../services/office.service');

/** Conta ações de escrita bem-sucedidas por usuário/dia (alimenta o "nível de atividade"). Nunca atrapalha a resposta. */
function countActions(req, res, next) {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) && !/^\/(activity|auth)/.test(req.path)) {
    res.on('finish', () => {
      if (res.statusCode < 400 && req.user) office.countAction(req.user.id, req.user.account_id).catch(() => {});
    });
  }
  next();
}
module.exports = { countActions };
