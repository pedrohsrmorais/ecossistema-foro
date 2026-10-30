/**
 * 011 — Processos salvos: colunas e índices para busca rápida só pelo MySQL (sem abrir o S3).
 *  - numero_digits: o CNJ só com dígitos (busca por prefixo usa índice).
 *  - parties_text: nomes das partes em texto simples (evita LIKE em JSON).
 *  - índices por tribunal, listagem ordenada e distribuição.
 */
module.exports.up = async function up(db) {
  await db.addColumn('saved_processes', 'numero_digits', "CHAR(20) NULL COMMENT 'numero_cnj só com dígitos'");
  await db.addColumn('saved_processes', 'parties_text', "VARCHAR(500) NULL COMMENT 'nomes das partes (busca)'");
  await db.run("UPDATE saved_processes SET numero_digits = REGEXP_REPLACE(numero_cnj, '[^0-9]', '') WHERE numero_digits IS NULL");
  await db.run(`UPDATE saved_processes SET parties_text = LEFT(COALESCE(
    (SELECT GROUP_CONCAT(jt.nome SEPARATOR ' | ') FROM JSON_TABLE(saved_processes.parties, '$[*]' COLUMNS (nome VARCHAR(150) PATH '$.nome')) jt), ''), 500)
    WHERE parties_text IS NULL AND parties IS NOT NULL`);
  await db.addIndex('saved_processes', 'idx_saved_proc_list', '(account_id, deleted_at, created_at)');
  await db.addIndex('saved_processes', 'idx_saved_proc_tribunal', '(account_id, tribunal, deleted_at)');
  await db.addIndex('saved_processes', 'idx_saved_proc_digits', '(account_id, numero_digits)');
  await db.addIndex('saved_processes', 'idx_saved_proc_saver', '(account_id, saved_by)');
};
