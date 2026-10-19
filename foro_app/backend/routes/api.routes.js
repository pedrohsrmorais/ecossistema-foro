/**
 * api.routes.js — Mapeamento ÚNICO de todas as rotas da API Foro.
 *
 * Convenção de prefixos:
 *   /api/auth      → autenticação (login, register, refresh)
 *   /api/users     → gestão de usuários da conta
 *   /api/leads     → CRM: leads, notas, tarefas
 *   /api/fields    → campos customizáveis do CRM
 *   /api/ai        → chat IA interno (conversa + tool calls)
 *   /api/payments  → pagamentos via Asaas (PIX + cartão)
 *   /api/webhooks  → webhooks externos (Asaas, NFE.io)
 *   /api/settings  → configurações da conta
 */

const router = require('express').Router();

const authController        = require('../controllers/auth.controller');
const usersController       = require('../controllers/users.controller');
const leadsController       = require('../controllers/leads.controller');
const fieldsController      = require('../controllers/fields.controller');
const aiController          = require('../controllers/ai.controller');
const paymentsController    = require('../controllers/payments.controller');
const webhooksController    = require('../controllers/webhooks.controller');
const settingsController    = require('../controllers/settings.controller');

const { authenticate }      = require('../middlewares/auth.middleware');
const { loadClientContext } = require('../middlewares/client.middleware');
const { validate }          = require('../middlewares/validation.middleware');
const { authValidations, leadValidations, fieldValidations } = require('../middlewares/validators');

// ─── Auth (público) ───────────────────────────────────────────────────────────
router.post('/auth/register',      validate(authValidations.register), authController.register);
router.post('/auth/login',         validate(authValidations.login),    authController.login);
router.post('/auth/refresh-token',                                     authController.refreshToken);
router.post('/auth/forgot-password',                                   authController.forgotPassword);
router.post('/auth/reset-password',                                    authController.resetPassword);

// ─── Tudo abaixo exige autenticação ───────────────────────────────────────────
router.use(authenticate);
router.use(loadClientContext);

// ─── Usuários ─────────────────────────────────────────────────────────────────
router.get   ('/users',                usersController.list);
router.get   ('/users/me',             usersController.me);
router.put   ('/users/me',             usersController.updateMe);
router.put   ('/users/me/password',    usersController.changePassword);
router.get   ('/users/:id',            usersController.getById);
router.put   ('/users/:id',            usersController.update);       // admin only
router.delete('/users/:id',            usersController.deactivate);   // admin only

// ─── Campos customizáveis ─────────────────────────────────────────────────────
router.get   ('/fields',               fieldsController.list);
router.post  ('/fields',               validate(fieldValidations.create), fieldsController.create);
router.put   ('/fields/:id',           validate(fieldValidations.update), fieldsController.update);
router.delete('/fields/:id',           fieldsController.remove);
router.put   ('/fields/reorder',       fieldsController.reorder);

// ─── Leads ────────────────────────────────────────────────────────────────────
router.get   ('/leads',                leadsController.list);
router.post  ('/leads',                validate(leadValidations.create), leadsController.create);
router.get   ('/leads/funnel',         leadsController.getFunnelSummary);
router.get   ('/leads/:id',            leadsController.getById);
router.put   ('/leads/:id',            leadsController.update);
router.patch ('/leads/:id/stage',      leadsController.moveStage);
router.patch ('/leads/:id/archive',    leadsController.archive);
router.delete('/leads/:id',            leadsController.softDelete);

// Notas do lead
router.get   ('/leads/:id/notes',      leadsController.listNotes);
router.post  ('/leads/:id/notes',      leadsController.addNote);
router.delete('/leads/:leadId/notes/:noteId', leadsController.deleteNote);

// Tarefas do lead
router.get   ('/leads/:id/tasks',      leadsController.listTasks);
router.post  ('/leads/:id/tasks',      leadsController.createTask);
router.patch ('/leads/:leadId/tasks/:taskId/complete', leadsController.completeTask);

// ─── Tarefas (visão global) ────────────────────────────────────────────────────
router.get('/tasks',                   leadsController.listAllTasks);

// ─── IA — Chat interno ────────────────────────────────────────────────────────
router.post  ('/ai/message',           aiController.sendMessage);
router.get   ('/ai/conversations',     aiController.listConversations);
router.get   ('/ai/conversations/:id', aiController.getConversation);
router.delete('/ai/conversations/:id', aiController.clearConversation);
router.get   ('/ai/usage',             aiController.getUsage);

// ─── Pagamentos ───────────────────────────────────────────────────────────────
router.get   ('/payments',             paymentsController.list);
router.post  ('/payments/pix',         paymentsController.createPix);
router.post  ('/payments/card',        paymentsController.createCard);
router.post  ('/payments/subscription',paymentsController.createSubscription);
router.get   ('/payments/:id',         paymentsController.getById);
router.get   ('/payments/:id/nfse',    paymentsController.getNfse);

// ─── Webhooks (sem autenticação JWT — validados por assinatura) ───────────────
router.post  ('/webhooks/asaas',       webhooksController.asaas);
router.post  ('/webhooks/nfeio',       webhooksController.nfeio);

// ─── Configurações da conta ───────────────────────────────────────────────────
router.get   ('/settings',             settingsController.get);
router.put   ('/settings',             settingsController.update);
router.get   ('/settings/plan',        settingsController.getPlan);

module.exports = router;
