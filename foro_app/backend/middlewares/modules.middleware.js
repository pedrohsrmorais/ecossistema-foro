const modulesService = require('../services/modules.service');

/**
 * Bloqueia o acesso a um módulo (CRM, pesquisa, educação...) quando ele foi
 * desativado para a conta por um admin da plataforma. "Sem configuração" =
 * ativo por padrão (ver modules.service.js::isEnabled).
 *
 * Uso: router.get('/leads', requireModule('crm'), leadsController.list)
 * Precisa vir DEPOIS de loadClientContext() — depende de req.account.id.
 */
function requireModule(moduleKey) {
  return async function (req, res, next) {
    try {
      const enabled = await modulesService.isEnabled(req.account.id, moduleKey);
      if (!enabled) {
        return res.status(403).json({
          error: 'Este módulo está desativado para sua conta. Fale com o administrador da plataforma.',
          code: 'MODULE_DISABLED',
          module: moduleKey,
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { requireModule };
