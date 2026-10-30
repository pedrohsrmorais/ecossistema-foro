/**
 * api.routes.js — Mapeamento ÚNICO de todas as rotas da API Foro.
 *
 * Convenção de prefixos:
 *   /api/auth      → autenticação (login, register, refresh)
 *   /api/users     → gestão de usuários da conta
 *   /api/leads     → CRM: leads, notas, tarefas
 *   /api/fields    → campos customizáveis do CRM
 *   /api/ai        → chat IA interno (conversa + tool calls)
 *   /api/payments  → assinatura via Stripe (Checkout + Portal)
 *   /api/webhooks  → webhooks externos (Stripe, NFE.io)
 *   /api/settings  → configurações da conta
 *   /api/admin     → painel administrativo da plataforma (equipe intellsn, cross-tenant)
 */

const router = require('express').Router();

const authController        = require('../controllers/auth.controller');
const usersController       = require('../controllers/users.controller');
const leadsController       = require('../controllers/leads.controller');
const fieldsController      = require('../controllers/fields.controller');
const casesController       = require('../controllers/cases.controller');
const documentsController   = require('../controllers/documents.controller');
const officeTemplates       = require('../controllers/office-templates.controller');
const { requirePermission } = require('../configs/permissions');
const officeController = require('../controllers/office.controller');
const { requireOffice, requireAccess, scoped } = require('../middlewares/office.middleware');
const { countActions } = require('../middlewares/activity.middleware');
const eventsController      = require('../controllers/events.controller');
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
const alertsController      = require('../controllers/alerts.controller');
const supportController     = require('../controllers/support.controller');

const { authenticate, requireAdmin, requireVerifiedEmail } = require('../middlewares/auth.middleware');
const { loginLimiter, registerLimiter, emailFlowLimiter, verifyLimiter, aiLimiter, supportLimiter } = require('../middlewares/rateLimits');
const { loadClientContext }   = require('../middlewares/client.middleware');
const { authenticatePlatform } = require('../middlewares/platform.middleware');
const { requireModule }       = require('../middlewares/modules.middleware');
const { requireLookupsEnabled } = require('../middlewares/features.middleware');
const { validate }            = require('../middlewares/validation.middleware');
const { authValidations, leadValidations, fieldValidations, userValidations } = require('../middlewares/validators');

// ─── Auth (público) ───────────────────────────────────────────────────────────
router.post('/auth/register',      registerLimiter,  validate(authValidations.register),       authController.register);
router.post('/auth/login',         loginLimiter,     validate(authValidations.login),          authController.login);
router.post('/auth/refresh-token', emailFlowLimiter, validate(authValidations.refresh),        authController.refreshToken);
router.post('/auth/forgot-password', emailFlowLimiter, validate(authValidations.forgotPassword), authController.forgotPassword);
router.post('/auth/reset-password',  emailFlowLimiter, validate(authValidations.resetPassword),  authController.resetPassword);
router.post('/auth/platform-login', loginLimiter,                                              authController.platformLogin);

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

// ─── Webhooks (público — sem JWT; Stripe/NFE.io não enviam Bearer token) ───────
// FICA ANTES de router.use(authenticate): se estivesse depois, toda chamada do
// Stripe/NFE.io cairia em 401 e a emissão automática de NFS-e nunca seria disparada.
router.post  ('/webhooks/stripe',      webhooksController.stripe);   // corpo bruto em req.rawBody (server.js) p/ validar Stripe-Signature
router.post  ('/webhooks/nfeio',       webhooksController.nfeio);

// ─── Tudo abaixo exige autenticação de tenant ─────────────────────────────────
router.use(authenticate);
router.use(loadClientContext);

// ─── Verificação de e-mail/celular (OTP) — acessível mesmo sem verificar ──────
router.post('/auth/send-verification', emailFlowLimiter, validate(authValidations.sendVerification), authController.sendVerification);
router.post('/auth/verify-code',       verifyLimiter,    validate(authValidations.verifyCode),       authController.verifyCode);
router.get  ('/users/me',              usersController.me); // exposto antes do gate p/ a tela "Confirme seu e-mail" exibir o e-mail

// ─── A partir daqui, exige e-mail confirmado (ver requireVerifiedEmail) ───────
router.use(requireVerifiedEmail);
router.use(countActions);   // conta ações de escrita por usuário/dia (nível de atividade)
router.use(requireOffice);  // CRM bloqueado até criar/entrar em um escritório (403 OFFICE_REQUIRED)

// ─── Escritório (workspace): dados, código, pedidos de entrada, atividade ─────
router.get   ('/office',                     officeController.get);
router.post  ('/office',                     requireAdmin, officeController.create);          // criação rápida: só o nome é obrigatório
router.put   ('/office',                     requireAdmin, officeController.update);
router.post  ('/office/code/regenerate',     requireAdmin, officeController.regenerateCode);
router.post  ('/office/join',                emailFlowLimiter, officeController.requestJoin);   // entrar por código (aprovação do admin)
router.delete('/office/join',                officeController.cancelRequest);
router.get   ('/office/requests',            requireAdmin, officeController.listRequests);
router.post  ('/office/requests/:id',        requireAdmin, officeController.decide);
router.get   ('/office/activity',            requireAdmin, officeController.activity);
router.post  ('/activity/ping',              officeController.ping);

// ─── Módulos — quais estão ativos para a conta logada (ver modules.service.js) ─
// Usado pelo frontend pra decidir o que mostrar no menu sem precisar tentar
// cada rota e tratar 403 MODULE_DISABLED.
router.get   ('/modules',              modulesController.listForMyAccount);

// ─── Usuários ─────────────────────────────────────────────────────────────────
router.get   ('/users',                usersController.list);
router.post  ('/users/invite',         requireAdmin, validate(userValidations.invite), usersController.invite);   // convida por e-mail (respeita max_users do plano)
router.put   ('/users/me',             usersController.updateMe);
router.put   ('/users/me/password',    validate(authValidations.changePassword), usersController.changePassword);
router.get   ('/users/:id',            usersController.getById);
router.post  ('/users/:id/resend-invite', requireAdmin, usersController.resendInvite);
router.put   ('/users/:id',            requireAdmin, validate(userValidations.update), usersController.update);
router.delete('/users/:id',            requireAdmin, usersController.deactivate);

// ─── Campos customizáveis (módulo "crm") ──────────────────────────────────────
router.get   ('/fields',               requireModule('crm'), fieldsController.list);
router.post  ('/fields',               requireModule('crm'), requireAdmin, validate(fieldValidations.create), fieldsController.create);
router.put   ('/fields/reorder',       requireModule('crm'), requireAdmin, fieldsController.reorder);   // ANTES de /fields/:id, senão "reorder" vira um :id
router.put   ('/fields/:id',           requireModule('crm'), requireAdmin, validate(fieldValidations.update), fieldsController.update);
router.delete('/fields/:id',           requireModule('crm'), requireAdmin, fieldsController.remove);

// ─── Leads (módulo "crm") ──────────────────────────────────────────────────────
router.get   ('/leads',                requireModule('crm'), requireAccess('leads'), scoped('leads'), leadsController.list);
router.post  ('/leads',                requireModule('crm'), requireAccess('leads'), validate(leadValidations.create), leadsController.create);
router.get   ('/leads/funnel',         requireModule('crm'), requireAccess('leads'), scoped('leads'), leadsController.getFunnelSummary);
router.get   ('/leads/:id',            requireModule('crm'), requireAccess('leads'), scoped('leads'), leadsController.getById);
router.put   ('/leads/:id',            requireModule('crm'), requireAccess('leads'), scoped('leads'), leadsController.update);
router.patch ('/leads/:id/stage',      requireModule('crm'), requireAccess('leads'), scoped('leads'), leadsController.moveStage);
router.patch ('/leads/:id/archive',    requireModule('crm'), requireAccess('leads'), scoped('leads'), leadsController.archive);
router.delete('/leads/:id',            requireModule('crm'), requireAccess('leads'), scoped('leads'), leadsController.softDelete);

// Notas do lead
router.get   ('/leads/:id/notes',      requireModule('crm'), requireAccess('leads'), scoped('leads'), leadsController.listNotes);
router.post  ('/leads/:id/notes',      requireModule('crm'), requireAccess('leads'), scoped('leads'), leadsController.addNote);
router.delete('/leads/:leadId/notes/:noteId', requireModule('crm'), requireAccess('leads'), scoped('leads', 'leadId'), leadsController.deleteNote);

// Tarefas do lead
router.get   ('/leads/:id/tasks',      requireModule('crm'), requireAccess('leads'), scoped('leads'), leadsController.listTasks);
router.post  ('/leads/:id/tasks',      requireModule('crm'), requireAccess('leads'), scoped('leads'), leadsController.createTask);
router.patch ('/leads/:leadId/tasks/:taskId/complete', requireModule('crm'), requireAccess('leads'), scoped('leads', 'leadId'), leadsController.completeTask);

// ─── Tarefas (visão global, módulo "crm") ──────────────────────────────────────
router.get('/tasks',                   requireModule('crm'), requireAccess('agenda'), leadsController.listAllTasks);
router.post('/tasks',                  requireModule('crm'), requireAccess('agenda'), leadsController.createGlobalTask);   // tarefa/prazo com ou sem lead

// ─── Processos (módulo "crm") — número CNJ, link do tribunal, andamentos ──────
router.get   ('/cases',                requireModule('crm'), requireAccess('cases'), scoped('cases'), casesController.list);
router.post  ('/cases',                requireModule('crm'), requireAccess('cases'), casesController.create);
router.get   ('/cases/analyze',        requireModule('crm'), requireAccess('cases'), casesController.analyze);
router.get   ('/cases/:id',            requireModule('crm'), requireAccess('cases'), scoped('cases'), casesController.getById);
router.put   ('/cases/:id',            requireModule('crm'), requireAccess('cases'), scoped('cases'), casesController.update);
router.delete('/cases/:id',            requireModule('crm'), requireAccess('cases'), scoped('cases'), requirePermission('delete_records'), casesController.remove);
router.get   ('/permissions',          officeController.permissionDefs);
router.get   ('/office-templates',     requireModule('crm'), requireAccess('documents'), officeTemplates.list);
router.post  ('/office-templates',     requireModule('crm'), requireAccess('documents'), requirePermission('templates_manage'), officeTemplates.create);
router.post  ('/office-templates/check',   requireModule('crm'), requireAccess('documents'), requirePermission('templates_manage'), officeTemplates.check);
router.post  ('/office-templates/extract', requireModule('crm'), requireAccess('documents'), requirePermission('templates_manage'), officeTemplates.extract);
router.post  ('/office-templates/convert', requireModule('crm'), requireAccess('documents'), requirePermission('templates_manage'), aiLimiter, officeTemplates.convert);
router.get   ('/office-templates/:id', requireModule('crm'), requireAccess('documents'), officeTemplates.get);
router.put   ('/office-templates/:id', requireModule('crm'), requireAccess('documents'), requirePermission('templates_manage'), officeTemplates.update);
router.delete('/office-templates/:id', requireModule('crm'), requireAccess('documents'), requirePermission('templates_manage'), officeTemplates.remove);
router.get   ('/document-templates',   requireModule('crm'), requireAccess('documents'), documentsController.listTemplates);
router.get   ('/documents',            requireModule('crm'), requireAccess('documents'), scoped('documents'), documentsController.list);
router.post  ('/documents',            requireModule('crm'), requireAccess('documents'), documentsController.create);
router.get   ('/documents/:id',        requireModule('crm'), requireAccess('documents'), scoped('documents'), documentsController.getById);
router.put   ('/documents/:id',        requireModule('crm'), requireAccess('documents'), scoped('documents'), documentsController.update);
router.delete('/documents/:id',        requireModule('crm'), requireAccess('documents'), scoped('documents'), requirePermission('delete_records'), documentsController.remove);
router.post  ('/documents/:id/draft',  requireModule('crm'), requireAccess('documents'), scoped('documents'), requirePermission('ai_drafts'), aiLimiter, documentsController.draft);
router.get   ('/documents/:id/export.docx', requireModule('crm'), requireAccess('documents'), scoped('documents'), documentsController.exportDocx);
router.get   ('/documents/:id/versions/:n', requireModule('crm'), requireAccess('documents'), scoped('documents'), documentsController.getVersion);
router.post  ('/documents/:id/versions/:n/restore', requireModule('crm'), requireAccess('documents'), scoped('documents'), documentsController.restore);
router.get   ('/areas',                requireModule('crm'), casesController.areasMeta);
router.get   ('/case-stages',          requireModule('crm'), casesController.stagesList);
router.post  ('/case-stages',          requireModule('crm'), requireAdmin, casesController.stagesCreate);
router.put   ('/case-stages/reorder',  requireModule('crm'), requireAdmin, casesController.stagesReorder);
router.post  ('/case-stages/reset',    requireModule('crm'), requireAdmin, casesController.stagesReset);
router.put   ('/case-stages/:id',      requireModule('crm'), requireAdmin, casesController.stagesUpdate);
router.delete('/case-stages/:id',      requireModule('crm'), requireAdmin, casesController.stagesRemove);
router.put   ('/cases/:id/stage',      requireModule('crm'), requireAccess('cases'), scoped('cases'), casesController.moveStage);
router.get   ('/cases/:id/parties',    requireModule('crm'), requireAccess('cases'), scoped('cases'), casesController.listParties);
router.post  ('/cases/:id/parties',    requireModule('crm'), requireAccess('cases'), scoped('cases'), casesController.addParty);
router.put   ('/cases/:id/parties/:partyId',    requireModule('crm'), requireAccess('cases'), scoped('cases'), casesController.updateParty);
router.delete('/cases/:id/parties/:partyId',    requireModule('crm'), requireAccess('cases'), scoped('cases'), casesController.removeParty);
router.get   ('/cases/:id/members',    requireModule('crm'), requireAccess('cases'), scoped('cases'), casesController.listMembers);
router.put   ('/cases/:id/members',    requireModule('crm'), requireAccess('cases'), scoped('cases'), casesController.setMembers);
router.post  ('/cases/:id/updates',    requireModule('crm'), requireAccess('cases'), scoped('cases'), casesController.addUpdate);
router.delete('/cases/:id/updates/:updateId', requireModule('crm'), requireAccess('cases'), scoped('cases'), casesController.deleteUpdate);

// ─── Agenda (módulo "crm") — reuniões/audiências com link ──────────────────────
router.get   ('/events',               requireModule('crm'), requireAccess('agenda'), eventsController.list);
router.post  ('/events',               requireModule('crm'), requireAccess('agenda'), eventsController.create);
router.put   ('/events/:id',           requireModule('crm'), requireAccess('agenda'), eventsController.update);
router.delete('/events/:id',           requireModule('crm'), requireAccess('agenda'), eventsController.remove);

// ─── Alertas de prazo (módulo "crm") — sino do app, painel e resumo diário por e-mail ─────
router.get ('/alerts',               requireModule('crm'), alertsController.summary);
router.get ('/alerts/preferences',   requireModule('crm'), alertsController.getPrefs);
router.put ('/alerts/preferences',   requireModule('crm'), alertsController.setPrefs);
router.post('/alerts/digest/test',   requireModule('crm'), emailFlowLimiter, alertsController.sendTest);

// ─── Painel ────────────────────────────────────────────────────────────────────
router.get('/dashboard',             requireModule('crm'), supportController.dashboardOverview);

// ─── Suporte (liberado mesmo com teste/assinatura encerrados: quem não consegue assinar precisa de ajuda) ──
router.get ('/support',              supportController.info);
router.get ('/support/tickets',      supportController.list);
router.post('/support/tickets',      supportLimiter, supportController.create);

// ─── IA — Chat interno (módulo "crm") ──────────────────────────────────────────
router.post  ('/ai/message',           requireModule('crm'), requireAccess('ai'), aiLimiter, aiController.sendMessage);
router.get   ('/ai/conversations',     requireModule('crm'), requireAccess('ai'), aiController.listConversations);
router.get   ('/ai/conversations/:id', requireModule('crm'), requireAccess('ai'), aiController.getConversation);
router.delete('/ai/conversations/:id', requireModule('crm'), requireAccess('ai'), aiController.clearConversation);
router.get   ('/ai/credits',           requireModule('crm'), aiController.getCredits);
router.get   ('/ai/usage',             requireModule('crm'), aiController.getUsage);

// ─── Pagamentos ───────────────────────────────────────────────────────────────
router.get   ('/payments',             paymentsController.list);
router.post  ('/payments/checkout',   requireAdmin, paymentsController.checkout);   // Stripe Checkout (cartão) → { url }
router.post  ('/payments/portal',     requireAdmin, paymentsController.portal);     // Portal do Cliente do Stripe → { url }
router.get   ('/payments/:id',         paymentsController.getById);
router.get   ('/payments/:id/nfse',    paymentsController.getNfse);

// ─── Configurações da conta ───────────────────────────────────────────────────
router.get   ('/settings',             settingsController.get);
router.put   ('/settings',             requireAdmin, settingsController.update);
router.get   ('/settings/plan',        settingsController.getPlan);
router.get   ('/plans',                settingsController.listPlans);

// ─── Créditos — carteira pré-paga p/ serviços pagos de terceiros ──────────────
router.get   ('/credits/balance',          creditsController.getBalance);
router.get   ('/credits/prices',           creditsController.listPrices);
router.get   ('/credits/transactions',     creditsController.listTransactions);

// ─── Consultas pagas (CPF/CNPJ/processual) e resumo por IA ────────────────────
// Cada chamada debita créditos automaticamente (ver external-lookup.service.js).
// Erro de provedor -> reembolso automático + mensagem genérica "chame o suporte";
// NÃO existe endpoint de reembolso solicitado pelo usuário (ver credits.service.js).
router.post  ('/lookup/cnpj',              requireLookupsEnabled, requireModule('pesquisa_cpf_cnpj'),   lookupController.cnpj);
router.post  ('/lookup/cpf',               requireLookupsEnabled, requireModule('pesquisa_cpf_cnpj'),   lookupController.cpf);
router.post  ('/lookup/processo',          requireLookupsEnabled, requireModule('pesquisa_processual'), lookupController.processo);
router.post  ('/lookup/processo/summary',  requireLookupsEnabled, requireModule('pesquisa_processual'), lookupController.processoSummary);

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
