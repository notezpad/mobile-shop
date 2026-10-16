#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# ⚡ قياس استهلاك CPU لكل route — الخطوة 0 قبل أي تعديل
#
# الاستخدام:
#   1) شغّل السكريبت ده في terminal من جذر المشروع:
#        bash scripts/measure-cpu.sh
#   2) في التاب التاني: افتح التطبيق، احفظ أمر شراء، وتنقّل بين الصفحات دقيقة–تنتين.
#   3) استنى المدة (120 ثانية افتراضيًا) — هيتطبع تقرير:
#        - أعلى 10 routes في CPU (p50/p99/max)
#        - عدد "Exceeded CPU Limit" لكل route
#
# ملاحظات:
#   - محتاج wrangler متسجل دخول (npx wrangler login) أو CLOUDFLARE_API_TOKEN.
#   - لو عايز قياس أطول: bash scripts/measure-cpu.sh /tmp/cpu-tail.jsonl 300
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

OUT="${1:-/tmp/cpu-tail.jsonl}"
DURATION="${2:-120}"   # ثواني القياس الافتراضية

echo "▶ Tail بدأ لمدة ${DURATION}s — دوّر في التطبيق دلوقتي..."
timeout "${DURATION}" npx wrangler tail --format json > "$OUT" 2>/tmp/tail-err.log || true

echo "▶ التحليل:"
python3 - "$OUT" <<'PY'
import json, sys, collections, statistics

path = sys.argv[1]
rows = []
exceeded = collections.Counter()
per_route = collections.defaultdict(list)

for line in open(path, encoding='utf-8', errors='ignore'):
    line = line.strip()
    if not line.startswith('{'):
        continue
    try:
        e = json.loads(line)
    except Exception:
        continue
    # wrangler tail json: outcome + event.request.url/method + cpuTime (ms)
    req = (e.get('event') or {}).get('request') or {}
    url = req.get('url', '')
    outcome = e.get('outcome', '')
    cpu = e.get('cpuTime')
    if cpu is None:
        cpu = (e.get('event') or {}).get('cpuTime')
    method = req.get('method', 'GET')
    try:
        path_part = url.split('://', 1)[-1].split('/', 1)
        path_part = '/' + path_part[1] if len(path_part) > 1 else '/'
        path_part = path_part.split('?')[0]
    except Exception:
        path_part = '/'
    key = f"{method} {path_part}" if path_part.startswith('/api/') else f"SSR {path_part}"[:60]
    if cpu is not None:
        per_route[key].append(float(cpu))
    raw = json.dumps(e, ensure_ascii=False)
    if 'exceeded' in outcome.lower() or 'Exceeded CPU' in raw:
        exceeded[key] += 1

print(f"{'Route':<48}{'n':>6}{'p50ms':>9}{'p99ms':>9}{'maxms':>9}")
ranked = sorted(per_route.items(), key=lambda kv: -statistics.median(kv[1]))
for key, vals in ranked[:10]:
    p50 = statistics.median(vals)
    p99 = sorted(vals)[max(0, int(len(vals) * 0.99) - 1)]
    print(f"{key:<48}{len(vals):>6}{p50:>9.2f}{p99:>9.2f}{max(vals):>9.2f}")
print("\n── Exceeded CPU Limit لكل route ──")
total = 0
for key, c in exceeded.most_common():
    print(f"  {key}: {c}")
    total += c
print(f"  الإجمالي: {total}")
PY
echo "✅ الخام محفوظ في: $OUT"
