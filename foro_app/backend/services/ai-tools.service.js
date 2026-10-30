/**
 * ai-tools.service.js
 *
 * Define as ferramentas (tool use / function calling) que a IA pode invocar.
 * Cada tool é executada com o contexto do usuário autenticado + account_id.
 *
 * RF-12 (+ processos e agenda): create_lead, update_lead, move_lead_stage, add_note, create_task,
 *        complete_task, search_leads, get_lead, get_funnel_summary, list_tasks
 */

const leadsService = require('./leads.service');
const casesService = require('./cases.service');
const caseContext = require('./case-context.service');
const partiesService = require('./case-parties.service');
const documentsService = require('./documents.service');
const templatesService = require('./document-templates.service');
const legalAreas = require('../configs/legal-areas');
const eventsService = require('./events.service');

// ─── Definição das tools (formato Anthropic) ─────────────────────────────────

const TOOL_DEFINITIONS = [
  {
    name: 'create_lead',
    description: 'Cria um novo lead no CRM com os campos informados. Use quando o usuário quiser cadastrar um novo contato ou cliente potencial.',
    input_schema: {
      type: 'object',
      properties: {
        name:           { type: 'string', description: 'Nome completo do lead.' },
        phone:          { type: 'string', description: 'Telefone do lead (com DDD).' },
        email:          { type: 'string', description: 'E-mail do lead.' },
        stage:          { type: 'string', description: 'Etapa no funil. Padrão: novo.' },
        custom_fields:  { type: 'object', description: 'Campos personalizados da conta. Chave = nome do campo.' },
      },
      required: [],
    },
  },
  {
    name: 'update_lead',
    description: 'Atualiza campos de um lead existente.',
    input_schema: {
      type: 'object',
      properties: {
        lead_id:       { type: 'string', description: 'ID do lead.' },
        name:          { type: 'string' },
        phone:         { type: 'string' },
        email:         { type: 'string' },
        custom_fields: { type: 'object' },
      },
      required: ['lead_id'],
    },
  },
  {
    name: 'move_lead_stage',
    description: 'Move um lead para uma etapa diferente do funil.',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string', description: 'ID do lead.' },
        stage:   { type: 'string', description: 'Nova etapa (ex: novo, em_contato, proposta, convertido, encerrado).' },
      },
      required: ['lead_id', 'stage'],
    },
  },
  {
    name: 'add_note',
    description: 'Adiciona uma nota interna a um lead.',
    input_schema: {
      type: 'object',
      properties: {
        lead_id: { type: 'string' },
        text:    { type: 'string', description: 'Texto da nota.' },
      },
      required: ['lead_id', 'text'],
    },
  },
  {
    name: 'create_task',
    description: 'Cria tarefa ou prazo (lead e/ou processo opcionais).',
    input_schema: {
      type: 'object',
      properties: {
        lead_id:     { type: 'string' },
        case_id:     { type: 'string', description: 'ID do processo (opcional).' },
        description: { type: 'string' },
        due_date:    { type: 'string', description: 'Data/hora ISO 8601.' },
        is_deadline: { type: 'boolean', description: 'true se for prazo processual.' },
      },
      required: ['description'],
    },
  },
  {
    name: 'complete_task',
    description: 'Marca uma tarefa como concluída.',
    input_schema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
    },
  },
  {
    name: 'search_leads',
    description: 'Busca e lista leads com filtros. Use para consultas como "quais leads estão na etapa X", "leads sem contato há N dias", etc.',
    input_schema: {
      type: 'object',
      properties: {
        search:   { type: 'string',  description: 'Texto livre para busca por nome, telefone ou e-mail.' },
        stage:    { type: 'string',  description: 'Filtrar por etapa do funil.' },
        assigned: { type: 'string',  description: 'ID do usuário responsável.' },
        limit:    { type: 'integer', description: 'Máximo de resultados. Padrão: 20.' },
      },
    },
  },
  {
    name: 'get_lead',
    description: 'Retorna todos os dados de um lead específico, incluindo campos customizados, notas e tarefas.',
    input_schema: {
      type: 'object',
      properties: { lead_id: { type: 'string' } },
      required: ['lead_id'],
    },
  },
  {
    name: 'get_funnel_summary',
    description: 'Retorna o resumo do funil: quantidade de leads por etapa.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_tasks',
    description: 'Lista tarefas pendentes ou todas as tarefas do escritório.',
    input_schema: {
      type: 'object',
      properties: {
        pending_only: { type: 'boolean', description: 'Se true, retorna apenas tarefas não concluídas.' },
        limit:        { type: 'integer' },
      },
    },
  },
  {
    name: 'create_case',
    description: 'Cadastra um processo. O número CNJ é validado e o tribunal identificado.',
    input_schema: {
      type: 'object',
      properties: {
        case_number: { type: 'string', description: 'Número CNJ NNNNNNN-DD.AAAA.J.TR.OOOO.' },
        title: { type: 'string' }, lead_id: { type: 'string', description: 'ID do cliente/contato.' },
        area: { type: 'string' }, court_url: { type: 'string', description: 'Link do processo no tribunal.' },
        opposing_party: { type: 'string' }, client_role: { type: 'string', description: 'autor, réu...' },
        area_key: { type: 'string', enum: ["geral", "civel", "trabalhista", "criminal", "contratacoes_publicas", "consultivo"], description: 'Área do processo (define etapas do kanban e campos específicos).' },
        comarca: { type: 'string' }, vara: { type: 'string' }, magistrate: { type: 'string', description: 'Magistrado(a).' },
        details: { type: 'object', description: 'Campos específicos da área (chaves de get_case.area_details). Só use chaves que existam.' },
      },
    },
  },
  {
    name: 'search_cases',
    description: 'Lista processos (filtros opcionais).',
    input_schema: {
      type: 'object',
      properties: { search: { type: 'string' }, status: { type: 'string', description: 'ativo, suspenso, arquivado, encerrado' }, lead_id: { type: 'string' } },
    },
  },
  {
    name: 'get_case',
    description: 'Visão completa de um processo: dados, partes, equipe, andamentos, prazos, campos da área, orientação técnica e as ÚNICAS referências legais que podem ser citadas (legal_refs_allowed).',
    input_schema: { type: 'object', properties: { case_id: { type: 'string' } }, required: ['case_id'] },
  },
  {
    name: 'update_case',
    description: 'Atualiza processo (status, fase, link, título, parte contrária, comarca, vara, magistrado, campos da área).',
    input_schema: {
      type: 'object',
      properties: {
        case_id: { type: 'string' }, status: { type: 'string' }, phase: { type: 'string' }, court_url: { type: 'string' },
        title: { type: 'string' }, area: { type: 'string' }, opposing_party: { type: 'string' },
        area_key: { type: 'string', enum: ["geral", "civel", "trabalhista", "criminal", "contratacoes_publicas", "consultivo"] }, comarca: { type: 'string' }, vara: { type: 'string' }, magistrate: { type: 'string' },
        details: { type: 'object', description: 'Campos específicos da área a atualizar (mescla com os atuais).' },
      },
      required: ['case_id'],
    },
  },
  {
    name: 'add_party',
    description: 'Adiciona uma parte ao processo (cliente, réu, empregador, testemunha etc.). Não invente dados pessoais: envie só o que o usuário informou.',
    input_schema: {
      type: 'object',
      properties: {
        case_id: { type: 'string' }, name: { type: 'string' },
        role: { type: 'string', enum: Object.keys(partiesService.ROLES) },
        document: { type: 'string', description: 'CPF ou CNPJ (somente se informado).' }, email: { type: 'string' }, phone: { type: 'string' }, address: { type: 'string' },
        nationality: { type: 'string' }, marital_status: { type: 'string' }, profession: { type: 'string' },
      },
      required: ['case_id', 'name', 'role'],
    },
  },
  {
    name: 'list_document_templates',
    description: 'Lista os modelos de documento disponíveis (petições, ETP, TR etc.), opcionalmente por área.',
    input_schema: { type: 'object', properties: { area_key: { type: 'string' } } },
  },
  {
    name: 'create_document',
    description: 'Cria um documento (rascunho) a partir de um modelo, já preenchido com os dados do processo. A redação dos trechos pela IA é feita na tela Documentos; avise o usuário.',
    input_schema: {
      type: 'object',
      properties: { template_key: { type: 'string' }, case_id: { type: 'string' }, title: { type: 'string' } },
      required: ['template_key'],
    },
  },
  {
    name: 'add_case_update',
    description: 'Registra um andamento na linha do tempo do processo.',
    input_schema: {
      type: 'object',
      properties: { case_id: { type: 'string' }, text: { type: 'string' }, update_date: { type: 'string', description: 'AAAA-MM-DD (padrão: hoje).' } },
      required: ['case_id', 'text'],
    },
  },
  {
    name: 'create_event',
    description: 'Agenda reunião, audiência ou perícia, com link de reunião opcional.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string' }, starts_at: { type: 'string', description: 'ISO 8601 com fuso -03:00.' }, ends_at: { type: 'string' },
        type: { type: 'string', description: 'reuniao, audiencia, pericia, outro' },
        meeting_url: { type: 'string' }, location: { type: 'string' }, notes: { type: 'string' },
        lead_id: { type: 'string' }, case_id: { type: 'string' },
      },
      required: ['title', 'starts_at'],
    },
  },
  {
    name: 'update_event',
    description: 'Altera um compromisso da agenda (título, horário, link, local, status: agendado, realizado, cancelado). Use list_events para achar o id.',
    input_schema: {
      type: 'object',
      properties: {
        event_id: { type: 'string' }, title: { type: 'string' }, starts_at: { type: 'string' }, ends_at: { type: 'string' },
        type: { type: 'string' }, meeting_url: { type: 'string' }, location: { type: 'string' }, notes: { type: 'string' },
        status: { type: 'string', description: 'agendado, realizado ou cancelado' },
      },
      required: ['event_id'],
    },
  },
  {
    name: 'delete_event',
    description: 'Exclui um compromisso da agenda. Só use com pedido claro do usuário (o usuário pode desfazer depois no Log da IA).',
    input_schema: { type: 'object', properties: { event_id: { type: 'string' } }, required: ['event_id'] },
  },
  {
    name: 'update_task',
    description: 'Altera uma tarefa/prazo: descrição, data, se é prazo processual, ou reabre/conclui (completed true/false). Use list_tasks para achar o id.',
    input_schema: {
      type: 'object',
      properties: { task_id: { type: 'string' }, description: { type: 'string' }, due_date: { type: 'string', description: 'ISO 8601 ou vazio para remover a data.' }, is_deadline: { type: 'boolean' }, completed: { type: 'boolean' } },
      required: ['task_id'],
    },
  },
  {
    name: 'delete_task',
    description: 'Exclui uma tarefa. Só com pedido claro do usuário (pode ser desfeito no Log da IA).',
    input_schema: { type: 'object', properties: { task_id: { type: 'string' } }, required: ['task_id'] },
  },
  {
    name: 'delete_lead',
    description: 'Envia um lead para a lixeira (exclusão lógica). Só com pedido claro do usuário (pode ser desfeito no Log da IA).',
    input_schema: { type: 'object', properties: { lead_id: { type: 'string' } }, required: ['lead_id'] },
  },
  {
    name: 'list_events',
    description: 'Lista compromissos da agenda num período (padrão: próximos 14 dias).',
    input_schema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } } },
  },
];

// ─── Execução das tools ───────────────────────────────────────────────────────

async function executeTool(toolName, toolInput, context) {
  const { accountId, userId } = context;
  const channel = 'ai_chat';

  switch (toolName) {
    case 'create_lead':
      return leadsService.create(accountId, userId, toolInput, channel);

    case 'update_lead': {
      const { lead_id, ...rest } = toolInput;
      return leadsService.update(lead_id, accountId, userId, rest, channel);
    }

    case 'move_lead_stage':
      return leadsService.moveStage(toolInput.lead_id, accountId, userId, toolInput.stage, channel);

    case 'add_note':
      return leadsService.addNote(toolInput.lead_id, accountId, userId, toolInput.text, channel);

    case 'create_task':
      return leadsService.createTask(toolInput.lead_id, accountId, userId, {
        description: toolInput.description,
        due_date: toolInput.due_date,
        case_id: toolInput.case_id,
        is_deadline: toolInput.is_deadline,
      });

    case 'complete_task':
      return leadsService.completeTask(toolInput.task_id, accountId, userId);

    case 'search_leads':
      return leadsService.list(accountId, {
        search: toolInput.search,
        stage:  toolInput.stage,
        assigned: toolInput.assigned,
        limit: toolInput.limit || 20,
      });

    case 'get_lead':
      return leadsService.getById(toolInput.lead_id, accountId);

    case 'get_funnel_summary':
      return leadsService.getFunnelSummary(accountId);

    case 'list_tasks':
      return leadsService.listAllTasks(accountId, userId, {
        pendingOnly: toolInput.pending_only !== false,
        limit: toolInput.limit || 20,
      });

    case 'create_case':
      return casesService.create(accountId, userId, toolInput);
    case 'search_cases':
      return casesService.list(accountId, { search: toolInput.search, status: toolInput.status, lead_id: toolInput.lead_id, limit: 20 });
    case 'get_case':
      return caseContext.build(toolInput.case_id, accountId);
    case 'add_party': {
      const { case_id, ...p } = toolInput;
      return partiesService.add(case_id, accountId, p);
    }
    case 'list_document_templates':
      return templatesService.list(toolInput.area_key, accountId);
    case 'create_document': {
      const doc = await documentsService.create(accountId, { id: userId }, toolInput);
      return { id: doc.id, title: doc.title, status: doc.status, open_flags: doc.open_flags, pending_ai_slots: doc.pending_ai_slots };
    }
    case 'update_case': {
      const { case_id, ...rest } = toolInput;
      return casesService.update(case_id, accountId, rest);
    }
    case 'add_case_update':
      return casesService.addUpdate(toolInput.case_id, accountId, userId, toolInput, 'ai_chat');
    case 'create_event':
      return eventsService.create(accountId, userId, toolInput);
    case 'update_event': {
      const { event_id, ...rest } = toolInput;
      return eventsService.update(event_id, accountId, rest);
    }
    case 'delete_event':
      await eventsService.remove(toolInput.event_id, accountId);
      return { id: toolInput.event_id, deleted: true };
    case 'update_task': {
      const { task_id, ...rest } = toolInput;
      return leadsService.updateTask(task_id, accountId, rest);
    }
    case 'delete_task':
      return leadsService.removeTask(toolInput.task_id, accountId);
    case 'delete_lead':
      await leadsService.softDelete(toolInput.lead_id, accountId, userId);
      return { id: toolInput.lead_id, deleted: true };
    case 'list_events': {
      const from = toolInput.from || new Date().toISOString();
      const to = toolInput.to || new Date(Date.now() + 14 * 864e5).toISOString();
      return eventsService.list(accountId, { from, to });
    }

    default:
      throw new Error(`Tool desconhecida: ${toolName}`);
  }
}

module.exports = { TOOL_DEFINITIONS, executeTool };
