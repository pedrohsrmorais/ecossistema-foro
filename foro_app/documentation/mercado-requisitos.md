# Mercado jurídico: o que os CRMs/ERPs profissionais entregam e o que é Must-Have

Pesquisa feita em 30/10/2026 nas páginas de produto e blogs de Astrea (Aurum), Projuris ADV, EasyJur, AdvBox, Thomson Reuters,
Centerbase (EUA) e na documentação pública do DataJud/CNJ. Onde a fonte não detalha um recurso, está marcado.

## 1. O que os concorrentes oferecem

| Área | O que aparece no mercado | Fonte |
|---|---|---|
| **Gestão de processos** | Cadastro por número/OAB, acompanhamento de movimentações, tarefas ligadas a cada evento jurídico | Astrea, AdvBox |
| **Prazos** | Controle de prazos processuais, audiências e compromissos, com alerta quando o prazo muda; tarefas vinculadas ao evento; "supervisão contínua de riscos" | Astrea, AdvBox, Centerbase (calendário por regras) |
| **Publicações e intimações** | Captura automática por nome/OAB (o plano limita a quantidade de nomes), que dispara tarefas, define responsável e calcula prazo | Astrea, AdvBox |
| **Financeiro** | Honorários, boletos, cobrança automática, fluxo de caixa, inadimplência, contratos; nos EUA também *time & billing* e conta de terceiros (trust) | Astrea, AdvBox, Centerbase |
| **CRM / captação** | Contatos, leads, histórico de interações, captura por formulário, follow-up automático, conversão de lead em processo, ROI de marketing | AdvBox, Centerbase |
| **Documentos** | Armazenamento por processo, versões, modelos que preenchem dados do cliente/processo, assinatura digital | AdvBox, Centerbase, Thomson Reuters |
| **Portal do cliente** | Cliente acompanha andamento, documentos e cobranças | Astrea, Centerbase |
| **Mobile** | Apps iOS/Android ou web responsivo para consultar prazos e processos fora do escritório | Astrea, AdvBox |
| **Relatórios / BI** | Indicadores de processos, produtividade, rentabilidade, gargalos, fluxo de caixa | Astrea, AdvBox, Centerbase |
| **Equipe e segurança** | Múltiplos usuários com responsável por tarefa, níveis de acesso, histórico rastreável (auditoria), nuvem com backup; MFA/criptografia nos players maiores | AdvBox, Centerbase |
| **IA** | Pesquisa de jurisprudência, redação e revisão de peças, resumo | Astrea (Jux), Thomson Reuters |
| **Suporte** | Suporte contínuo e atualizações aparecem nos critérios de escolha, junto com período de teste e facilidade de uso | Thomson Reuters |

### Sobre captura automática de andamentos e publicações
- O **DataJud (CNJ)** é gratuito, mas exige chave de API, consulta **por tribunal**, deixa de fora processos em segredo de justiça,
  **não busca por número de OAB**, e há relatos de defasagem em alguns tribunais. Traz movimentações e metadados, **não** as publicações/intimações do Diário.
- Intimações e publicações por OAB/nome costumam vir de **provedores pagos** (é o que Astrea/Projuris contratam e repassam no plano).
  Por isso esse recurso é caro e é o principal diferencial de preço do mercado.

## 2. Classificação para o Foro

**MUST-HAVE** (sem isso o escritório não troca a planilha/agenda atual pelo Foro)

| # | Requisito | Situação no Foro |
|---|---|---|
| M1 | Cadastro de processos com número CNJ, tribunal, link do processo, partes, valor | ✅ pronto |
| M2 | **Prazos processuais** com data, responsável e vínculo ao processo | ✅ pronto |
| M3 | **Alertas proativos de prazo** (e-mail antes do vencimento, destaque do que venceu) | ✅ **novo**: resumo diário por e-mail + sino no app |
| M4 | Agenda de audiências/perícias/reuniões com link | ✅ pronto |
| M5 | **Cliente ↔ processo ligados** nas duas direções (do cliente vejo os processos; do processo vejo o cliente e como contatá-lo) | ✅ **completado** |
| M6 | Equipe com responsável por processo/tarefa e permissões (admin/usuário) | ✅ pronto |
| M7 | Painel com o que exige atenção hoje (prazos, audiências, parados) | ✅ **novo painel** |
| M8 | Acesso pelo celular | ⚠️ **lacuna**: layout de celular ainda não existe |
| M9 | Segurança e LGPD: acesso por perfil, histórico, backup, Termos e Privacidade | ⚠️ parcial (acesso/auditoria/backup ok; **faltam Termos e Política de Privacidade**) |
| M10 | Suporte humano acessível dentro do produto | ✅ **novo**: página de Suporte |
| M11 | Período de teste e preço claro | ✅ pronto (14 dias, Stripe) |

**SHOULD-HAVE** (esperado em até 3–6 meses; costuma decidir a venda)
- S1 Documentos anexados ao processo e ao cliente (upload, pasta por processo).
- S2 Modelos de documento/contrato com dados do cliente preenchidos.
- S3 Controle de honorários por cliente/processo (previsto × recebido, vencimentos) e lembrete de cobrança.
- S4 Movimentações automáticas via DataJud (gratuito, por tribunal) com aviso de "teve andamento novo".
- S5 Cálculo de prazo em dias úteis (CPC) com feriados forenses.
- S6 Lembrete por WhatsApp além do e-mail.
- S7 Exportação (CSV/PDF) de processos e relatórios.

**NICE-TO-HAVE / DIFERENCIAL**
- Captura de publicações/intimações por OAB (exige provedor pago; encaixa nos planos Pro/Business e nas "consultas").
- Portal do cliente, assinatura digital integrada, formulário de captação de leads no site, jurisprudência por IA, time & billing.

## 3. Decisões tomadas a partir disto
1. Prioridade desta rodada: **M3, M5, M7, M10** (pedidos do dono do produto), todos entregues.
2. Próximas lacunas **Must-Have**: M8 (celular) e M9 (Termos/Privacidade).
3. Maior alavanca comercial depois do MVP: S4 (andamento automático, gratuito via DataJud) e S3 (honorários).
4. Publicações/intimações ficam como recurso premium futuro, junto com as consultas hoje marcadas como "Em breve".

## Fontes
- Astrea: https://www.aurum.com.br/astrea/
- AdvBox: https://advbox.com.br/blog/o-melhor-software-juridico/
- Thomson Reuters: https://www.thomsonreuters.com.br/pt/juridico/melhor-software-juridico.html
- Centerbase: https://centerbase.com/blog/legal-software-features/
- DataJud (resumo técnico): https://www.tabnews.com.br/joaotextor/abstraindo-a-api-publica-do-cnj-datajud
- Comparativos Astrea × Projuris: https://www.b2bstack.com.br/compare/astrea-vs-projurisadv
