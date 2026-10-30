/**
 * Middleware global de tratamento de erros.
 * Deve ser o ÚLTIMO middleware registrado no server.js.
 */
function errorMiddleware(err, req, res, next) { // eslint-disable-line no-unused-vars
  const isDev = process.env.NODE_ENV === 'development';

  // Log estruturado
  console.error({
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    error: err.message,
    ...(isDev ? { stack: err.stack } : {}),
  });

  // Erros de validação do express-validator
  if (err.type === 'validation') {
    return res.status(422).json({ error: 'Dados inválidos.', details: err.errors });
  }

  // Corpo da requisição malformado / grande demais (body-parser)
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON inválido.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Requisição grande demais.' });

  // Erros esperados da aplicação
  if (err.statusCode) {
    return res.status(err.statusCode).json({ error: err.message, ...(err.code ? { code: err.code } : {}), ...(err.extra || {}) });
  }

  // Erros de duplicidade MySQL (unique constraint)
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Registro duplicado.' });
  }

  // Fallback
  res.status(500).json({
    error: 'Erro interno do servidor.',
    ...(isDev ? { detail: err.message } : {}),
  });
}

/**
 * Erro com status HTTP controlado.
 */
class AppError extends Error {
  constructor(message, statusCode = 400, code) {
    super(message);
    this.statusCode = statusCode;
    if (code) this.code = code;
  }
}

module.exports = errorMiddleware;
module.exports.AppError = AppError;
