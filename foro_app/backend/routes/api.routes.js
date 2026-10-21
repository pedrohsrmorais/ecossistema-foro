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
 *   /api/admin     → painel administrativo da plataforma (equipe intellsn, cross-tenant)
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
const adminController       = require('../controllers/admin.controller');
const creditsController     = require('../controllers/credits.controller');
const lookupController      = require('../controllers/lookup.controller');
const modulesController     = require('../controllers/modules.controller');
const educationController   = require('../controllers/education.controller');
const quizzesController     = require('../controllers/quizzes.controller');
const challengesController  = require('../controllers/challenges.controller');
const communityController   = require('../controllers/community.controller');

const { authenticate, requireVerifiedEmail } = require('../middlewares/auth.middleware');
const { loadClientContext }   = require('../middlewares/client.middleware');
const { authenticatePlatform } = require('../middlewares/platform.middleware');
const { requireModule }       = require('../middlewares/modules.middleware');
const { validate }            = require('../middlewares/validation.middleware');
const { authValidations, leadValidations, fieldValidations } = require('../middlewares/validators');

// ─── Auth (público) ───────────────────────────────────────────────────────────
router.post('/auth/register',      validate(authValidations.register), authController.register);
router.post('/auth/login',         validate(authValidations.login),    authController.login);
router.post('/auth/refresh-token',                                     authController.refreshToken);
router.post('/auth/forgot-password',                                   authController.forgotPassword);
router.post('/auth/reset-password',                                    authController.resetPassword);
router.post('/auth/platform-login',                                    authController.platformLogin);

// ─── Admin da plataforma (equipe intellsn) — autenticação própria, sem tenant ─
// IMPORTANTE: fica ANTES de router.use(authenticate)/loadClientContext porque
// um admin de plataforma não tem account_id (ele gerencia todas as contas).
router.get   ('/admin/accounts',            authenticatePlatform, adminController.listAccounts);
router.get   ('/admin/accounts/:id',        authenticatePlatform, adminController.getAccount);
router.patch ('/admin/accounts/:id/status', authenticatePlatform, adminController.updateAccountStatus);
router.get   ('/admin/plans',               authenticatePlatform, adminController.listPlans);
router.get   ('/admin/credits/overview',     authenticatePlatform, adminController.creditsOverview);
router.patch ('/admin/accounts/:id/credits/adjust', authenticatePlatform, adminController.adjustCredits);

// Módulos — liga/desliga funcionalidade por conta (ver modules.service.js)
router.get   ('/admin/modules',                        authenticatePlatform, adminController.listModulesCatalog);
router.get   ('/admin/accounts/:id/modules',            authenticatePlatform, adminController.getAccountModules);
router.patch ('/admin/accounts/:id/modules/:moduleKey', authenticatePlatform, adminController.setAccountModule);

// CMS do módulo "Educação" — conteúdo é da plataforma, não por conta
router.get   ('/admin/education/trilhas',           authenticatePlatform, educationController.adminListTrilhas);
router.get   ('/admin/education/trilhas/:id',        authenticatePlatform, educationController.adminGetTrilha);
router.post  ('/admin/education/trilhas',            authenticatePlatform, educationController.createTrilha);
router.put   ('/admin/education/trilhas/:id',        authenticatePlatform, educationController.updateTrilha);
router.delete('/admin/education/trilhas/:id',        authenticatePlatform, educationController.deleteTrilha);
router.post  ('/admin/education/trilhas/:id/aulas',  authenticatePlatform, educationController.createAula);
router.put   ('/admin/education/aulas/:aulaId',      authenticatePlatform, educationController.updateAula);
router.delete('/admin/education/aulas/:aulaId',      authenticatePlatform, educationController.deleteAula);

// CMS do módulo "Provas de conceito" — um quiz por aula, ver quizzes.service.js
router.get   ('/admin/education/aulas/:aulaId/quiz',            authenticatePlatform, quizzesController.adminGetQuizForAula);
router.post  ('/admin/education/aulas/:aulaId/quiz',             authenticatePlatform, quizzesController.createQuiz);
router.put   ('/admin/quizzes/:id',                              authenticatePlatform, quizzesController.updateQuiz);
router.delete('/admin/quizzes/:id',                              authenticatePlatform, quizzesController.deleteQuiz);
router.post  ('/admin/quizzes/:id/questions',                    authenticatePlatform, quizzesController.addQuestion);
router.put   ('/admin/quizzes/questions/:questionId',            authenticatePlatform, quizzesController.updateQuestion);
router.delete('/admin/quizzes/questions/:questionId',            authenticatePlatform, quizzesController.deleteQuestion);

// CMS do módulo "Desafios semanais" — ver challenges.service.js
router.get   ('/admin/challenges',     authenticatePlatform, challengesController.adminList);
router.post  ('/admin/challenges',     authenticatePlatform, challengesController.create);
router.put   ('/admin/challenges/:id', authenticatePlatform, challengesController.update);
router.delete('/admin/challenges/:id', authenticatePlatform, challengesController.remove);

// Moderação do módulo "Comunidade" — feed é por conta, mas a equipe intellsn
// pode remover qualquer post (ver community.service.js)
router.get   ('/admin/community/posts',     authenticatePlatform, communityController.adminListRecentPosts);
router.delete('/admin/community/posts/:id', authenticatePlatform, communityController.adminDeletePost);

// ─── Webhooks (público — sem JWT; Asaas/NFE.io não enviam Bearer token) ───────
// FICA ANTES de router.use(authenticate): se estivesse depois, toda chamada do
// Asaas/NFE.io cairia em 401 e a emissão automática de NFS-e nunca seria disparada.
router.post  ('/webhooks/asaas',       webhooksController.asaas);
router.post  ('/webhooks/nfeio',       webhooksController.nfeio);

// ─── Tudo abaixo exige autenticação de tenant ─────────────────────────────────
router.use(authenticate);
router.use(loadClientContext);

// ─── Verificação de e-mail/celular (OTP) — acessível mesmo sem verificar ──────
router.post('/auth/send-verification', validate(authValidations.sendVerification), authController.sendVerification);
router.post('/auth/verify-code',       validate(authValidations.verifyCode),       authController.verifyCode);
router.get  ('/users/me',              usersController.me); // exposto antes do gate p/ a tela "Confirme seu e-mail" exibir o e-mail

// ─── A partir daqui, exige e-mail confirmado (ver requireVerifiedEmail) ───────
router.use(requireVerifiedEmail);

// ─── Módulos — quais estão ativos para a conta logada (ver modules.service.js) ─
// Usado pelo frontend pra decidir o que mostrar no menu sem precisar tentar
// cada rota e tratar 403 MODULE_DISABLED.
router.get   ('/modules',              modulesController.listForMyAccount);

// ─── Usuários ─────────────────────────────────────────────────────────────────
router.get   ('/users',                usersController.list);
router.put   ('/users/me',             usersController.updateMe);
router.put   ('/users/me/password',    usersController.changePassword);
router.get   ('/users/:id',            usersController.getById);
router.put   ('/users/:id',            usersController.update);       // admin only
router.delete('/users/:id',            usersController.deactivate);   // admin only

// ─── Campos customizáveis (módulo "crm") ──────────────────────────────────────
router.get   ('/fields',               requireModule('crm'), fieldsController.list);
router.post  ('/fields',               requireModule('crm'), validate(fieldValidations.create), fieldsController.create);
router.put   ('/fields/:id',           requireModule('crm'), validate(fieldValidations.update), fieldsController.update);
router.delete('/fields/:id',           requireModule('crm'), fieldsController.remove);
router.put   ('/fields/reorder',       requireModule('crm'), fieldsController.reorder);

// ─── Leads (módulo "crm") ──────────────────────────────────────────────────────
router.get   ('/leads',                requireModule('crm'), leadsController.list);
router.post  ('/leads',                requireModule('crm'), validate(leadValidations.create), leadsController.create);
router.get   ('/leads/funnel',         requireModule('crm'), leadsController.getFunnelSummary);
router.get   ('/leads/:id',            requireModule('crm'), leadsController.getById);
router.put   ('/leads/:id',            requireModule('crm'), leadsController.update);
router.patch ('/leads/:id/stage',      requireModule('crm'), leadsController.moveStage);
router.patch ('/leads/:id/archive',    requireModule('crm'), leadsController.archive);
router.delete('/leads/:id',            requireModule('crm'), leadsController.softDelete);

// Notas do lead
router.get   ('/leads/:id/notes',      requireModule('crm'), leadsController.listNotes);
router.post  ('/leads/:id/notes',      requireModule('crm'), leadsController.addNote);
router.delete('/leads/:leadId/notes/:noteId', requireModule('crm'), leadsController.deleteNote);

// Tarefas do lead
router.get   ('/leads/:id/tasks',      requireModule('crm'), leadsController.listTasks);
router.post  ('/leads/:id/tasks',      requireModule('crm'), leadsController.createTask);
router.patch ('/leads/:leadId/tasks/:taskId/complete', requireModule('crm'), leadsController.completeTask);

// ─── Tarefas (visão global, módulo "crm") ──────────────────────────────────────
router.get('/tasks',                   requireModule('crm'), leadsController.listAllTasks);

// ─── IA — Chat interno (módulo "crm") ──────────────────────────────────────────
router.post  ('/ai/message',           requireModule('crm'), aiController.sendMessage);
router.get   ('/ai/conversations',     requireModule('crm'), aiController.listConversations);
router.get   ('/ai/conversations/:id', requireModule('crm'), aiController.getConversation);
router.delete('/ai/conversations/:id', requireModule('crm'), aiController.clearConversation);
router.get   ('/ai/usage',             requireModule('crm'), aiController.getUsage);

// ─── Pagamentos ───────────────────────────────────────────────────────────────
router.get   ('/payments',             paymentsController.list);
router.post  ('/payments/pix',         paymentsController.createPix);
router.post  ('/payments/card',        paymentsController.createCard);
router.post  ('/payments/subscription',paymentsController.createSubscription);
router.get   ('/payments/:id',         paymentsController.getById);
router.get   ('/payments/:id/nfse',    paymentsController.getNfse);

// ─── Configurações da conta ───────────────────────────────────────────────────
router.get   ('/settings',             settingsController.get);
router.put   ('/settings',             settingsController.update);
router.get   ('/settings/plan',        settingsController.getPlan);

// ─── Créditos — carteira pré-paga p/ serviços pagos de terceiros ──────────────
router.get   ('/credits/balance',          creditsController.getBalance);
router.get   ('/credits/prices',           creditsController.listPrices);
router.get   ('/credits/transactions',     creditsController.listTransactions);
router.post  ('/credits/purchase/pix',     creditsController.purchasePix);
router.post  ('/credits/purchase/card',    creditsController.purchaseCard);

// ─── Consultas pagas (CPF/CNPJ/processual) e resumo por IA ────────────────────
// Cada chamada debita créditos automaticamente (ver external-lookup.service.js).
// Erro de provedor -> reembolso automático + mensagem genérica "chame o suporte";
// NÃO existe endpoint de reembolso solicitado pelo usuário (ver credits.service.js).
router.post  ('/lookup/cnpj',              requireModule('pesquisa_cpf_cnpj'),   lookupController.cnpj);
router.post  ('/lookup/cpf',               requireModule('pesquisa_cpf_cnpj'),   lookupController.cpf);
router.post  ('/lookup/processo',          requireModule('pesquisa_processual'), lookupController.processo);
router.post  ('/lookup/processo/summary',  requireModule('pesquisa_processual'), lookupController.processoSummary);

// ─── Educação (módulo "educacao") — trilhas e aulas em vídeo ──────────────────
// Conteúdo é da plataforma (não por conta) — ver education.service.js.
router.get   ('/education/trilhas',               requireModule('educacao'), educationController.listTrilhas);
router.get   ('/education/trilhas/:id',            requireModule('educacao'), educationController.getTrilha);
router.put   ('/education/aulas/:aulaId/progress', requireModule('educacao'), educationController.updateProgress);

// ─── Provas de conceito (módulo "provas_conceito") — quiz vinculado a uma aula ─
router.get   ('/education/quizzes',                  requireModule('provas_conceito'), quizzesController.listAvailable);
router.get   ('/education/aulas/:aulaId/quiz',       requireModule('provas_conceito'), quizzesController.getQuizForAula);
router.post  ('/education/quizzes/:id/attempts',     requireModule('provas_conceito'), quizzesController.submitAttempt);

// ─── Desafios semanais (módulo "desafios_semanais") — conclusão auto-declarada ─
router.get   ('/challenges',              requireModule('desafios_semanais'), challengesController.listActive);
router.post  ('/challenges/:id/complete', requireModule('desafios_semanais'), challengesController.complete);

// ─── Comunidade (módulo "comunidade") — feed isolado por conta + ranking cross-tenant ─
router.get   ('/community/posts',         requireModule('comunidade'), communityController.listFeed);
router.post  ('/community/posts',         requireModule('comunidade'), communityController.createPost);
router.delete('/community/posts/:id',     requireModule('comunidade'), communityController.deletePost);
router.get   ('/community/leaderboard',   requireModule('comunidade'), communityController.leaderboard);

module.exports = router;
