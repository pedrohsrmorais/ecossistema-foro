const modulesService = require('../services/modules.service');

/**
 * GET /modules — quais módulos estão ativos para a conta logada.
 * Usado pelo frontend para decidir o que mostrar no menu, sem precisar
 * tentar cada rota e tratar 403 (ver middlewares/modules.middleware.js).
 */
async function listForMyAccount(req, res) {
  const modules = await modulesService.listForAccount(req.account.id);
  res.json({ modules });
}

module.exports = { listForMyAccount };
