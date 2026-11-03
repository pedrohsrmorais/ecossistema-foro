const google = require('../services/google.service');

module.exports = {
  status: async (req, res) => res.json(await google.status(req.user.id)),
  start: async (req, res) => { const { url, cookie } = google.start(req.user); res.set('Set-Cookie', cookie).json({ url }); },
  // Público: é o Google que redireciona o navegador para cá (a identidade vem do state assinado + cookie, nunca de parâmetros soltos)
  callback: async (req, res) => { const { redirect, cookie } = await google.callback(req.query, req.headers.cookie); res.set('Set-Cookie', cookie).redirect(302, redirect); },
  sync: async (req, res) => res.json(await google.syncUser(req.user.id)),
  disconnect: async (req, res) => res.json(await google.disconnect(req.user.id)),
};
