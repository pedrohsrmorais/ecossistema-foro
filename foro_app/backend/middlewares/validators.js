const { body } = require('express-validator');

const authValidations = {
  register: [
    body('name').trim().notEmpty().withMessage('Nome é obrigatório.'),
    body('email').isEmail().normalizeEmail().withMessage('E-mail inválido.'),
    body('password').isLength({ min: 8 }).withMessage('Senha deve ter ao menos 8 caracteres.'),
    body('accountName').trim().notEmpty().withMessage('Nome da empresa é obrigatório.'),
  ],
  login: [
    body('email').isEmail().normalizeEmail().withMessage('E-mail inválido.'),
    body('password').notEmpty().withMessage('Senha é obrigatória.'),
  ],
};

const leadValidations = {
  create: [
    body('name').optional().trim(),
    body('phone').optional().trim(),
    body('email').optional().isEmail().withMessage('E-mail inválido.'),
    body('stage').optional().trim(),
  ],
};

const fieldValidations = {
  create: [
    body('name').trim().notEmpty().matches(/^[a-z_][a-z0-9_]*$/).withMessage('Nome deve ser snake_case.'),
    body('label').trim().notEmpty().withMessage('Rótulo é obrigatório.'),
    body('field_type').isIn(['text','textarea','select','multiselect','number','date','boolean','phone','email'])
      .withMessage('Tipo de campo inválido.'),
    body('options').optional().isArray(),
  ],
  update: [
    body('label').optional().trim().notEmpty(),
    body('options').optional().isArray(),
    body('required').optional().isBoolean(),
    body('active').optional().isBoolean(),
    body('display_order').optional().isInt({ min: 0 }),
  ],
};

module.exports = { authValidations, leadValidations, fieldValidations };
