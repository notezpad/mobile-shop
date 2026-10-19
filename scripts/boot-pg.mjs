/**
 * تشغيل Postgres مدمج للاختبار (من غير تثبيت نظام) — port 5433
 * الاستخدام: node boot-pg.mjs  → يفضل شغال لحد SIGTERM
 */
import EmbeddedPostgres from 'embedded-postgres'

const PORT = 5433
const pg = new EmbeddedPostgres({
  databaseDir: '/home/z/my-project/work/pgdata-test',
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: true,
})

async function main() {
  await pg.initialise()
  await pg.start()
  try {
    await pg.createDatabase('erp_test')
    console.log(`[boot-pg] created database erp_test on :${PORT}`)
  } catch (e) {
    console.log('[boot-pg] erp_test probably exists:', e?.message?.slice(0, 100))
  }
  console.log(`[boot-pg] Postgres READY on localhost:${PORT} (postgres/postgres)`)
  process.on('SIGTERM', async () => { await pg.stop(); process.exit(0) })
  process.on('SIGINT', async () => { await pg.stop(); process.exit(0) })
  // keep alive
  setInterval(() => {}, 1 << 30)
}

main().catch((e) => { console.error('[boot-pg] FAILED:', e); process.exit(1) })
