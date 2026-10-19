const { validationResult } = require('express-validator');

/**
 * Executa os validadores do express-validator e rejeita se houver erros.
 * @param {import('express-validator').ValidationChain[]} validations
 */
function validate(validations) {
  return async (req, res, next) => {
    for (const validation of validations) {
      await validation.run(req);
    }
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ error: 'Dados inválidos.', details: errors.array() });
    }
    next();
  };
}

module.exports = { validate };
