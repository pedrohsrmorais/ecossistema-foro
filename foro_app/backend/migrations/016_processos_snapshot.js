/**
 * 016 — Processos salvos como "retrato" dos dados públicos (DataJud + DJEN): o PDF passa a ser OPCIONAL.
 *  - snapshot (JSON): capa, partes, movimentações e publicações no momento da consulta; snapshot_at = quando.
 *  - colunas de arquivo (bucket/chave/nome/sha256) ficam NULL quando não há PDF anexado.
 */
module.exports.up = async function up(db) {
  await db.run('ALTER TABLE saved_processes MODIFY s3_bucket VARCHAR(100) NULL');
  await db.run('ALTER TABLE saved_processes MODIFY s3_key VARCHAR(500) NULL');
  await db.run('ALTER TABLE saved_processes MODIFY file_name VARCHAR(255) NULL');
  await db.run('ALTER TABLE saved_processes MODIFY sha256 CHAR(64) NULL');
  await db.addColumn('saved_processes', 'snapshot', "JSON NULL COMMENT 'retrato dos dados públicos (capa, partes, movimentos, publicações)'");
  await db.addColumn('saved_processes', 'snapshot_at', 'DATETIME(3) NULL');
  await db.addColumn('saved_processes', 'movements_count', 'INT NULL');
  await db.addColumn('saved_processes', 'communications_count', 'INT NULL');
  await db.addColumn('saved_processes', 'file_attached_at', 'DATETIME(3) NULL');
};
