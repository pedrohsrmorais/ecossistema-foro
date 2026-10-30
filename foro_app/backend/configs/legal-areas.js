/**
 * legal-areas.js — especialidades do Foro ("plugins de área" da visão de produto).
 *
 * O núcleo (processo, partes, responsáveis, prazos, agenda, documentos) é o mesmo para todas as áreas.
 * Cada área acrescenta:
 *   - etapas padrão do kanban (editáveis depois por conta, em case_stages);
 *   - campos específicos (gravados em cases.details, validados por este schema);
 *   - referências legais CURADAS (`refs`): é a ÚNICA fonte que a IA pode citar nos insights e rascunhos;
 *   - um roteiro técnico (`guidance`) com o que olhar no processo e quais riscos conferir.
 *
 * Por que referências curadas? Para evitar alucinação: a IA não "lembra" artigo de lei; ela só recebe, daqui,
 * dispositivos que a equipe do Foro escolheu. Pedir uma citação fora da lista vira "CONFERIR" (ver document-guard.js).
 * Todas as referências são normas públicas; revise-as com o seu escritório antes de depender delas.
 *
 * Para acrescentar uma área: crie a chave aqui, ponha modelos em templates/documentos/<chave>/ e pronto.
 */

const AREAS = {
  geral: {
    label: 'Geral / outras áreas',
    short: 'Geral',
    description: 'Processos e casos sem especialidade definida.',
    stages: [
      ['novo', 'Novo', '#0ea5e9'], ['em_andamento', 'Em andamento', '#f59e0b'],
      ['aguardando', 'Aguardando prazo/decisão', '#8b5cf6'], ['concluido', 'Concluído', '#22c55e', true],
    ],
    fields: [],
    refs: [],
    guidance: 'Sem roteiro específico: use apenas os dados do processo e peça ao usuário as informações que faltarem.',
  },

  civel: {
    label: 'Contencioso cível',
    short: 'Cível',
    description: 'Atendimento → análise → peça → protocolo → monitoramento → execução.',
    stages: [
      ['atendimento', 'Atendimento', '#0ea5e9'], ['analise', 'Análise', '#6366f1'], ['elaboracao', 'Elaboração da peça', '#f59e0b'],
      ['protocolo', 'Protocolo', '#8b5cf6'], ['monitoramento', 'Monitoramento', '#14b8a6'], ['execucao', 'Execução / cumprimento', '#ef4444'],
      ['encerrado', 'Encerrado', '#22c55e', true],
    ],
    fields: [
      { key: 'procedimento', label: 'Procedimento', type: 'select', options: ['Comum', 'Juizado Especial Cível', 'Execução de título extrajudicial', 'Cumprimento de sentença', 'Monitória', 'Tutela antecedente', 'Outro'] },
      { key: 'natureza', label: 'Natureza da ação', type: 'text', help: 'Ex.: indenizatória, cobrança, obrigação de fazer, revisional.' },
      { key: 'fase_processual', label: 'Fase processual', type: 'select', options: ['Postulatória', 'Saneamento', 'Instrução', 'Sentença', 'Recursal', 'Cumprimento / execução'] },
      { key: 'tutela_urgencia', label: 'Tutela de urgência', type: 'select', options: ['Não pleiteada', 'Pleiteada', 'Deferida', 'Indeferida'] },
      { key: 'gratuidade', label: 'Gratuidade da justiça', type: 'select', options: ['Não', 'Requerida', 'Deferida', 'Indeferida'] },
      { key: 'audiencia_conciliacao', label: 'Audiência de conciliação/mediação', type: 'select', options: ['Não designada', 'Designada', 'Realizada', 'Dispensada pelas partes'] },
      { key: 'data_sentenca', label: 'Data da sentença', type: 'date' },
      { key: 'valor_condenacao', label: 'Valor da condenação (R$)', type: 'number' },
      { key: 'acordo', label: 'Acordo / proposta', type: 'textarea' },
    ],
    refs: [
      { id: 'CPC art. 219', note: 'Na contagem de prazo em dias, computam-se somente os dias úteis.' },
      { id: 'CPC art. 1.003, §5º', note: 'Prazo de 15 dias para recursos e respectivas respostas, exceto embargos de declaração (5 dias).' },
      { id: 'CPC art. 1.023', note: 'Embargos de declaração: 5 dias.' },
      { id: 'CPC art. 335', note: 'Contestação: 15 dias, contados conforme os incisos do artigo.' },
      { id: 'CPC art. 319', note: 'Requisitos da petição inicial.' },
      { id: 'CPC art. 320', note: 'Documentos indispensáveis à propositura da ação.' },
      { id: 'CPC art. 292', note: 'Valor da causa.' },
      { id: 'CPC art. 300', note: 'Tutela de urgência: probabilidade do direito e perigo de dano ou risco ao resultado útil do processo.' },
      { id: 'CPC art. 334', note: 'Audiência de conciliação ou de mediação.' },
      { id: 'CPC art. 98', note: 'Gratuidade da justiça.' },
      { id: 'CPC art. 523', note: 'Cumprimento de sentença de pagamento de quantia: prazo de 15 dias para pagamento voluntário; após, multa e honorários de 10%.' },
      { id: 'CPC art. 1.010', note: 'Requisitos da apelação.' },
      { id: 'CPC art. 1.016', note: 'Requisitos do agravo de instrumento.' },
    ],
    guidance: `Ao analisar um processo cível, confira nesta ordem:
1) Fase e prazos: qual foi o último ato (citação, contestação, decisão, sentença) e qual prazo ele abre; lembre que prazos em dias são contados em dias úteis.
2) Valor da causa e coerência com o pedido; documentos indispensáveis juntados.
3) Tutela de urgência: se pleiteada, se há prova do perigo de dano; se indeferida, se cabe agravo de instrumento.
4) Audiência de conciliação: se designada e quem precisa comparecer.
5) Em cumprimento de sentença: trânsito em julgado, valor atualizado e prazo de 15 dias para pagamento voluntário.
6) Gratuidade: se requerida/indeferida, risco de custas e necessidade de comprovação.`,
  },

  trabalhista: {
    label: 'Trabalhista / previdenciário',
    short: 'Trabalhista',
    description: 'Documentação → cálculos → análise → pedidos/defesa → andamento.',
    stages: [
      ['documentacao', 'Documentação', '#0ea5e9'], ['calculos', 'Cálculos', '#6366f1'], ['analise', 'Análise', '#f59e0b'],
      ['pedidos_defesa', 'Pedidos / defesa', '#8b5cf6'], ['andamento', 'Andamento', '#14b8a6'], ['execucao', 'Execução', '#ef4444'],
      ['encerrado', 'Encerrado', '#22c55e', true],
    ],
    fields: [
      { key: 'polo', label: 'Nosso cliente é', type: 'select', options: ['Reclamante (empregado)', 'Reclamada (empregador)'] },
      { key: 'rito', label: 'Rito', type: 'select', options: ['Ordinário', 'Sumaríssimo', 'Sumário (alçada)'] },
      { key: 'data_admissao', label: 'Data de admissão', type: 'date' },
      { key: 'data_demissao', label: 'Data de demissão / término', type: 'date' },
      { key: 'funcao', label: 'Função', type: 'text' },
      { key: 'ultimo_salario', label: 'Último salário (R$)', type: 'number' },
      { key: 'tipo_rescisao', label: 'Tipo de rescisão', type: 'select', options: ['Sem justa causa', 'Justa causa', 'Pedido de demissão', 'Rescisão indireta', 'Acordo (CLT art. 484-A)', 'Término de contrato', 'Vínculo ainda ativo', 'Outro'] },
      { key: 'jornada', label: 'Jornada', type: 'text', help: 'Ex.: 8h às 18h, 1h de intervalo, de segunda a sábado.' },
      { key: 'verbas', label: 'Verbas / temas em discussão', type: 'multiselect', options: ['Reconhecimento de vínculo', 'Horas extras', 'Adicional noturno', 'Insalubridade', 'Periculosidade', 'FGTS e multa', 'Verbas rescisórias', 'Equiparação salarial', 'Danos morais', 'Acidente / doença ocupacional', 'Estabilidade', 'Outro'] },
      { key: 'audiencia_tipo', label: 'Audiência', type: 'select', options: ['Não designada', 'Una', 'Inicial', 'Instrução', 'Conciliação'] },
      { key: 'deposito_recursal', label: 'Depósito recursal (R$)', type: 'number' },
    ],
    refs: [
      { id: 'CF art. 7º, XXIX', note: 'Prescrição quinquenal para créditos trabalhistas, até o limite de 2 anos após a extinção do contrato.' },
      { id: 'CLT art. 775', note: 'Os prazos processuais são contados em dias úteis.' },
      { id: 'CLT art. 840, §1º', note: 'Reclamação escrita: juízo, qualificação das partes, breve exposição dos fatos, pedido certo, determinado e com indicação de valor, data e assinatura.' },
      { id: 'CLT art. 844', note: 'Ausência do reclamante: arquivamento; ausência do reclamado: revelia e confissão quanto à matéria de fato.' },
      { id: 'CLT art. 847', note: 'Defesa apresentada em audiência (20 minutos) ou pelo sistema eletrônico.' },
      { id: 'CLT art. 895', note: 'Recurso ordinário para a instância superior.' },
      { id: 'CLT art. 899', note: 'Recursos e depósito recursal.' },
      { id: 'CLT art. 791-A', note: 'Honorários de sucumbência (entre 5% e 15%).' },
      { id: 'CLT art. 477', note: 'Rescisão: prazo para pagamento das verbas rescisórias.' },
      { id: 'CLT art. 484-A', note: 'Rescisão por acordo entre empregado e empregador.' },
      { id: 'CLT art. 59', note: 'Duração diária da jornada e limite de horas extras.' },
      { id: 'CLT art. 192', note: 'Adicional de insalubridade.' },
      { id: 'CLT art. 193', note: 'Adicional de periculosidade.' },
    ],
    guidance: `Ao analisar um caso trabalhista, confira nesta ordem:
1) Prescrição: compare a data de demissão/término com a data de ajuizamento (ou hoje). A bienal conta da extinção do contrato; a quinquenal retroage 5 anos da propositura. Diga que é uma estimativa a confirmar.
2) Pedidos líquidos: na reclamação, cada pedido deve ser certo, determinado e com valor indicado; aponte pedidos sem valor.
3) Rescisão: o tipo de rescisão define quais verbas são devidas; confira coerência com as verbas em discussão.
4) Jornada: horas extras dependem da jornada contratual e da prova de controle de ponto; sinalize a falta de dados de jornada.
5) Audiência: ausência tem consequência (arquivamento ou revelia); lembre quem deve comparecer.
6) Recurso: confira prazo (dias úteis) e o depósito recursal quando o cliente é o empregador.
Se o cliente for empregador, destaque risco de revelia e de passivo por verbas sem prova documental.`,
  },

  criminal: {
    label: 'Criminal',
    short: 'Criminal',
    description: 'Atendimento → investigação/ação penal → medidas → audiências → recursos → execução.',
    stages: [
      ['atendimento', 'Atendimento / urgência', '#ef4444'], ['investigacao', 'Investigação / ação penal', '#6366f1'], ['medidas', 'Medidas e liberdade', '#f59e0b'],
      ['audiencias', 'Audiências', '#8b5cf6'], ['recursos', 'Recursos', '#14b8a6'], ['execucao', 'Execução penal', '#0ea5e9'],
      ['encerrado', 'Encerrado', '#22c55e', true],
    ],
    fields: [
      { key: 'fase', label: 'Fase', type: 'select', options: ['Inquérito policial', 'Denúncia / queixa', 'Instrução', 'Plenário do Júri', 'Sentença', 'Recurso', 'Execução penal'] },
      { key: 'polo', label: 'Nosso cliente é', type: 'select', options: ['Investigado / réu', 'Vítima / assistente de acusação', 'Querelante'] },
      { key: 'tipificacao', label: 'Tipificação (artigos)', type: 'text', help: 'Ex.: art. 155 do CP. Informe como consta na denúncia.' },
      { key: 'rito', label: 'Rito', type: 'select', options: ['Ordinário', 'Sumário', 'Sumaríssimo (JECrim)', 'Júri'] },
      { key: 'situacao_prisional', label: 'Situação prisional', type: 'select', options: ['Solto', 'Preso em flagrante', 'Preso preventivamente', 'Preso temporariamente', 'Prisão domiciliar', 'Medidas cautelares diversas', 'Cumprindo pena'] },
      { key: 'data_fato', label: 'Data do fato', type: 'date' },
      { key: 'data_prisao', label: 'Data da prisão', type: 'date' },
      { key: 'data_recebimento_denuncia', label: 'Data do recebimento da denúncia', type: 'date' },
      { key: 'medidas_cautelares', label: 'Medidas cautelares', type: 'textarea' },
      { key: 'pena', label: 'Pena aplicada', type: 'text' },
      { key: 'regime', label: 'Regime', type: 'select', options: ['Não aplicável', 'Aberto', 'Semiaberto', 'Fechado'] },
    ],
    refs: [
      { id: 'CPP art. 396', note: 'Recebida a denúncia, o acusado é citado para responder à acusação por escrito, no prazo de 10 dias.' },
      { id: 'CPP art. 396-A', note: 'Na resposta, o acusado pode arguir preliminares e alegar tudo o que interesse à defesa, oferecer documentos e justificações, especificar provas e arrolar testemunhas.' },
      { id: 'CPP art. 403, §3º', note: 'Memoriais escritos em substituição aos debates orais, em casos de complexidade.' },
      { id: 'CPP art. 593', note: 'Cabimento de apelação, no prazo de 5 dias.' },
      { id: 'CPP art. 600', note: 'Razões de apelação: 8 dias.' },
      { id: 'CPP art. 581', note: 'Cabimento do recurso em sentido estrito.' },
      { id: 'CPP art. 310', note: 'Audiência de custódia: relaxamento, conversão em preventiva ou liberdade provisória.' },
      { id: 'CPP art. 312', note: 'Requisitos da prisão preventiva.' },
      { id: 'CPP art. 313', note: 'Hipóteses de admissão da prisão preventiva.' },
      { id: 'CPP art. 316', note: 'Revogação da preventiva; revisão da necessidade da prisão a cada 90 dias.' },
      { id: 'CPP art. 654, §1º', note: 'Requisitos da petição de habeas corpus.' },
      { id: 'CP art. 109', note: 'Prazos de prescrição da pretensão punitiva.' },
    ],
    guidance: `Ao analisar um caso criminal, confira nesta ordem:
1) Urgência: situação prisional e data da prisão; se preso, verifique audiência de custódia, fundamentos da preventiva e a revisão periódica da necessidade da prisão.
2) Prazo: após o recebimento da denúncia e a citação, a resposta à acusação tem prazo de 10 dias; apelação, 5 dias; razões, 8 dias. Peça sempre para confirmar a contagem e a data de intimação.
3) Tipificação e rito: confira se a tipificação consta da denúncia e se o rito corresponde.
4) Prescrição: compare datas do fato, do recebimento da denúncia e da sentença com a pena em abstrato/aplicada; apresente apenas como ponto a verificar.
5) Provas: liste testemunhas, documentos e perícias ainda a requerer na resposta à acusação.
6) Execução: regime, pena e progressão são dados a conferir no processo de execução.
Nunca afirme culpa ou inocência; aponte pontos de defesa a verificar.`,
  },

  contratacoes_publicas: {
    label: 'Contratações públicas',
    short: 'Contratações',
    description: 'Demanda → estudo → especificação → aprovação → edital/contrato → fiscalização (Lei 14.133/2021).',
    stages: [
      ['dfd', 'DFD', '#0ea5e9'], ['etp', 'ETP', '#6366f1'], ['tr', 'Termo de Referência', '#f59e0b'], ['revisao', 'Revisão e riscos', '#8b5cf6'],
      ['edital_contrato', 'Edital / contrato', '#14b8a6'], ['fiscalizacao', 'Fiscalização', '#ef4444'], ['encerrado', 'Encerrado', '#22c55e', true],
    ],
    fields: [
      { key: 'orgao', label: 'Órgão / entidade', type: 'text' },
      { key: 'unidade_requisitante', label: 'Unidade requisitante', type: 'text' },
      { key: 'objeto', label: 'Objeto da contratação', type: 'textarea' },
      { key: 'tipo_objeto', label: 'Tipo de objeto', type: 'select', options: ['Compra de bens', 'Serviço comum', 'Serviço com dedicação exclusiva de mão de obra', 'Obra / serviço de engenharia', 'Solução de TIC', 'Outro'] },
      { key: 'modalidade', label: 'Modalidade / forma', type: 'select', options: ['Pregão', 'Concorrência', 'Concurso', 'Leilão', 'Diálogo competitivo', 'Dispensa', 'Inexigibilidade', 'A definir'] },
      { key: 'valor_estimado', label: 'Valor estimado (R$)', type: 'number' },
      { key: 'processo_administrativo', label: 'Nº do processo administrativo', type: 'text' },
      { key: 'previsto_pca', label: 'Previsto no Plano de Contratações Anual', type: 'select', options: ['Sim', 'Não', 'Não se aplica / não verificado'] },
      { key: 'etapa_planejamento', label: 'Etapa do planejamento', type: 'select', options: ['DFD', 'ETP', 'Pesquisa de preços', 'Termo de Referência', 'Matriz de riscos', 'Edital', 'Parecer jurídico', 'Publicação', 'Execução do contrato'] },
      { key: 'regulamento', label: 'Regulamento aplicável', type: 'text', help: 'Ex.: IN SEGES/ME 58/2022 (federal) ou decreto/regulamento municipal ou estadual.' },
    ],
    refs: [
      { id: 'Lei 14.133/2021 art. 18, §1º', note: 'Elementos do estudo técnico preliminar (ETP), incisos I a XIII: necessidade, previsão no plano de contratações, requisitos, quantidades, levantamento de mercado, valor estimado, descrição da solução, parcelamento, resultados pretendidos, providências prévias, contratações correlatas, impactos ambientais e posicionamento conclusivo.' },
      { id: 'Lei 14.133/2021 art. 18, §2º', note: 'O ETP deve conter ao menos os elementos dos incisos I, IV, VI, VIII e XIII do §1º; os demais, quando não contemplados, exigem justificativa.' },
      { id: 'Lei 14.133/2021 art. 6º, XXIII', note: 'Termo de referência: definição do objeto, fundamentação, descrição da solução, requisitos, modelo de execução, modelo de gestão, critérios de medição e pagamento, forma e critérios de seleção do fornecedor, estimativas do valor e adequação orçamentária.' },
      { id: 'Lei 14.133/2021 art. 6º, XXVII', note: 'Matriz de alocação de riscos.' },
      { id: 'Lei 14.133/2021 art. 22', note: 'Matriz de alocação de riscos no edital e no contrato.' },
      { id: 'Lei 14.133/2021 art. 23', note: 'Valor previamente estimado da contratação, com pesquisa de preços.' },
      { id: 'Lei 14.133/2021 art. 53', note: 'Controle prévio de legalidade pelo órgão de assessoramento jurídico.' },
      { id: 'Lei 14.133/2021 art. 72', note: 'Instrução do processo de contratação direta.' },
    ],
    guidance: `Ao analisar uma contratação pública, confira nesta ordem:
1) Encadeamento: DFD → ETP → pesquisa de preços → TR → matriz de riscos → edital/contrato; aponte o que falta na etapa atual.
2) ETP: confira se os elementos mínimos do art. 18, §2º estão presentes (necessidade, quantidades, valor estimado, parcelamento, posicionamento conclusivo) e se os demais têm justificativa.
3) TR: confira as alíneas do art. 6º, XXIII (objeto, fundamentação, solução, requisitos, execução, gestão, medição e pagamento, seleção do fornecedor, valor estimado, adequação orçamentária).
4) Coerência: o valor e as quantidades do ETP devem bater com o TR; a modalidade deve combinar com o objeto.
5) Regulamento: indique se o órgão é federal (instruções normativas federais) ou subnacional (regulamento próprio) e peça confirmação.
6) Parecer jurídico: antes do edital, verifique se há controle prévio de legalidade previsto.
O usuário nem sempre é advogado: explique de forma simples e aponte lacunas em lista objetiva.`,
  },

  consultivo: {
    label: 'Consultivo / empresarial',
    short: 'Consultivo',
    description: 'Demanda → diagnóstico → elaboração → revisão → assinatura → obrigações.',
    stages: [
      ['demanda', 'Demanda', '#0ea5e9'], ['diagnostico', 'Diagnóstico', '#6366f1'], ['elaboracao', 'Elaboração', '#f59e0b'],
      ['revisao', 'Revisão', '#8b5cf6'], ['assinatura', 'Assinatura', '#14b8a6'], ['obrigacoes', 'Obrigações / vigência', '#ef4444'],
      ['encerrado', 'Encerrado', '#22c55e', true],
    ],
    fields: [
      { key: 'tipo_demanda', label: 'Tipo de demanda', type: 'select', options: ['Contrato', 'Parecer', 'Societário', 'Compliance / LGPD', 'Notificação extrajudicial', 'Regularização', 'Outro'] },
      { key: 'contraparte', label: 'Contraparte', type: 'text' },
      { key: 'vigencia_inicio', label: 'Início da vigência', type: 'date' },
      { key: 'vigencia_fim', label: 'Fim da vigência', type: 'date' },
      { key: 'valor_contrato', label: 'Valor envolvido (R$)', type: 'number' },
      { key: 'riscos', label: 'Riscos identificados', type: 'textarea' },
      { key: 'obrigacoes', label: 'Obrigações e marcos', type: 'textarea' },
    ],
    refs: [
      { id: 'Código Civil art. 421', note: 'A liberdade contratual será exercida nos limites da função social do contrato.' },
      { id: 'Código Civil art. 422', note: 'Os contratantes são obrigados a guardar, na conclusão e na execução do contrato, os princípios de probidade e boa-fé.' },
      { id: 'Lei 8.906/1994 art. 22', note: 'Honorários advocatícios: convencionados, fixados por arbitramento judicial e de sucumbência.' },
      { id: 'Lei 8.906/1994 art. 24', note: 'A decisão judicial que fixa ou arbitra honorários e o contrato escrito que os estipula são títulos executivos.' },
    ],
    guidance: `Ao analisar uma demanda consultiva, confira: partes e contraparte identificadas; objeto e valor; vigência e renovação; obrigações e marcos com datas; riscos e cláusulas de saída; necessidade de revisão e de assinatura. Aponte lacunas em lista objetiva.`,
  },
};

const AREA_KEYS = Object.keys(AREAS);

/** Normaliza texto livre ("Cível", "trabalhista", "licitação"...) para uma chave de área, ou null. */
function guessAreaKey(text) {
  const t = String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (!t.trim()) return null;
  if (/civel|civil|familia|consumidor|contrato/.test(t) && !/trabalh/.test(t)) return 'civel';
  if (/trabalh|previd|clt/.test(t)) return 'trabalhista';
  if (/crimin|penal/.test(t)) return 'criminal';
  if (/licit|contratac|publica|administrativ/.test(t)) return 'contratacoes_publicas';
  if (/consult|empresar|societ|compliance/.test(t)) return 'consultivo';
  return 'geral';
}

function get(key) { return AREAS[key] || AREAS.geral; }

/** Valida/normaliza `details` contra o schema da área. Campos desconhecidos são descartados. */
function sanitizeDetails(areaKey, details) {
  const area = get(areaKey);
  const out = {};
  const errors = [];
  if (details == null || typeof details !== 'object' || Array.isArray(details)) return { value: {}, errors: details == null ? [] : ['details deve ser um objeto.'] };
  for (const f of area.fields) {
    let v = details[f.key];
    if (v === undefined) continue;
    if (v === null || v === '') { out[f.key] = null; continue; }
    switch (f.type) {
      case 'number': {
        const n = Number(String(v).replace(',', '.'));
        if (!Number.isFinite(n)) { errors.push(`${f.label}: número inválido.`); break; }
        out[f.key] = n; break;
      }
      case 'date': {
        if (!/^\d{4}-\d{2}-\d{2}/.test(String(v)) || Number.isNaN(new Date(String(v).slice(0, 10)).getTime())) { errors.push(`${f.label}: use a data no formato AAAA-MM-DD.`); break; }
        out[f.key] = String(v).slice(0, 10); break;
      }
      case 'select':
        if (!f.options.includes(v)) { errors.push(`${f.label}: opção inválida (use: ${f.options.join(', ')}).`); break; }
        out[f.key] = v; break;
      case 'multiselect': {
        const arr = Array.isArray(v) ? v : [v];
        const bad = arr.filter(x => !f.options.includes(x));
        if (bad.length) { errors.push(`${f.label}: opção inválida (${bad.join(', ')}).`); break; }
        out[f.key] = arr; break;
      }
      default:
        out[f.key] = String(v).slice(0, 2000);
    }
  }
  return { value: out, errors };
}

/** Texto compacto dos detalhes (rótulo: valor), para o contexto da IA e dos documentos. */
function describeDetails(areaKey, details) {
  const area = get(areaKey);
  const d = details || {};
  const lines = [];
  for (const f of area.fields) {
    const v = d[f.key];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    lines.push(`- ${f.label}: ${Array.isArray(v) ? v.join(', ') : v}`);
  }
  return lines.join('\n');
}

/** Campos da área ainda sem valor — a IA usa para dizer o que falta. */
function missingFields(areaKey, details) {
  const d = details || {};
  return get(areaKey).fields.filter(f => d[f.key] === undefined || d[f.key] === null || d[f.key] === '' || (Array.isArray(d[f.key]) && !d[f.key].length)).map(f => f.label);
}

/** Etapas padrão (linhas prontas para INSERT em case_stages) de uma área. */
function defaultStages(areaKey) {
  return get(areaKey).stages.map(([stage_key, label, color, final], i) => ({ stage_key, label, color, position: i, is_final: final ? 1 : 0 }));
}

module.exports = { defaultStages, AREAS, AREA_KEYS, guessAreaKey, get, sanitizeDetails, describeDetails, missingFields };
