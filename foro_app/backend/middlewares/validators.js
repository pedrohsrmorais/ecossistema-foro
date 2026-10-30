const { body } = require('express-validator');

const authValidations = {
  register: [
    body('name').trim().notEmpty().isLength({ max: 255 }).withMessage('Nome é obrigatório.'),
    body('email').isEmail().normalizeEmail().withMessage('E-mail inválido.'),
    body('password').isLength({ min: 8, max: 72 }).withMessage('Senha deve ter de 8 a 72 caracteres.'),
    body('phone').optional({ checkFalsy: true }).isMobilePhone('pt-BR').withMessage('Celular inválido.'),
    body('accountName').optional({ checkFalsy: true }).trim().isLength({ max: 255 }).withMessage('Nome do escritório muito longo.'),
  ],
  forgotPassword: [
    body('email').isEmail().normalizeEmail().withMessage('E-mail inválido.'),
  ],
  resetPassword: [
    body('token').isString().notEmpty().isLength({ max: 200 }).withMessage('Link inválido.'),
    body('password').isLength({ min: 8, max: 72 }).withMessage('Senha deve ter de 8 a 72 caracteres.'),
  ],
  changePassword: [
    body('currentPassword').isString().notEmpty().withMessage('Informe a senha atual.'),
    body('newPassword').isLength({ min: 8, max: 72 }).withMessage('A nova senha deve ter de 8 a 72 caracteres.'),
  ],
  refresh: [
    body('refreshToken').isString().notEmpty().withMessage('Token é obrigatório.'),
  ],
  login: [
    body('email').isEmail().normalizeEmail().withMessage('E-mail inválido.'),
    body('password').notEmpty().withMessage('Senha é obrigatória.'),
  ],
  sendVerification: [
    body('channel').isIn(['email', 'phone']).withMessage('Canal deve ser "email" ou "phone".'),
  ],
  verifyCode: [
    body('channel').isIn(['email', 'phone']).withMessage('Canal deve ser "email" ou "phone".'),
    body('code').trim().isLength({ min: 4, max: 10 }).withMessage('Código inválido.'),
  ],
};

const userValidations = {
  invite: [
    body('name').trim().notEmpty().isLength({ max: 255 }).withMessage('Nome é obrigatório.'),
    body('email').isEmail().normalizeEmail().withMessage('E-mail inválido.'),
    body('role').optional().isIn(['admin', 'user']).withMessage('Perfil inválido.'),
  ],
  update: [
    body('name').optional().isString().trim().notEmpty().withMessage('Nome inválido.'),
    body('role').optional().isIn(['admin', 'user']).withMessage('Perfil inválido.'),
    body('active').optional().isBoolean().withMessage('"active" deve ser verdadeiro/falso.'),
  ],
};

const leadValidations = {
  create: [
    body('name').optional({ nullable: true }).isString().trim().isLength({ max: 255 }),
    body('phone').optional({ nullable: true }).isString().trim().isLength({ max: 30 }),
    body('email').optional({ nullable: true, checkFalsy: true }).isEmail().withMessage('E-mail inválido.'),
    body('stage').optional().trim(),
    body().custom((b) => {
      if (!b || !['name', 'phone', 'email'].some(k => typeof b[k] === 'string' && b[k].trim())) {
        throw new Error('Informe ao menos nome, telefone ou e-mail.');
      }
      return true;
    }),
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

module.exports = { authValidations, leadValidations, fieldValidations, userValidations };
