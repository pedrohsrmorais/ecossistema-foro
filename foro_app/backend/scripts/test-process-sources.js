#!/usr/bin/env node
/**
 * Diagnóstico das fontes públicas de processos (DataJud + DJEN) — não usa banco nem login.
 *
 *   docker compose exec api node scripts/test-process-sources.js 0000832-35.2018.4.01.3202
 *   docker compose exec api node scripts/test-process-sources.js "OAB/RS 12345"
 *
 * Mostra, para cada fonte: o status HTTP, as chaves que vieram na resposta e o que o Foro conseguiu interpretar.
 * Se algum campo vier diferente do esperado, o trecho "CRU" abaixo é o que precisa ser ajustado.
 */
const src = require('../services/cnj-sources.service');
const cnj = require('../utils/cnj');

const term = process.argv.slice(2).join(' ').trim();
if (!term) { console.error('Uso: node scripts/test-process-sources.js <número CNJ | OAB/UF 123 | nome da parte>'); process.exit(1); }
const keys = (o) => (o && typeof o === 'object' ? Object.keys(o).join(', ') : typeof o);

(async () => {
  const c = src.cfg();
  console.log('— Configuração');
  console.log(`  DataJud: ${c.datajudBase}  chave: ${c.datajudKey ? 'configurada (' + c.datajudKey.length + ' caracteres)' : 'NÃO configurada (DATAJUD_API_KEY)'}`);
  console.log(`  DJEN:    ${c.djenBase}`);
  let k;
  try { k = src.classify(term); } catch (e) { console.error('\n✘ ' + e.message); process.exit(1); }
  console.log(`\n— Termo interpretado como: ${k.kind}${k.digits ? ' ' + cnj.format(k.digits) : ''}`);

  if (k.kind === 'cnj') {
    const alias = src.datajudAlias(k.digits);
    console.log(`\n— CRU · DataJud (índice: ${alias ? 'api_publica_' + alias : 'nenhum'})`);
    if (alias && c.datajudKey) {
      try {
        const r = await fetch(`${c.datajudBase}/api_publica_${alias}/_search`, { method: 'POST', headers: { Authorization: `APIKey ${c.datajudKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ size: 3, query: { match: { numeroProcesso: k.digits } } }), signal: AbortSignal.timeout(40000) });
        console.log(`  HTTP ${r.status}`);
        const j = await r.json().catch(() => null);
        const hit = j?.hits?.hits?.[0]?._source;
        console.log(`  hits: ${j?.hits?.total?.value ?? '?'}   chaves do 1º hit: ${keys(hit)}`);
        if (hit) console.log(`  1º movimento: ${JSON.stringify((hit.movimentos || [])[0])}`);
      } catch (e) { console.log('  ✘ ' + e.message); }
    } else console.log('  (pulado)');
    console.log('\n— CRU · DJEN');
    try {
      const r = await fetch(`${c.djenBase}/api/v1/comunicacao?numeroProcesso=${k.digits}&pagina=1&itensPorPagina=5`, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30000) });
      console.log(`  HTTP ${r.status}${r.status === 403 ? '  ← bloqueio por IP (o DJEN só aceita servidores no Brasil)' : ''}`);
      const j = await r.json().catch(() => null);
      console.log(`  chaves: ${keys(j)}   count: ${j?.count ?? '?'}`);
      const it = (j?.items || [])[0];
      if (it) console.log(`  chaves do 1º item: ${keys(it)}`);
    } catch (e) { console.log('  ✘ ' + e.message); }
  }

  console.log('\n— O QUE O FORO INTERPRETOU');
  try {
    if (k.kind === 'cnj') {
      const s = await src.snapshot(k.digits, { fresh: true });
      console.log(`  fontes: DataJud=${s.fontes.datajud.status}${s.fontes.datajud.mensagem ? ' (' + s.fontes.datajud.mensagem + ')' : ''} · DJEN=${s.fontes.djen.status}${s.fontes.djen.mensagem ? ' (' + s.fontes.djen.mensagem + ')' : ''}`);
      console.log(`  capa: ${JSON.stringify(s.capa)}`);
      console.log(`  partes: ${JSON.stringify(s.partes)}`);
      console.log(`  movimentações: ${s.movimentos_total} · últimas: ${JSON.stringify(s.movimentos.slice(0, 3).map(m => `${(m.data || '').slice(0, 10)} ${m.nome}`))}`);
      console.log(`  publicações:   ${s.comunicacoes_total} · últimas: ${JSON.stringify(s.comunicacoes.slice(0, 3).map(m => `${(m.data || '').slice(0, 10)} ${m.tipo || ''} ${m.tipo_documento || ''}`))}`);
    } else {
      const r = await src.search(term);
      console.log(`  ${r.results.length} processo(s). ${r.aviso || ''}`);
      r.results.slice(0, 5).forEach(x => console.log(`   • ${x.numero_cnj} · ${x.tribunal} · ${x.classe} · ${x.ultima_movimentacao} (${x.data_ultima_movimentacao})`));
    }
  } catch (e) { console.log('  ✘ ' + e.message); }
})();
