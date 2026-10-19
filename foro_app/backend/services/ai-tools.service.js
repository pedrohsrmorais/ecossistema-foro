/**
 * ai-tools.service.js
 *
 * Define as ferramentas (tool use / function calling) que a IA pode invocar.
 * Cada tool é executada com o contexto do usuário autenticado + account_id.
 *
 * RF-12: create_lead, update_lead, move_lead_stage, add_note, create_task,
 *        complete_task, search_leads, get_lead, get_funnel_summary, list_tasks
 */

const leadsService = require('./leads.service');

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
    description: 'Cria uma tarefa de acompanhamento vinculada a um lead.',
    input_schema: {
      type: 'object',
      properties: {
        lead_id:     { type: 'string' },
        description: { type: 'string' },
        due_date:    { type: 'string', description: 'Data/hora no formato ISO 8601.' },
      },
      required: ['lead_id', 'description'],
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

    default:
      throw new Error(`Tool desconhecida: ${toolName}`);
  }
}

module.exports = { TOOL_DEFINITIONS, executeTool };
