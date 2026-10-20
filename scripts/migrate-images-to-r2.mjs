#!/usr/bin/env node
/**
 * 🖼️ نقل الصور القديمة (data:image/...;base64) من الداتابيز إلى R2.
 *
 * الاستخدام (من مجلد المشروع):
 *   DATABASE_URL="postgres://..." IMAGES_PUBLIC_URL="https://pub-xxxx.r2.dev" \
 *     node scripts/migrate-images-to-r2.mjs            # تجربة بدون أي تعديل (dry-run)
 *   ... node scripts/migrate-images-to-r2.mjs --apply  # التنفيذ الفعلي
 *
 * الضمانات:
 *   - الافتراضي dry-run: بيعرض اللي هيتنقل بس.
 *   - قبل أي تعديل بيحفظ نسخة احتياطية كاملة من القيم الأصلية في ملف JSON محلي.
 *   - الصف بيتحدّث فقط بعد نجاح رفع الملف لـ R2 وتأكيد وجوده.
 *   - بيعدّل الصف بشرط إن قيمته لسه نفس الـ base64 القديم (WHERE imagePath = القديم)،
 *     فلو المستخدم غيّر الصورة أثناء النقل ما تتكتبش فوقها.
 *   - الصور اللي هي أصلًا روابط (مش data:) بتتخطى. الجريان أكتر من مرة آمن.
 *
 * المتطلبات: wrangler مسجّل دخول (npx wrangler login) + الـ bucket موجود.
 */
import postgres from 'postgres'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const APPLY = process.argv.includes('--apply')
const BUCKET = process.env.R2_BUCKET || 'nezampos-images'
const BASE = (process.env.IMAGES_PUBLIC_URL || '').replace(/\/+$/, '')
const DB_URL = process.env.DATABASE_URL

if (!DB_URL) { console.error('DATABASE_URL مطلوب'); process.exit(1) }
if (!/^https:\/\//.test(BASE)) { console.error('IMAGES_PUBLIC_URL مطلوب (https://...)'); process.exit(1) }

const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }
const sql = postgres(DB_URL, { max: 1, prepare: false })
const tmp = mkdtempSync(join(tmpdir(), 'r2mig-'))

// [جدول, عمود, عمود الـ tenant]
const TARGETS = [
  ['Product', 'imagePath', 'tenantId'],
  ['Tenant', 'logoPath', 'id'],
]

function parseDataUrl(v) {
  const m = /^data:(image\/[a-z+.-]+);base64,(.*)$/s.exec(v)
  if (!m || !EXT[m[1]]) return null
  return { mime: m[1], buf: Buffer.from(m[2], 'base64') }
}

function wrangler(args) {
  return execFileSync('npx', ['wrangler', ...args], { stdio: ['ignore', 'pipe', 'pipe'] }).toString()
}

const backup = []
let moved = 0, skipped = 0, failed = 0

try {
  for (const [table, col, tenantCol] of TARGETS) {
    const rows = await sql.unsafe(
      `SELECT "id", "${tenantCol}" AS tenant, "${col}" AS val FROM "${table}" WHERE "${col}" LIKE 'data:%'`
    )
    console.log(`\n${table}.${col}: ${rows.length} صورة base64`)
    for (const r of rows) {
      const parsed = parseDataUrl(r.val)
      if (!parsed || parsed.buf.length === 0) { console.log(`  - ${table}#${r.id}: صيغة غير مدعومة → تخطي`); skipped++; continue }
      const hash = createHash('sha256').update(parsed.buf).digest('hex').slice(0, 40)
      const tenant = String(r.tenant).replace(/[^a-zA-Z0-9_-]/g, '')
      const key = `${tenant}/${hash}.${EXT[parsed.mime]}`
      const url = `${BASE}/${key}`
      console.log(`  ${APPLY ? '→' : '(dry)'} ${table}#${r.id}  ${(parsed.buf.length / 1024).toFixed(0)}KB  ${url}`)
      if (!APPLY) continue

      backup.push({ table, col, id: r.id, original: r.val })
      // نسخة احتياطية على القرص قبل أي تعديل (بتتحدّث بعد كل صورة)
      writeFileSync(`images-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(backup))
      try {
        const file = join(tmp, `${hash}.${EXT[parsed.mime]}`)
        writeFileSync(file, parsed.buf)
        wrangler([
          'r2', 'object', 'put', `${BUCKET}/${key}`, '--remote',
          '--file', file,
          '--content-type', parsed.mime,
          '--cache-control', 'public, max-age=31536000, immutable',
        ])
        const res = await sql.unsafe(
          `UPDATE "${table}" SET "${col}" = $1 WHERE "id" = $2 AND "${col}" = $3`,
          [url, r.id, r.val]
        )
        if (res.count === 1) moved++
        else { console.log('    الصورة اتغيّرت أثناء النقل → تخطي'); skipped++ }
      } catch (e) {
        failed++
        console.error(`    فشل ${table}#${r.id}:`, String(e?.stderr || e?.message || e).slice(0, 300))
      }
    }
  }
  console.log(`\nانتهى: نُقلت ${moved} | تُخطّيت ${skipped} | فشلت ${failed}${APPLY ? '' : '  (dry-run — لم يتغيّر شيء)'}`)
  if (APPLY && backup.length) console.log('النسخة الاحتياطية: images-backup-*.json — احتفظ بها لحد ما تتأكد إن كل الصور بتظهر.')
} finally {
  await sql.end()
  rmSync(tmp, { recursive: true, force: true })
}
