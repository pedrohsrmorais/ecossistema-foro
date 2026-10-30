/**
 * mockPdf.js — gera um PDF simples e VÁLIDO (sem dependências) para o ambiente de teste da consulta processual.
 * Só texto Helvetica, várias páginas. O conteúdo é determinístico a partir da "semente" (mesmo processo → mesmo PDF).
 */
const crypto = require('crypto');

const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  // Helvetica padrão (WinAnsi): troca o que ficaria ilegível por equivalente ASCII
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, '?');

const LOREM = [
  'Vistos, etc. Trata-se de acao proposta nos termos da inicial, com pedido de tutela de urgencia.',
  'Citada a parte re, esta apresentou contestacao tempestiva, arguindo preliminares e, no merito, a improcedencia.',
  'Em replica, a parte autora reiterou os termos da inicial e requereu a producao de prova documental e pericial.',
  'Saneado o feito, foram fixados os pontos controvertidos e designada audiencia de instrucao e julgamento.',
  'Foram ouvidas as testemunhas arroladas e colhido o depoimento pessoal das partes, conforme termo anexo.',
  'As partes apresentaram alegacoes finais por memoriais, no prazo comum legal.',
  'Intimem-se. Cumpra-se. Este documento e uma SIMULACAO gerada para testes do sistema Foro.',
];

/** meta: { numero_cnj, tribunal, classe, assunto, partes: [{papel, nome}], query } */
function buildProcessPdf(meta, seed = meta.numero_cnj) {
  const rnd = crypto.createHash('sha256').update(String(seed)).digest();
  const pages = 2 + (rnd[0] % 3); // 2 a 4 páginas
  const header = [
    'DOCUMENTO SIMULADO - AMBIENTE DE TESTE DO FORO',
    '',
    `Processo: ${meta.numero_cnj}`,
    `Tribunal: ${meta.tribunal}`,
    `Classe: ${meta.classe}`,
    `Assunto: ${meta.assunto}`,
    ...(meta.partes || []).map(p => `${p.papel}: ${p.nome}`),
    `Termo pesquisado: ${meta.query}`,
    '',
  ];
  const pageLines = [];
  for (let p = 0; p < pages; p++) {
    const lines = p === 0 ? [...header] : [`Processo ${meta.numero_cnj} - folha ${p + 1} de ${pages}`, ''];
    for (let i = 0; i < 9; i++) lines.push(`${p * 9 + i + 1}. ${LOREM[(rnd[(p * 9 + i) % 32] + i) % LOREM.length]}`);
    pageLines.push(lines);
  }

  // objetos: 1 catálogo, 2 páginas, 3 fonte, depois (página, conteúdo) por folha
  const objs = [];
  const kids = [];
  objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  let n = 4;
  for (const lines of pageLines) {
    const pageNo = n++, contentNo = n++;
    kids.push(`${pageNo} 0 R`);
    const text = ['BT', '/F1 11 Tf', '14 TL', '56 780 Td', ...lines.flatMap(l => [`(${esc(l.length > 95 ? l.slice(0, 95) : l)}) Tj`, 'T*']), 'ET'].join('\n');
    objs[pageNo] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNo} 0 R >>`;
    objs[contentNo] = `<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`;
  }
  objs[2] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets = [];
  for (let i = 1; i < objs.length; i++) {
    offsets[i] = Buffer.byteLength(out);
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) out += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return { buffer: Buffer.from(out, 'latin1'), pages };
}

module.exports = { buildProcessPdf };
