/**
 * 012 — saved_processes.created_at com milissegundos: dois processos salvos no mesmo segundo
 * não empatam mais na ordenação "mais recentes primeiro".
 */
module.exports.up = async function up(db) {
  const [r] = await db.run(
    "SELECT DATETIME_PRECISION AS p FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'saved_processes' AND column_name = 'created_at'");
  if (r.length && Number(r[0].p) < 3) {
    await db.run('ALTER TABLE saved_processes MODIFY created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)');
  }
};
