"use client";

import * as React from "react";
import { Check, Gift, CreditCard, Zap } from "lucide-react";

/* ────────────────────────────────────────────────────────────────
   الجزء الأيسر في صفحة تسجيل الدخول.
   الفكرة: فاتورة بيع بتتطبع لايف من طابعة الكاشير، ولما تتحفظ
   أرقام اليوم (الإجمالي / الفواتير / الخزنة) بتزيد قدّامك.
   حركة واحدة منسّقة — وباقي الصفحة هادي.
   ──────────────────────────────────────────────────────────────── */

type Receipt = {
  no: number;
  items: { name: string; qty: number; price: number }[];
  pay: string;
  cash: boolean;
};

const RECEIPTS: Receipt[] = [
  {
    no: 1043,
    items: [
      { name: "شاحن سريع 25 واط", qty: 1, price: 350 },
      { name: "جراب شفاف iPhone 15", qty: 1, price: 180 },
      { name: "اسكرين حماية", qty: 2, price: 120 },
    ],
    pay: "كاش",
    cash: true,
  },
  {
    no: 1044,
    items: [
      { name: "Samsung Galaxy A15", qty: 1, price: 5200 },
      { name: "شريحة + شحن رصيد", qty: 1, price: 100 },
    ],
    pay: "محفظة إلكترونية",
    cash: false,
  },
  {
    no: 1045,
    items: [
      { name: "سماعة بلوتوث", qty: 1, price: 890 },
      { name: "كابل Type-C", qty: 2, price: 160 },
    ],
    pay: "كاش",
    cash: true,
  },
];

const total = (r: Receipt) => r.items.reduce((s, i) => s + i.price, 0);
const fmt = (n: number) => n.toLocaleString("en-US");

// عرض الأعمدة في الباركود (بالبكسل) — ثابتة عشان نتجنب hydration mismatch
const BARS = [2, 1, 3, 1, 1, 2, 3, 1, 2, 2, 1, 3, 1, 1, 2, 1, 3, 2, 1, 1, 3, 1, 2, 1, 2, 3, 1, 1, 2, 2, 1, 3, 1, 2];

const BASE = { sum: 12450, count: 38, cash: 48200 };
const CYCLE_MS = 8000;
const SAVE_AT_MS = 2800; // لحظة ظهور الختم = لحظة تحديث الأرقام

function useCountUp(target: number, ms = 800) {
  const [value, setValue] = React.useState(target);
  const from = React.useRef(target);
  React.useEffect(() => {
    const a = from.current;
    if (a === target) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      const v = Math.round(a + (target - a) * e);
      from.current = v;
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

function Stat({
  label, value, unit, tone = "default", big = false,
}: { label: string; value: number; unit?: string; tone?: "default" | "warn"; big?: boolean }) {
  const shown = useCountUp(value);
  return (
    <div className="lgn-stat">
      <p className="lgn-stat-label">{label}</p>
      <p className={`lgn-stat-value ${big ? "is-big" : ""} ${tone === "warn" ? "is-warn" : ""}`}>
        {/* key بيعيد تشغيل الـ bump كل ما الرقم يتغير */}
        <span key={value} className="lgn-bump">{fmt(shown)}</span>
        {unit && <span className="lgn-unit">{unit}</span>}
      </p>
    </div>
  );
}

export default function LoginShowcase({
  title = ["كل جنيه يدخل المحل،", "يتسجّل في مكانه."],
  sub = "مبيعات، مخزون، عملاء، خزنة وتقارير — كلها محفوظة وجاهزة أول ما تسجّل دخولك.",
}: {
  title?: [string, string];
  sub?: string;
}) {
  const [idx, setIdx] = React.useState(0);
  const [acc, setAcc] = React.useState(BASE);
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // دورة الطباعة: فاتورة جديدة كل 8 ثواني
  React.useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => setIdx((i) => i + 1), CYCLE_MS);
    return () => clearInterval(id);
  }, [reduced]);

  // تحديث الأرقام لحظة "تم الحفظ"
  React.useEffect(() => {
    if (reduced) return;
    const r = RECEIPTS[idx % RECEIPTS.length];
    const id = setTimeout(() => {
      setAcc((a) => ({
        sum: a.sum + total(r),
        count: a.count + 1,
        cash: a.cash + (r.cash ? total(r) : 0),
      }));
    }, SAVE_AT_MS);
    return () => clearTimeout(id);
  }, [idx, reduced]);

  const r = RECEIPTS[idx % RECEIPTS.length];

  return (
    <div className="lgn-show lgn-side relative hidden lg:flex flex-col overflow-hidden">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* خطوط دفتر الحسابات — خلفية هادية */}
      <div className="lgn-ledger" aria-hidden />
      <div className="lgn-perf" aria-hidden />

      <div className="relative z-10 flex h-full w-full max-w-[38rem] mx-auto flex-col justify-between px-10 pt-10 pb-7">
        {/* ─── العنوان ─── */}
        <header className="lgn-head">
          <h2 className="lgn-title">
            <span>{title[0]}</span>
            <span>{title[1]}</span>
          </h2>
          <p className="lgn-sub">{sub}</p>
        </header>

        {/* ─── الفاتورة + أرقام اليوم ─── */}
        <section className="lgn-stage" aria-label="مثال لفاتورة بيع لحظية">
          {/* الطابعة والفاتورة */}
          <div className="lgn-printer-col">
            <div className="lgn-glow" aria-hidden />
            <div className="lgn-paper-window">
              <article key={idx} className={`lgn-receipt ${reduced ? "is-static" : ""}`}>
                <div className="lgn-r-head">
                  <p className="lgn-r-shop">نظام المحل</p>
                  <p className="lgn-r-meta">فاتورة بيع <bdi>#{r.no}</bdi></p>
                </div>

                <ul className="lgn-r-items">
                  {r.items.map((it) => (
                    <li key={it.name}>
                      <span className="lgn-r-name">
                        {it.name}
                        {it.qty > 1 && <b> ×{it.qty}</b>}
                      </span>
                      <span className="lgn-r-leader" aria-hidden />
                      <span className="lgn-r-price">{fmt(it.price)}</span>
                    </li>
                  ))}
                </ul>

                <div className="lgn-r-total">
                  <span>الإجمالي</span>
                  <span className="lgn-r-total-num">{fmt(total(r))} <small>ج</small></span>
                </div>
                <p className="lgn-r-pay">الدفع: {r.pay}</p>

                <div className="lgn-barcode" aria-hidden>
                  {BARS.map((w, i) => (
                    <i key={i} style={{ width: w, marginInlineEnd: 2 }} />
                  ))}
                </div>

                <div className="lgn-stamp" aria-hidden>
                  <Check className="size-3.5" strokeWidth={3.5} />
                  تم الحفظ
                </div>
              </article>
            </div>

            {/* الطابعة */}
            <div className="lgn-printer" aria-hidden>
              <div className="lgn-slot" />
              <div className="lgn-printer-body">
                <span className={`lgn-led ${reduced ? "" : "is-live"}`} />
                <span className="lgn-vents"><i /><i /><i /></span>
              </div>
            </div>
          </div>

          {/* أرقام اليوم */}
          <div className="lgn-stats">
            <p className="lgn-live"><span className="lgn-live-dot" />مباشر من المحل</p>
            <Stat big label="إجمالي اليوم" value={acc.sum} unit="ج" />
            <Stat label="عدد الفواتير" value={acc.count} />
            <Stat label="رصيد الخزنة" value={acc.cash} unit="ج" />
            <Stat label="أصناف قربت تخلص" value={3} tone="warn" />
          </div>
        </section>

        {/* ─── ضمانات سريعة ─── */}
        <footer className="lgn-foot">
          <div>
            <span className="lgn-chip"><Gift className="size-5" /></span>
            <p className="lgn-ft-txt"><b>14 يوم</b><span className="lgn-cap">تجربة مجانية</span></p>
          </div>
          <div>
            <span className="lgn-chip"><CreditCard className="size-5" /></span>
            <p className="lgn-ft-txt"><b>بدون بطاقة</b><span className="lgn-cap">ائتمان مش مطلوبة</span></p>
          </div>
          <div>
            <span className="lgn-chip"><Zap className="size-5" /></span>
            <p className="lgn-ft-txt"><b>أوفلاين</b><span className="lgn-cap">يشتغل من غير إنترنت</span></p>
          </div>
        </footer>
      </div>
    </div>
  );
}

const CSS = `
.lgn-show{
  --g:#00c98b; --g-dark:#00946a; --g-deep:#00573f;
  --ink:#0b2a20; --muted:#5b7a6e; --paper:#ffffff; --stamp:#00946a;
  --side:#f7fbf9; /* نفس لون خلفية الفورم — بيتعمل منه خروم التذكرة */
  color:#fff;
  background:
    radial-gradient(ellipse 60% 45% at 100% 0%, rgba(255,255,255,.30) 0%, transparent 65%),
    radial-gradient(ellipse 55% 40% at 0% 100%, rgba(0,60,40,.35) 0%, transparent 70%),
    linear-gradient(155deg, #08c18a 0%, #00a074 45%, #007552 100%);
}
/* حلقات بتطلع من الطابعة — إحساس إن الفلوس بتدخل */
.lgn-show::before{
  content:""; position:absolute; inset:0; pointer-events:none;
  background:repeating-radial-gradient(circle at 70% 76%, transparent 0 54px, rgba(255,255,255,.09) 54px 56px);
  -webkit-mask-image:radial-gradient(circle at 70% 76%, #000 0%, transparent 78%);
          mask-image:radial-gradient(circle at 70% 76%, #000 0%, transparent 78%);
}
/* نقط نصفية في الركن العلوي */
.lgn-show::after{
  content:""; position:absolute; inset:0; pointer-events:none;
  background:radial-gradient(rgba(255,255,255,.28) 1.3px, transparent 1.6px) 0 0/18px 18px;
  -webkit-mask-image:radial-gradient(ellipse 55% 38% at 0% 0%, #000, transparent 75%);
          mask-image:radial-gradient(ellipse 55% 38% at 0% 0%, #000, transparent 75%);
}
.lgn-ledger{
  position:absolute; inset:0; pointer-events:none;
  background-image:repeating-linear-gradient(to bottom, transparent 0 35px, rgba(255,255,255,.07) 35px 36px);
  -webkit-mask-image:linear-gradient(to bottom, #000 0%, transparent 85%);
          mask-image:linear-gradient(to bottom, #000 0%, transparent 85%);
}
/* حافة التذكرة المخرومة عند التقاء الفورم */
.lgn-perf{
  position:absolute; top:0; bottom:0; right:0; width:14px; z-index:5; pointer-events:none;
  background:radial-gradient(circle at 100% 50%, var(--side) 0 6.5px, transparent 7.2px) 0 0/14px 26px repeat-y;
}
.lgn-perf::before{
  content:""; position:absolute; top:0; bottom:0; right:22px; border-inline-end:2px dashed rgba(255,255,255,.4);
}

/* العنوان */
.lgn-title{
  font-size:clamp(2rem, calc(var(--app-h,100vh) * .05), 3.1rem);
  line-height:1.25; font-weight:800; letter-spacing:-.01em; color:#fff; text-shadow:0 2px 18px rgba(0,60,40,.25);
}
.lgn-title span{ display:block; white-space:nowrap; }
.lgn-sub{
  margin-top:1rem; max-width:29rem; text-wrap:balance;
  font-size:1rem; line-height:1.8; color:rgba(255,255,255,.93);
}

/* المسرح */
.lgn-stage{ display:flex; align-items:flex-end; gap:2rem; margin-block:.5rem; }

/* ─ الطابعة ─ */
.lgn-printer-col{
  position:relative; flex:none; width:min(20rem, 58%);
  transform:rotate(2deg); transform-origin:50% 100%;
}
.lgn-glow{
  position:absolute; left:-20%; right:-20%; bottom:-30px; height:170px;
  background:radial-gradient(closest-side, rgba(255,255,255,.38), transparent);
  filter:blur(14px); pointer-events:none;
}
.lgn-paper-window{ position:relative; overflow:hidden; padding-top:10px; margin-inline:10px; }

.lgn-receipt{
  position:relative; background:var(--paper); color:var(--ink);
  padding:1.1rem 1.15rem 1.2rem; font-size:.85rem; line-height:1.5;
  border-inline:1px solid #dcebe4;
  filter:drop-shadow(0 14px 16px rgba(0,50,34,.38));
  animation:lgn-print ${CYCLE_MS}ms both;
}
.lgn-receipt::before{
  content:""; position:absolute; left:-1px; right:-1px; top:-8px; height:8px;
  background:
    linear-gradient(135deg, transparent 50%, var(--paper) 50%) 0 0/10px 8px,
    linear-gradient(225deg, transparent 50%, var(--paper) 50%) 0 0/10px 8px;
}
.lgn-receipt.is-static{ animation:none; }

@keyframes lgn-print{
  0%   { transform:translateY(102%); animation-timing-function:steps(18,end); }
  34%  { transform:translateY(0) rotate(0); opacity:1; animation-timing-function:linear; }
  86%  { transform:translateY(0) rotate(0); opacity:1; animation-timing-function:cubic-bezier(.5,0,.9,.4); }
  95%,100%{ transform:translateY(-26px) rotate(4deg); opacity:0; }
}

.lgn-r-head{ text-align:center; padding-bottom:.55rem; border-bottom:1.5px dashed rgba(11,42,32,.28); }
.lgn-r-shop{ font-size:1.05rem; font-weight:800; }
.lgn-r-meta{ color:var(--muted); font-size:.7rem; }
.lgn-r-items{ list-style:none; margin:.6rem 0 .5rem; padding:0; display:grid; gap:.3rem; }
.lgn-r-items li{ display:flex; align-items:flex-end; gap:.35rem; }
.lgn-r-name{ font-weight:600; white-space:nowrap; }
.lgn-r-name b{ font-weight:700; color:var(--muted); }
.lgn-r-leader{ flex:1; min-width:.5rem; border-bottom:1.5px dotted rgba(11,42,32,.35); transform:translateY(-.3em); }
.lgn-r-price{ font-weight:700; font-variant-numeric:tabular-nums; }
.lgn-r-total{
  display:flex; align-items:baseline; justify-content:space-between;
  padding-top:.5rem; border-top:1.5px dashed rgba(11,42,32,.28); font-weight:700;
}
.lgn-r-total-num{ font-size:1.5rem; font-weight:800; font-variant-numeric:tabular-nums; color:var(--g-deep); }
.lgn-r-total-num small{ font-size:.75rem; font-weight:700; }
.lgn-r-pay{ margin-top:.15rem; color:var(--muted); font-size:.7rem; }
.lgn-barcode{ display:flex; align-items:stretch; height:1.9rem; margin-top:.7rem; justify-content:center; direction:ltr; }
.lgn-barcode i{ display:block; background:var(--ink); }

.lgn-stamp{
  position:absolute; left:calc(50% - 3.4rem); bottom:1.1rem;
  display:inline-flex; align-items:center; gap:.25rem;
  padding:.15rem .6rem .15rem .5rem; border:2px solid var(--stamp); border-radius:.4rem;
  color:var(--stamp); font-weight:800; font-size:.85rem; background:rgba(255,255,255,.92);
  transform:rotate(-9deg);
  animation:lgn-stamp .35s cubic-bezier(.2,1.4,.4,1) ${SAVE_AT_MS - 150}ms both;
}
.is-static .lgn-stamp{ animation:none; }
@keyframes lgn-stamp{
  0%{ opacity:0; transform:rotate(-9deg) scale(1.9); }
  100%{ opacity:.95; transform:rotate(-9deg) scale(1); }
}

/* جسم الطابعة — بنفس الأخضر الفاقع */
.lgn-printer{ position:relative; z-index:2; }
.lgn-slot{
  height:8px; border-radius:4px 4px 0 0; background:#021f16;
  box-shadow:0 -1px 0 rgba(255,255,255,.25), inset 0 2px 3px rgba(0,0,0,.7);
}
.lgn-printer-body{
  display:flex; align-items:center; justify-content:space-between;
  height:2.1rem; padding-inline:.9rem; border-radius:0 0 .8rem .8rem;
  background:linear-gradient(#0b4a37, #05301f); border:1px solid rgba(255,255,255,.12); border-top:0;
  box-shadow:0 16px 26px -10px rgba(0,30,20,.6);
}
.lgn-led{ width:7px; height:7px; border-radius:50%; background:#2f5a4a; }
.lgn-led.is-live{ background:#ffd25e; box-shadow:0 0 9px #ffd25e; animation:lgn-led ${CYCLE_MS}ms both infinite; }
@keyframes lgn-led{ 0%,34%{ opacity:1 } 40%,100%{ opacity:.35; box-shadow:none } }
.lgn-vents{ display:flex; gap:4px; }
.lgn-vents i{ width:16px; height:3px; border-radius:2px; background:rgba(255,255,255,.14); }

/* أرقام اليوم */
.lgn-stats{ flex:1; min-width:0; padding-bottom:.2rem; }
.lgn-live{
  display:flex; align-items:center; gap:.45rem; margin-bottom:.6rem;
  font-size:.75rem; font-weight:700; color:#fff;
}
.lgn-live-dot{ width:7px; height:7px; border-radius:50%; background:#fff; box-shadow:0 0 0 3px rgba(255,255,255,.28); animation:lgn-pulse 1.8s ease-in-out infinite; }
@keyframes lgn-pulse{ 50%{ opacity:.4; transform:scale(.8) } }

.lgn-stat{ padding-block:.55rem; border-top:1px solid rgba(255,255,255,.28); }
.lgn-stat-label{ font-size:.78rem; font-weight:600; color:rgba(255,255,255,.88); }
.lgn-stat-value{
  display:flex; align-items:baseline; gap:.3rem;
  font-size:1.5rem; line-height:1.25; font-weight:800; color:#fff; font-variant-numeric:tabular-nums;
}
.lgn-stat-value.is-big{ font-size:2rem; }
.lgn-stat-value.is-warn{ color:#ffe27a; }
.lgn-unit{ font-size:.8rem; font-weight:700; color:rgba(255,255,255,.85); }
.lgn-bump{ display:inline-block; animation:lgn-bump 1s ease-out; }
@keyframes lgn-bump{
  0%{ color:#ffe27a; transform:translateY(-3px); }
  100%{ color:inherit; transform:none; }
}

/* الفوتر: كارت واحد بـ 3 خانات */
.lgn-foot{
  display:grid; grid-template-columns:repeat(3,1fr); overflow:hidden;
  border:1px solid rgba(255,255,255,.7); border-radius:1.25rem; background:#fff;
  box-shadow:0 20px 40px -16px rgba(0,40,28,.55);
}
.lgn-foot > div{
  position:relative; display:flex; align-items:center; gap:.6rem;
  padding:.8rem .75rem; transition:background .25s;
}
.lgn-foot > div + div{ border-inline-start:1px solid rgba(0,87,63,.1); }
.lgn-foot > div:hover{ background:#effcf7; }
.lgn-chip{
  display:grid; place-items:center; flex:none; width:2.3rem; height:2.3rem;
  border-radius:.8rem; color:#fff;
  background:linear-gradient(145deg, #19e0a2, var(--g));
  box-shadow:0 8px 16px -6px rgba(0,201,139,.7);
}
.lgn-ft-txt{ display:grid; min-width:0; }
.lgn-foot b{ white-space:nowrap; font-size:1rem; line-height:1.3; font-weight:800; color:var(--ink); }
.lgn-cap{ white-space:nowrap; font-size:.7rem; line-height:1.4; color:var(--muted); }

/* شاشات قصيرة: شيل اللي مش ضروري بدل ما الصفحة تتقص */
@media (max-height:760px){
  .lgn-sub{ font-size:.9rem; margin-top:.6rem; line-height:1.7 }
  .lgn-receipt{ font-size:.78rem; padding:.9rem 1rem 1rem }
  .lgn-stat{ padding-block:.4rem }
  .lgn-stat-value{ font-size:1.3rem }
  .lgn-stat-value.is-big{ font-size:1.75rem }
  .lgn-foot > div{ padding-block:.6rem }
}
@media (max-height:640px){ .lgn-sub{ display:none } }
@media (max-height:620px){ .lgn-foot{ display:none } }

@media (prefers-reduced-motion:reduce){
  .lgn-receipt, .lgn-stamp, .lgn-led, .lgn-bump, .lgn-live-dot{ animation:none !important; }
}
`;
