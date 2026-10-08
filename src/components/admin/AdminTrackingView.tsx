"use client";

/**
 * ═══════════════════════════════════════════════════════════════════
 *  محطة الإشارة — Signal Station · صفحات التسويق والتتبع
 * ═══════════════════════════════════════════════════════════════════
 *  الهوية: فوسفوري لايم على أوبسيديان (رادار عملياتيات عسكري)
 *  ─ عناصر التوقيع الخاص بهذه الصفحة فقط ─
 *   • RadarScope: رادار حي بمكنسة دوّارة + بقع المنصات (متصل = وميض)
 *   • شارة «البث نشط/متوقف» تتفاعل لحظياً مع القاطع الرئيسي
 *   • نسيج دوائر كهربائية (PCB) على كل الألواح الداكنة
 *   • بطاقات القنوات CH-01..04 مع أعمدة إشارة (SignalBars) و LED
 *   • صفوف مفاتيح كوحدة تحكم فيزيائية (LED بجانب كل مفتاح)
 *   • سجل البث: تيرمينال داكن دائماً بخط أحادي
 *   • شريط حفظ لاصق يظهر عند وجود تغييرات غير محفوظة (حفظ/تراجع)
 *
 *  🔒 الأسرار لا تُعرض أبداً — تظهر كنص Masked، وتُحفظ فقط عند إدخال
 *  قيمة جديدة. حقل فارغ = بدون تغيير. زر «إزالة» يرسل __CLEAR__.
 */

import * as React from "react";
import {
  Save,
  Loader2,
  Globe,
  BarChart3,
  Facebook,
  Music2,
  Megaphone,
  ShieldCheck,
  FlaskConical,
  Bug,
  Power,
  Activity,
  RefreshCw,
  Eye,
  EyeOff,
  Trash2,
  AlertTriangle,
  Clock,
  RadioTower,
  Terminal,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { sanitizeId } from "@/lib/tracking/sanitize";
import { TrackingFunnel } from "./tracking/TrackingFunnel";
import { TrackingAttribution } from "./tracking/TrackingAttribution";
import { UtmBuilder } from "./tracking/UtmBuilder";

// ─── Types (توافق مع استجابة /api/admin/tracking) ────────────────────

interface TrackingSettings {
  general: {
    enabled: boolean;
    debugMode: boolean;
    testMode: boolean;
    consentManagement: boolean;
  };
  google: {
    enabled: boolean;
    ga4MeasurementId: string;
    ga4ApiSecret: string;
    ga4ApiSecretSet: boolean;
    ga4ApiSecretMasked: string | null;
    adsConversionId: string;
    adsLabels: { registration: string; trial: string; purchase: string };
    gtmId: string;
    useGtm: boolean;
    enhancedConversions: boolean;
    consentMode: boolean;
  };
  meta: {
    enabled: boolean;
    pixelId: string;
    datasetId: string;
    capiToken: string;
    capiTokenSet: boolean;
    capiTokenMasked: string | null;
    testEventCode: string;
  };
  tiktok: {
    enabled: boolean;
    pixelId: string;
    eventsApiToken: string;
    eventsApiTokenSet: boolean;
    eventsApiTokenMasked: string | null;
    testEventCode: string;
  };
}

interface ProviderStatus {
  key: string;
  label: string;
  connected: boolean;
  detail: string;
}

interface TrackingEventRow {
  id: number;
  eventId: string;
  eventName: string;
  provider: string;
  source: string;
  status: string;
  error: string | null;
  subscriptionId: number | null;
  createdAt: string;
}

interface Payload {
  config: TrackingSettings;
  statuses: ProviderStatus[];
  events: TrackingEventRow[];
  tablesReady?: boolean;
  stats: {
    sentCount: number;
    failedCount: number;
    lastEvent: {
      eventName: string;
      status: string;
      error: string | null;
      createdAt: string;
      provider: string;
    } | null;
  };
}

const SECRET_CLEAR = "__CLEAR__";

export type TrackingPage =
  | "funnel" | "attribution" | "campaigns" | "settings" | "events";

/* ─── نسيج الدوائر الكهربائية — بصمة هذه الصفحة ─────────────────────── */
const CIRCUIT_BG: React.CSSProperties = {
  backgroundImage: [
    "radial-gradient(circle at 1px 1px, rgba(163,230,53,.10) 1px, transparent 1.7px)",
    "linear-gradient(rgba(163,230,53,.035) 1px, transparent 1px)",
    "linear-gradient(90deg, rgba(163,230,53,.035) 1px, transparent 1px)",
  ].join(", "),
  backgroundSize: "26px 26px, 26px 26px, 26px 26px",
};

const FLOW_STRIP: React.CSSProperties = {
  backgroundImage:
    "repeating-linear-gradient(90deg, rgba(163,230,53,.4) 0 8px, transparent 8px 20px)",
};

/* نمط الإدخال التقني: خط أحادي + تركيز لايمي */
const MONO_INPUT =
  "font-mono text-[13px] focus-visible:border-lime-500/60 focus-visible:ring-lime-500/25";

/* ═════════════════════════ المكون الرئيسي ═════════════════════════ */

export function AdminTrackingView({ page }: { page: TrackingPage }) {
  const [data, setData] = React.useState<Payload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [showSecret, setShowSecret] = React.useState<Record<string, boolean>>(
    {},
  );
  /** لقطة آخر تحميل — لكشف التغييرات غير المحفوظة (شريط الحفظ اللاصق) */
  const [snapshot, setSnapshot] = React.useState<TrackingSettings | null>(null);

  // حقول الأسرار المحلية — فارغة تعني "بدون تغيير"
  const [secrets, setSecrets] = React.useState({
    ga4ApiSecret: "",
    capiToken: "",
    eventsApiToken: "",
  });
  const clearSecret = (k: keyof typeof secrets) =>
    setSecrets((s) => ({ ...s, [k]: SECRET_CLEAR }));

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<Payload>("/api/admin/tracking");
      setData(d);
      setSnapshot(d.config);
    } catch (e: any) {
      toast.error(e?.message || "فشل تحميل إعدادات التتبع");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    // deferred حتى لا نستدعي setState تزامنياً داخل الـ effect
    void Promise.resolve().then(load);
  }, [load]);

  const save = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const body: any = {
        general: data.config.general,
        google: {
          ...data.config.google,
          // 🧼 تنظيف قبل الإرسال — يُصلح قيمة فاسدة محفوظة سابقاً حتى لو
          // لم يعدل المستخدم الحقل (يكفي الضغط على حفظ مرة واحدة)
          ga4MeasurementId: sanitizeId(data.config.google.ga4MeasurementId),
          adsConversionId: sanitizeId(data.config.google.adsConversionId),
          gtmId: sanitizeId(data.config.google.gtmId),
          ga4ApiSecret:
            secrets.ga4ApiSecret === SECRET_CLEAR
              ? SECRET_CLEAR
              : secrets.ga4ApiSecret || "",
        },
        meta: {
          ...data.config.meta,
          pixelId: sanitizeId(data.config.meta.pixelId),
          datasetId: sanitizeId(data.config.meta.datasetId),
          testEventCode: sanitizeId(data.config.meta.testEventCode),
          capiToken:
            secrets.capiToken === SECRET_CLEAR
              ? SECRET_CLEAR
              : secrets.capiToken || "",
        },
        tiktok: {
          ...data.config.tiktok,
          pixelId: sanitizeId(data.config.tiktok.pixelId),
          testEventCode: sanitizeId(data.config.tiktok.testEventCode),
          eventsApiToken:
            secrets.eventsApiToken === SECRET_CLEAR
              ? SECRET_CLEAR
              : secrets.eventsApiToken || "",
        },
      };
      const res = await api<{ ok: boolean; warnings?: string[] }>(
        "/api/admin/tracking",
        { method: "PUT", body },
      );
      if (res?.warnings?.length) {
        toast.warning(res.warnings[0]);
      } else {
        toast.success("تم حفظ إعدادات التتبع");
      }
      setSecrets({ ga4ApiSecret: "", capiToken: "", eventsApiToken: "" });
      await load();
    } catch (e: any) {
      toast.error(e?.message || "فشل الحفظ");
    } finally {
      setSaving(false);
    }
  };

  /** هل توجد تغييرات غير محفوظة؟ (مقارنة عميقة رخيصة على كائن صغير) */
  const dirty = React.useMemo(() => {
    if (!data || !snapshot) return false;
    if (JSON.stringify(data.config) !== JSON.stringify(snapshot)) return true;
    return Object.values(secrets).some((v) => v !== "");
  }, [data, snapshot, secrets]);

  const revert = () => {
    if (!snapshot) return;
    setData((p) => (p ? { ...p, config: snapshot } : p));
    setSecrets({ ga4ApiSecret: "", capiToken: "", eventsApiToken: "" });
    toast.info("تم التراجع عن التغييرات غير المحفوظة");
  };

  if (loading || !data) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-3.5">
        <Skeleton className="h-56 w-full rounded-xl sm:h-52" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  const cfg = data.config;
  const setGeneral = (k: keyof TrackingSettings["general"], v: boolean) =>
    setData((p) =>
      p
        ? {
            ...p,
            config: { ...p.config, general: { ...p.config.general, [k]: v } },
          }
        : p,
    );
  const setGoogle = (patch: Partial<TrackingSettings["google"]>) =>
    setData((p) =>
      p
        ? {
            ...p,
            config: { ...p.config, google: { ...p.config.google, ...patch } },
          }
        : p,
    );
  const setMeta = (patch: Partial<TrackingSettings["meta"]>) =>
    setData((p) =>
      p
        ? {
            ...p,
            config: { ...p.config, meta: { ...p.config.meta, ...patch } },
          }
        : p,
    );
  const setTikTok = (patch: Partial<TrackingSettings["tiktok"]>) =>
    setData((p) =>
      p
        ? {
            ...p,
            config: { ...p.config, tiktok: { ...p.config.tiktok, ...patch } },
          }
        : p,
    );

  const secretInput = (
    key: "ga4ApiSecret" | "capiToken" | "eventsApiToken",
    opts: {
      set: boolean;
      masked: string | null;
      placeholder: string;
      onClear: () => void;
    },
  ) => {
    const visible = showSecret[key];
    const cleared = secrets[key] === SECRET_CLEAR;
    const hasValue = secrets[key] !== "" && !cleared;
    return (
      <div className="flex gap-1.5">
        <div className="relative flex-1">
          {/* 🛠️ كان type="password" فيعتبره Chrome حقل «كلمة سر» ويملأ الحقل النصي
              السابق (GA4 Measurement ID) بالإيميل المحفوظ. الحل: حقل نصي عادي
              مُقنَّع بـ CSS — لا يوجد password field فلا يعمل الـ autofill. */}
          <Input
            type="text"
            name={`secret-${key}`}
            dir="ltr"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-lpignore="true"
            data-1p-ignore
            data-bwignore="true"
            data-form-type="other"
            style={
              visible && hasValue
                ? undefined
                : ({ WebkitTextSecurity: "disc" } as React.CSSProperties)
            }
            placeholder={
              cleared
                ? "سيتم الإزالة عند الحفظ"
                : opts.set
                  ? `محفوظ (${opts.masked ?? "••••"}) — اكتب قيمة جديدة للتغيير`
                  : opts.placeholder
            }
            value={cleared ? "" : secrets[key]}
            onChange={(e) =>
              setSecrets((s) => ({ ...s, [key]: e.target.value }))
            }
            className={cn("pl-9", MONO_INPUT)}
          />
          <button
            type="button"
            tabIndex={-1}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-lime-600 dark:hover:text-lime-300"
            onClick={() => setShowSecret((v) => ({ ...v, [key]: !v[key] }))}
            title={visible ? "إخفاء" : "إظهار"}
          >
            {visible ? (
              <EyeOff className="size-4" />
            ) : (
              <Eye className="size-4" />
            )}
          </button>
        </div>
        {opts.set && !cleared && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            title="إزالة القيمة المحفوظة عند الحفظ"
            onClick={() => {
              opts.onClear();
              toast.info("سيتم إزالة القيمة عند الحفظ");
            }}
          >
            <Trash2 className="size-4 text-destructive" />
          </Button>
        )}
      </div>
    );
  };

  const connectedCount = data.statuses.filter((s) => s.connected).length;
  const isSettings = page === "settings";
  const isEvents = page === "events";

  return (
    <div className="mx-auto w-full max-w-5xl space-y-3.5">
      {(isSettings || isEvents) && (
        <>
          {/* ─── 📡 الهيرو: محطة الإشارة ─── */}
          <section className="animate-in-up relative overflow-hidden rounded-xl border border-lime-500/20 bg-zinc-950 text-zinc-100 shadow-lg shadow-zinc-950/20">
            <div aria-hidden className="absolute inset-0" style={CIRCUIT_BG} />
            <div
              aria-hidden
              className="absolute -top-28 start-1/4 size-96 rounded-full bg-lime-400/[0.06] blur-3xl"
            />
            <RadioTower
              aria-hidden
              strokeWidth={1}
              className="absolute -bottom-10 -start-8 size-40 rotate-[-8deg] text-lime-400/[0.07]"
            />

            <div className="relative flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center">
              <RadarScope statuses={data.statuses} />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    dir="ltr"
                    className="rounded border border-lime-400/30 bg-lime-400/10 px-1.5 py-0.5 font-mono text-[9.5px] font-black tracking-[0.28em] text-lime-300"
                  >
                    {isSettings ? "TRK · CFG" : "TRK · LOG"}
                  </span>
                  {/* شارة البث — تتفاعل لحظياً مع القاطع الرئيسي */}
                  <span
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10.5px] font-black",
                      cfg.general.enabled
                        ? "border-lime-400/40 bg-lime-400/15 text-lime-300"
                        : "border-zinc-700 bg-zinc-800/60 text-zinc-400",
                    )}
                  >
                    <span className="relative flex size-2">
                      {cfg.general.enabled && (
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-lime-400 opacity-60" />
                      )}
                      <span
                        className={cn(
                          "relative inline-flex size-2 rounded-full",
                          cfg.general.enabled
                            ? "bg-lime-400 shadow-[0_0_6px_rgba(163,230,53,.7)]"
                            : "bg-zinc-500",
                        )}
                      />
                      {cfg.general.enabled ? "البث نشط" : "البث متوقف"}
                    </span>
                  </span>
                </div>

                <h1 className="mt-2 text-xl font-black tracking-tight text-zinc-50 sm:text-2xl">
                  {isSettings ? "محطة الإشارة" : "سجل البث"}
                </h1>
                <p className="mt-1 text-xs text-zinc-400">
                  {isSettings
                    ? "إعدادات التتبع والتسويق — Google · Meta · TikTok"
                    : "أحداث التتبع المرسلة من السيرفر لكل منصة"}
                </p>

                {/* العداد الرئيسي + شرائح الإحصاء */}
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2.5">
                  <div className="shrink-0">
                    <p
                      dir="ltr"
                      className="font-mono text-[2rem] font-black leading-none tabular-nums"
                    >
                      <span className="text-lime-300">{connectedCount}</span>
                      <span className="text-zinc-600">
                        /{data.statuses.length}
                      </span>
                    </p>
                    <p className="mt-1 text-[11px] font-bold text-zinc-400">
                      قنوات بث نشطة
                    </p>
                  </div>
                  <div className="flex h-full flex-col justify-center gap-1.5 border-s border-lime-400/15 ps-4">
                    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-300">
                      <Activity className="size-3.5 shrink-0 text-lime-300" />
                      أحداث مرسلة:
                      <b className="font-mono tabular-nums text-zinc-100">
                        {data.stats.sentCount}
                      </b>
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-xs text-zinc-300">
                      <AlertTriangle
                        className={cn(
                          "size-3.5 shrink-0",
                          data.stats.failedCount > 0
                            ? "text-red-400"
                            : "text-zinc-500",
                        )}
                      />
                      أحداث فاشلة:
                      <b
                        className={cn(
                          "font-mono tabular-nums",
                          data.stats.failedCount > 0
                            ? "text-red-300"
                            : "text-zinc-200",
                        )}
                      >
                        {data.stats.failedCount}
                      </b>
                    </span>
                    {data.stats.lastEvent && (
                      <span className="inline-flex max-w-full items-center gap-1.5 truncate text-xs text-zinc-400">
                        <Clock className="size-3.5 shrink-0" />
                        آخر حدث:
                        <b className="font-mono text-zinc-100">
                          {data.stats.lastEvent.eventName}
                        </b>
                        <span className="font-mono text-[10px] text-zinc-500">
                          ({data.stats.lastEvent.provider} ·{" "}
                          {new Date(
                            data.stats.lastEvent.createdAt,
                          ).toLocaleString("ar-EG")}
                          )
                        </span>
                      </span>
                    )}
                  </div>
                </div>

                {/* أوامر الهيرو */}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {isSettings ? (
                    <>
                      <Button
                        onClick={save}
                        disabled={saving}
                        className="h-9 min-w-32 bg-gradient-to-l from-lime-600 to-lime-400 font-extrabold text-zinc-950 shadow-md shadow-lime-950/40 transition-all hover:brightness-105"
                      >
                        {saving ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Save className="size-4" />
                        )}
                        حفظ الإعدادات
                      </Button>
                      <Button
                        variant="outline"
                        onClick={load}
                        disabled={loading}
                        className="h-9 border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
                      >
                        <RefreshCw
                          className={cn(
                            "size-4",
                            loading && "animate-spin",
                          )}
                        />
                        إعادة تحميل
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      onClick={load}
                      disabled={loading}
                      className="h-9 border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
                    >
                      <RefreshCw
                        className={cn("size-4", loading && "animate-spin")}
                      />
                      تحديث السجل
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* شريط البث — إشارة تتدفق على حافة المحطة */}
            <div
              aria-hidden
              className="flow-strip relative h-[3px] w-full"
              style={FLOW_STRIP}
            />
          </section>

          {/* ─── 🛡️ تنبيه: جداول التتبع غير مُهيّأة (قبل الترحيل) ─── */}
          {data.tablesReady === false && (
            <div className="animate-in-up stagger-1 relative overflow-hidden rounded-xl border border-amber-500/45 bg-amber-500/[0.08] p-3.5 text-sm">
              <div
                aria-hidden
                className="absolute inset-y-0 start-0 w-1 bg-gradient-to-b from-amber-400 to-amber-600"
              />
              <p className="flex items-center gap-2 font-extrabold text-amber-700 dark:text-amber-300">
                <AlertTriangle className="size-4 shrink-0" />
                جداول التتبع غير موجودة في قاعدة البيانات — خطوة تهيئة مطلوبة
              </p>
              <div className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
                <p>
                  الإعدادات أدناه تعمل وتُحفظ طبيعياً، لكن لن تُسجَّل الأحداث
                  حتى إنشاء الجدولين. اختر إحدى طريقتين:
                </p>
                <p>
                  <b className="text-foreground">1) الأسهل:</b> افتح{" "}
                  <b className="text-foreground">Supabase → SQL Editor</b> وشغّل
                  ملف{" "}
                  <code
                    className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-amber-700 dark:text-amber-300"
                    dir="ltr"
                  >
                    prisma/migrations/20261008_add_tracking_tables/migration.sql
                  </code>
                </p>
                <p>
                  <b className="text-foreground">2) أو:</b> من جهازك مع{" "}
                  <code
                    className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-amber-700 dark:text-amber-300"
                    dir="ltr"
                  >
                    DATABASE_URL
                  </code>{" "}
                  الخاص بالإنتاج شغّل{" "}
                  <code
                    className="rounded bg-muted px-1 py-0.5 font-mono text-[10px] text-amber-700 dark:text-amber-300"
                    dir="ltr"
                  >
                    npx prisma migrate deploy
                  </code>
                </p>
              </div>
            </div>
          )}

          {/* ─── حالة القنوات — أعمدة إشارة ─── */}
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {data.statuses.map((s, i) => (
              <ChannelCard key={s.key} s={s} index={i} />
            ))}
          </div>
        </>
      )}

      {page === "funnel" && <TrackingFunnel />}

      {page === "attribution" && <TrackingAttribution />}

      {page === "campaigns" && <UtmBuilder />}

      {page === "settings" && (
        <div className="space-y-3.5">
          {/* ─── توضيح مهم: لا إيميل/كلمة مرور في أي حقل هنا ─── */}
          <div className="animate-in-up stagger-1 relative overflow-hidden rounded-xl border border-lime-500/35 bg-lime-500/[0.06] p-3.5 text-sm">
            <div
              aria-hidden
              className="absolute inset-y-0 start-0 w-1 bg-gradient-to-b from-lime-400 to-lime-600"
            />
            <p className="flex items-start gap-2 font-extrabold text-lime-700 dark:text-lime-300">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              لا تحتاج إيميل أو كلمة مرور لأي منصة هنا
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              كل الحقول تقبل <b className="text-foreground">معرّفات وتوكنات</b>{" "}
              فقط — تُنسخ من صفحات المطورين لكل منصة (المسار مكتوب تحت كل خانة).
              لا علاقة لأي حقل بحسابك في جوجل/فيسبوك/تيكتوك ولا يتم تسجيل دخول
              بأي شكل.
            </p>
          </div>

          {/* ─── وحدة التحكم الرئيسية ─── */}
          <RackCard
            icon={<Power className="size-4" />}
            title="إعدادات عامة"
            sublabel="MASTER · CONSOLE"
            channel="SYS-00"
            enabled={cfg.general.enabled}
            onToggle={(v) => setGeneral("enabled", v)}
            delay={100}
          >
            <CardContent className="space-y-3 p-3.5">
              <SwitchRow
                master
                label="التتبع (Tracking)"
                desc="المفتاح الرئيسي — عند الإيقاف يتوقف كل الإرسال لكل المنصات فوراً"
                checked={cfg.general.enabled}
                onChange={(v) => setGeneral("enabled", v)}
                icon={<Power className="size-3.5" />}
              />
              <SwitchRow
                label="Debug Mode"
                desc="تسجيل تفاصيل الأحداث في Console — للتشخيص فقط"
                checked={cfg.general.debugMode}
                onChange={(v) => setGeneral("debugMode", v)}
                icon={<Bug className="size-3.5" />}
              />
              <SwitchRow
                label="Test Mode"
                desc="أحداث اختبار — استخدم Test Events في مديري الأحداث للمنصات للتحقق"
                checked={cfg.general.testMode}
                onChange={(v) => setGeneral("testMode", v)}
                icon={<FlaskConical className="size-3.5" />}
              />
              <SwitchRow
                label="Consent Management"
                desc="احترام موافقة المستخدم (Google Consent Mode v2) قبل أي إرسال إعلاني"
                checked={cfg.general.consentManagement}
                onChange={(v) => setGeneral("consentManagement", v)}
                icon={<ShieldCheck className="size-3.5" />}
              />
            </CardContent>
          </RackCard>

          {/* ─── القناة 01: Google ─── */}
          <RackCard
            icon={<Globe className="size-4" />}
            title="Google"
            sublabel="GA4 · ADS · GTM"
            channel="CH-01"
            enabled={cfg.google.enabled}
            onToggle={(v) => setGoogle({ enabled: v })}
            delay={150}
          >
            {cfg.google.enabled ? (
              <CardContent className="space-y-3 p-3.5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="GA4 Measurement ID"
                    hint="من Analytics → Data Streams (G-XXXXXXXXXX)"
                  >
                    <Input
                      dir="ltr"
                      autoComplete="off"
                      data-lpignore="true"
                      data-1p-ignore
                      placeholder="G-XXXXXXXXXX"
                      value={cfg.google.ga4MeasurementId}
                      onChange={(e) =>
                        setGoogle({
                          ga4MeasurementId: sanitizeId(e.target.value),
                        })
                      }
                      className={MONO_INPUT}
                    />
                  </Field>
                  <Field
                    label="GA4 API Secret (Server-side)"
                    hint="من نفس صفحة الـ Data Stream ← Measurement Protocol API secrets ← Create — ليس كلمة مرور حسابك"
                  >
                    {secretInput("ga4ApiSecret", {
                      set: cfg.google.ga4ApiSecretSet,
                      masked: cfg.google.ga4ApiSecretMasked,
                      placeholder: "غير مضبوط — اختياري",
                      onClear: () => clearSecret("ga4ApiSecret"),
                    })}
                  </Field>
                </div>
                <Separator />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Google Ads Conversion ID"
                    hint="من Ads → Conversion (AW-XXXXXXXXX)"
                  >
                    <Input
                      dir="ltr"
                      autoComplete="off"
                      data-lpignore="true"
                      data-1p-ignore
                      placeholder="AW-123456789"
                      value={cfg.google.adsConversionId}
                      onChange={(e) =>
                        setGoogle({
                          adsConversionId: sanitizeId(e.target.value),
                        })
                      }
                      className={MONO_INPUT}
                    />
                  </Field>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="تسمية التسجيل" hint="Signup">
                      <Input
                        dir="ltr"
                        autoComplete="off"
                        data-lpignore="true"
                        data-1p-ignore
                        placeholder="abc123"
                        value={cfg.google.adsLabels.registration}
                        onChange={(e) =>
                          setGoogle({
                            adsLabels: {
                              ...cfg.google.adsLabels,
                              registration: e.target.value,
                            },
                          })
                        }
                        className={MONO_INPUT}
                      />
                    </Field>
                    <Field label="تسمية التجربة" hint="Trial">
                      <Input
                        dir="ltr"
                        autoComplete="off"
                        data-lpignore="true"
                        data-1p-ignore
                        placeholder="def456"
                        value={cfg.google.adsLabels.trial}
                        onChange={(e) =>
                          setGoogle({
                            adsLabels: {
                              ...cfg.google.adsLabels,
                              trial: e.target.value,
                            },
                          })
                        }
                        className={MONO_INPUT}
                      />
                    </Field>
                    <Field label="تسمية الشراء" hint="Purchase">
                      <Input
                        dir="ltr"
                        autoComplete="off"
                        data-lpignore="true"
                        data-1p-ignore
                        placeholder="ghi789"
                        value={cfg.google.adsLabels.purchase}
                        onChange={(e) =>
                          setGoogle({
                            adsLabels: {
                              ...cfg.google.adsLabels,
                              purchase: e.target.value,
                            },
                          })
                        }
                        className={MONO_INPUT}
                      />
                    </Field>
                  </div>
                </div>
                <Separator />
                <div className="grid gap-3 sm:grid-cols-2">
                  <SwitchRow
                    label="Google Tag / GTM"
                    desc="تحميل حاوية GTM بدلاً من gtag مباشر"
                    checked={cfg.google.useGtm}
                    onChange={(v) => setGoogle({ useGtm: v })}
                  />
                  {cfg.google.useGtm && (
                    <Field
                      label="Google Tag ID"
                      hint="GTM-XXXXXXX أو G-XXXX"
                    >
                      <Input
                        dir="ltr"
                        autoComplete="off"
                        data-lpignore="true"
                        data-1p-ignore
                        placeholder="GTM-XXXXXXX"
                        value={cfg.google.gtmId}
                        onChange={(e) =>
                          setGoogle({ gtmId: sanitizeId(e.target.value) })
                        }
                        className={MONO_INPUT}
                      />
                    </Field>
                  )}
                </div>
                <Separator />
                <SwitchRow
                  label="Enhanced Conversions"
                  desc="تطبيع وتهشئ email/phone (SHA-256) لتحسين دقة التحويلات — يُرسل فقط عند توفر البيانات قانونياً"
                  checked={cfg.google.enhancedConversions}
                  onChange={(v) => setGoogle({ enhancedConversions: v })}
                />
                <SwitchRow
                  label="Google Consent Mode"
                  desc="تفعيل أنماط الموافقة (ad_storage / analytics_storage / ad_user_data / ad_personalization)"
                  checked={cfg.google.consentMode}
                  onChange={(v) => setGoogle({ consentMode: v })}
                />
              </CardContent>
            ) : (
              <RackOff />
            )}
          </RackCard>

          {/* ─── القناة 02: Meta ─── */}
          <RackCard
            icon={<Facebook className="size-4" />}
            title="Meta (Pixel + Conversions API)"
            sublabel="PIXEL · CAPI"
            channel="CH-02"
            enabled={cfg.meta.enabled}
            onToggle={(v) => setMeta({ enabled: v })}
            delay={200}
          >
            {cfg.meta.enabled ? (
              <CardContent className="space-y-3 p-3.5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Meta Pixel ID"
                    hint="من Events Manager ← Data Sources ← انسخ ID البكسل (أرقام فقط)"
                  >
                    <Input
                      dir="ltr"
                      autoComplete="off"
                      data-lpignore="true"
                      data-1p-ignore
                      placeholder="123456789012345"
                      value={cfg.meta.pixelId}
                      onChange={(e) =>
                        setMeta({ pixelId: sanitizeId(e.target.value) })
                      }
                      className={MONO_INPUT}
                    />
                  </Field>
                  <Field
                    label="Dataset ID"
                    hint="اختياري — نفس الـ Pixel ID غالباً في الإعدادات الحديثة"
                  >
                    <Input
                      dir="ltr"
                      autoComplete="off"
                      data-lpignore="true"
                      data-1p-ignore
                      placeholder="نفس Pixel ID افتراضياً"
                      value={cfg.meta.datasetId}
                      onChange={(e) =>
                        setMeta({ datasetId: sanitizeId(e.target.value) })
                      }
                      className={MONO_INPUT}
                    />
                  </Field>
                </div>
                <Field
                  label="Conversions API Access Token 🔒"
                  hint="مطلوب لأحداث السيرفر (التسجيل/الدفع) — من: Events Manager ← افتح البكسل ← Settings ← Conversions API ← Generate access token"
                >
                  {secretInput("capiToken", {
                    set: cfg.meta.capiTokenSet,
                    masked: cfg.meta.capiTokenMasked,
                    placeholder: "أدخل توكن Conversions API",
                    onClear: () => clearSecret("capiToken"),
                  })}
                </Field>
                {!cfg.meta.capiTokenSet && (
                  <p className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    بدون هذا التوكن: بكسل المتصفح يرسل PageView وأحداثه فقط، لكن
                    كل أحداث السيرفر المهمة (تسجيل / تجربة / دفع) لن تصل لـ Meta
                    إطلاقاً.
                  </p>
                )}
                <Field
                  label="Test Event Code (اختياري)"
                  hint="من Events Manager → Test Events — يُرسل فقط عند تفعيل وضع الاختبار"
                >
                  <Input
                    dir="ltr"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore
                    placeholder="TEST12345"
                    value={cfg.meta.testEventCode}
                    onChange={(e) =>
                      setMeta({ testEventCode: sanitizeId(e.target.value) })
                    }
                    className={MONO_INPUT}
                  />
                </Field>
                <p className="text-[11px] text-muted-foreground">
                  عند التفعيل: الأحداث المهمة تُرسل Browser + Server بنفس
                  event_id (Deduplication تلقائي في Events Manager).
                </p>
              </CardContent>
            ) : (
              <RackOff />
            )}
          </RackCard>

          {/* ─── القناة 03: TikTok ─── */}
          <RackCard
            icon={<Music2 className="size-4" />}
            title="TikTok (Pixel + Events API)"
            sublabel="PIXEL · EVENTS API"
            channel="CH-03"
            enabled={cfg.tiktok.enabled}
            onToggle={(v) => setTikTok({ enabled: v })}
            delay={250}
          >
            {cfg.tiktok.enabled ? (
              <CardContent className="space-y-3 p-3.5">
                <Field
                  label="TikTok Pixel ID"
                  hint="من Events Manager → Web Events"
                >
                  <Input
                    dir="ltr"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore
                    placeholder="CXXXXXXXXXXXXXXXXXXX"
                    value={cfg.tiktok.pixelId}
                    onChange={(e) =>
                      setTikTok({ pixelId: sanitizeId(e.target.value) })
                    }
                    className={MONO_INPUT}
                  />
                </Field>
                <Field
                  label="Events API Access Token 🔒"
                  hint="مطلوب لأحداث السيرفر — من: TikTok Events Manager ← افتح مصدر الويب ← Settings ← Events API Tokens"
                >
                  {secretInput("eventsApiToken", {
                    set: cfg.tiktok.eventsApiTokenSet,
                    masked: cfg.tiktok.eventsApiTokenMasked,
                    placeholder: "أدخل توكن Events API",
                    onClear: () => clearSecret("eventsApiToken"),
                  })}
                </Field>
                {!cfg.tiktok.eventsApiTokenSet && (
                  <p className="flex items-start gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    بدون هذا التوكن: أحداث السيرفر المهمة (تسجيل / تجربة / دفع)
                    لن تصل لـ TikTok إطلاقاً.
                  </p>
                )}
                <Field
                  label="Test Event Code (اختياري)"
                  hint="من Events Manager → Test Events — يُرسل فقط عند تفعيل وضع الاختبار"
                >
                  <Input
                    dir="ltr"
                    autoComplete="off"
                    data-lpignore="true"
                    data-1p-ignore
                    placeholder="TESTXXXX"
                    value={cfg.tiktok.testEventCode}
                    onChange={(e) =>
                      setTikTok({ testEventCode: sanitizeId(e.target.value) })
                    }
                    className={MONO_INPUT}
                  />
                </Field>
              </CardContent>
            ) : (
              <RackOff />
            )}
          </RackCard>

          {/* زر الحفظ الثابت أسفل النموذج — متاح دائماً حتى بدون
              تعديلات (يكفي ضغطة واحدة لإصلاح قيمة فاسدة محفوظة سابقاً) */}
          <div className="flex items-center justify-end gap-2 pb-3">
            <Button
              onClick={save}
              disabled={saving}
              className="h-9 min-w-36 bg-gradient-to-l from-lime-600 to-lime-400 font-extrabold text-zinc-950 shadow-md shadow-lime-950/40 transition-all hover:brightness-105"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              حفظ الإعدادات
            </Button>
          </div>

          {/* ─── شريط الحفظ اللاصق — يظهر فقط عند وجود تغييرات ─── */}
          {dirty && (
            <div className="sticky bottom-3 z-30 animate-in-up">
              <div className="relative flex flex-wrap items-center gap-3 overflow-hidden rounded-xl border border-lime-400/40 bg-zinc-950/95 px-3.5 py-2.5 shadow-2xl shadow-zinc-950/50 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/90">
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-60"
                  style={CIRCUIT_BG}
                />
                <span className="relative flex size-2.5">
                  <span className="relative inline-flex size-2.5 rounded-full bg-lime-400 shadow-[0_0_7px_rgba(163,230,53,.7)]" />
                </span>
                <p className="relative text-sm font-extrabold text-zinc-100">
                  لديك تغييرات غير محفوظة
                </p>
                <p
                  dir="ltr"
                  className="relative hidden font-mono text-[9.5px] font-bold tracking-[0.28em] text-lime-300/60 sm:block"
                >
                  UNSAVED CONFIG
                </p>
                <div className="relative ms-auto flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={revert}
                    disabled={saving}
                    className="border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
                  >
                    التراجع
                  </Button>
                  <Button
                    size="sm"
                    onClick={save}
                    disabled={saving}
                    className="bg-gradient-to-l from-lime-600 to-lime-400 font-extrabold text-zinc-950 hover:brightness-105"
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    حفظ الآن
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {page === "events" && (
        <div className="animate-in-up stagger-1 space-y-2.5">
          <p className="text-xs leading-relaxed text-muted-foreground">
            آخر 50 حدثاً من السيرفر — بدون بيانات عملاء حساسة. تشاهد هنا ما
            يصل لكل منصة عند تفعيل Debug/Test Mode.
          </p>

          {/* ─── سجل البث — تيرمينال داكن دائماً ─── */}
          <div className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-lg shadow-zinc-950/20 dark:border-zinc-800">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-zinc-800 bg-zinc-950 px-3.5 py-2">
              <Terminal className="size-4 shrink-0 text-lime-300" />
              <p className="font-mono text-[11px] font-bold tracking-[0.18em] text-zinc-200">
                سجل البث
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-lime-400/30 bg-lime-400/10 px-2 py-0.5 font-mono text-[9px] font-black tracking-[0.2em] text-lime-300">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-lime-400 opacity-60" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-lime-400" />
                </span>
                LIVE
              </span>
              <span
                dir="ltr"
                className="ms-auto font-mono text-[10px] tabular-nums text-zinc-500"
              >
                {data.events.length} EVT
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={load}
                disabled={loading}
                className="h-8 border-zinc-700 bg-transparent text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
              >
                <RefreshCw
                  className={cn("size-3.5", loading && "animate-spin")}
                />
                تحديث
              </Button>
            </div>

            {data.events.length === 0 ? (
              <div className="relative overflow-hidden px-6 py-12 text-center">
                <div
                  aria-hidden
                  className="absolute inset-0 opacity-30"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(0deg, rgba(163,230,53,.06) 0 1px, transparent 1px 4px)",
                  }}
                />
                <RadioTower
                  aria-hidden
                  strokeWidth={1.2}
                  className="relative mx-auto size-12 text-lime-400/35"
                />
                <p className="relative mt-3 text-sm text-zinc-400">
                  لا أحداث بعد — فعّل التتبع وأدخل معرفات المنصات ثم جرّب رحلة
                  تسجيل/دفع حقيقية.
                </p>
                <p
                  dir="ltr"
                  className="relative mt-2 font-mono text-[10px] font-bold tracking-[0.35em] text-lime-300/40"
                >
                  NO SIGNAL
                </p>
              </div>
            ) : (
              <div className="max-h-[480px] overflow-auto" dir="rtl">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-zinc-900">
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                      <TableHead className="h-10 text-right text-[10.5px] font-bold text-zinc-400">
                        الحدث
                      </TableHead>
                      <TableHead className="text-right text-[10.5px] font-bold text-zinc-400">
                        المنصة
                      </TableHead>
                      <TableHead className="text-right text-[10.5px] font-bold text-zinc-400">
                        Event ID
                      </TableHead>
                      <TableHead className="text-right text-[10.5px] font-bold text-zinc-400">
                        المصدر
                      </TableHead>
                      <TableHead className="text-right text-[10.5px] font-bold text-zinc-400">
                        الحالة
                      </TableHead>
                      <TableHead className="text-right text-[10.5px] font-bold text-zinc-400">
                        الوقت
                      </TableHead>
                      <TableHead className="text-right text-[10.5px] font-bold text-zinc-400">
                        خطأ
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.events.map((ev) => (
                      <TableRow
                        key={ev.id}
                        className="border-zinc-800/60 hover:bg-zinc-800/60"
                      >
                        <TableCell className="py-2.5 font-mono text-[12px] font-bold text-zinc-100">
                          {ev.eventName}
                        </TableCell>
                        <TableCell>
                          <ProviderBadge provider={ev.provider} />
                        </TableCell>
                        <TableCell
                          className="max-w-44 truncate font-mono text-[11px] text-zinc-400"
                          dir="ltr"
                          title={ev.eventId}
                        >
                          {ev.eventId}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="border-zinc-700 font-mono text-[10px] text-zinc-400"
                          >
                            {ev.source === "server" ? "Server" : "Browser"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={ev.status} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-[11px] text-zinc-400">
                          {new Date(ev.createdAt).toLocaleTimeString("ar-EG")}
                        </TableCell>
                        <TableCell
                          className="max-w-40 truncate font-mono text-[11px] text-red-400"
                          title={ev.error ?? undefined}
                        >
                          {ev.error ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ═════════════════════════ مكونات التوقيع ═════════════════════════ */

/** ── الرادار الحي — مكنسة دوّارة + بقع المنصات ── */
function RadarScope({ statuses }: { statuses: ProviderStatus[] }) {
  const spots = [
    { x: 27, y: 26 },
    { x: 71, y: 31 },
    { x: 33, y: 71 },
    { x: 69, y: 68 },
  ];
  const labels: Record<string, string> = {
    ga4: "GA4",
    google_ads: "ADS",
    meta: "META",
    tiktok: "TT",
  };
  return (
    <div
      dir="ltr"
      aria-hidden
      className="relative mx-auto size-32 shrink-0 rounded-full border border-lime-400/20 bg-[#0a0d08] shadow-[inset_0_0_40px_rgba(0,0,0,.8),0_0_28px_rgba(163,230,53,.06)] sm:size-36"
    >
      {/* حلقات المدى */}
      <div className="absolute inset-[6%] rounded-full border border-lime-400/[.12]" />
      <div className="absolute inset-[25%] rounded-full border border-lime-400/[.15]" />
      <div className="absolute inset-[44%] rounded-full border border-lime-400/[.2]" />
      {/* خطوط التصويب */}
      <div className="absolute bottom-[6%] top-[6%] left-1/2 w-px bg-lime-400/15" />
      <div className="absolute right-[6%] left-[6%] top-1/2 h-px bg-lime-400/15" />
      {/* المكنسة الدوّارة */}
      <div className="absolute inset-[6%] overflow-hidden rounded-full">
        <div
          className="radar-sweep absolute inset-0"
          style={{
            background:
              "conic-gradient(from 0deg, rgba(163,230,53,.34), rgba(163,230,53,.05) 55deg, transparent 70deg)",
          }}
        />
      </div>
      {/* بقع المنصات */}
      {statuses.slice(0, 4).map((s, i) => {
        const p = spots[i % 4];
        const on = s.connected;
        return (
          <div
            key={s.key}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${p.x}%`, top: `${p.y}%` }}
          >
            {on ? (
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-lime-400 opacity-70" />
                <span className="relative inline-flex size-2.5 rounded-full bg-lime-300 shadow-[0_0_7px_rgba(163,230,53,.8)]" />
              </span>
            ) : (
              <span className="block size-2 rounded-full border border-zinc-600" />
            )}
            <span
              className={cn(
                "absolute top-1/2 left-[calc(50%+7px)] -translate-y-1/2 font-mono text-[8px] font-black tracking-[0.14em]",
                on ? "text-lime-300/90" : "text-zinc-600",
              )}
            >
              {labels[s.key] ?? s.key}
            </span>
          </div>
        );
      })}
      {/* مركز المحطة */}
      <span className="absolute top-1/2 left-1/2 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-lime-300 shadow-[0_0_6px_rgba(163,230,53,.8)]" />
    </div>
  );
}

/** ── بطاقة قناة — عمود إشارة + LED + تفاصيل ── */
function ChannelCard({ s, index }: { s: ProviderStatus; index: number }) {
  const icons: Record<string, React.ComponentType<{ className?: string }>> = {
    ga4: BarChart3,
    google_ads: Megaphone,
    meta: Facebook,
    tiktok: Music2,
  };
  const Icon = icons[s.key] ?? Globe;
  // «ناقص الضبط» = يوجد تفاصيل حقيقية (ID مضبوط/فاسد) دون اكتمال الاتصال.
  // أما «Pixel ID غير مضبوط» فهي حالة فراغ كاملة → غير مضبوط.
  const unset =
    !s.detail || s.detail === "غير مضبوط" || s.detail.includes("غير مضبوط");
  const partial = !s.connected && !unset;
  const level = s.connected ? 4 : partial ? 2 : 0;
  const tone = level === 4 ? "lime" : level > 0 ? "amber" : "zinc";
  return (
    <div
      className={cn(
        "animate-in-up group relative overflow-hidden rounded-xl border bg-card p-3 shadow-sm transition-colors",
        level === 4 && "border-lime-500/40 dark:border-lime-400/30",
        level > 0 && level < 4 && "border-amber-500/40",
      )}
      style={{ animationDelay: `${(index + 2) * 50}ms` }}
    >
      {/* شريط LED العلوي */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-x-0 top-0 h-[3px]",
          level === 4
            ? "bg-gradient-to-l from-lime-600 via-lime-400 to-lime-600"
            : level > 0
              ? "bg-amber-400/70"
              : "bg-zinc-300/60 dark:bg-zinc-700",
        )}
      />
      <div className="flex items-center justify-between gap-2">
        <span
          dir="ltr"
          className="font-mono text-[9px] font-black tracking-[0.24em] text-muted-foreground"
        >
          CH-0{index + 1}
        </span>
        <SignalBars level={level} tone={tone} />
      </div>
      <div className="mt-2 flex items-center gap-2.5">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg border transition-colors",
            level === 4
              ? "border-lime-500/30 bg-lime-500/10 text-lime-600 dark:text-lime-300"
              : "border-border bg-muted/50 text-muted-foreground",
          )}
        >
          <Icon className="size-4" />
        </span>
        <p className="min-w-0 truncate text-[13px] font-extrabold">
          {s.label}
        </p>
      </div>
      <p
        dir="ltr"
        className="mt-2 truncate font-mono text-[11px] text-muted-foreground"
        title={s.detail}
      >
        {s.detail || "—"}
      </p>
      <div className="mt-2.5 flex items-center justify-between">
        {level === 4 ? (
          <Badge className="gap-1 border-0 bg-lime-500/15 text-lime-700 hover:bg-lime-500/15 dark:text-lime-300">
            متصل
          </Badge>
        ) : level > 0 ? (
          <Badge className="gap-1 border-0 bg-amber-500/15 text-amber-700 hover:bg-amber-500/15 dark:text-amber-400">
            <AlertTriangle className="size-3" />
            ناقص الضبط
          </Badge>
        ) : (
          <Badge
            variant="outline"
            className="gap-1 text-muted-foreground"
          >
            غير مضبوط
          </Badge>
        )}
        <Led on={level === 4} warn={level > 0 && level < 4} />
      </div>
    </div>
  );
}

/** ── LED — مؤشر ضوئي فيزيائي ── */
function Led({ on, warn }: { on?: boolean; warn?: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-2 shrink-0 rounded-full",
        on && "bg-lime-400 shadow-[0_0_6px_1px_rgba(163,230,53,.4)]",
        !on && warn && "bg-amber-400 shadow-[0_0_6px_1px_rgba(251,191,36,.35)]",
        !on && !warn && "bg-zinc-400/50 dark:bg-zinc-700",
      )}
    />
  );
}

/** ── أعمدة الإشارة — 4 شرائح تصاعدية ── */
function SignalBars({
  level,
  tone,
}: {
  level: number;
  tone: "lime" | "amber" | "zinc";
}) {
  const colors = {
    lime: "bg-gradient-to-t from-lime-600 to-lime-400",
    amber: "bg-gradient-to-t from-amber-500 to-amber-400",
    zinc: "bg-zinc-400/40 dark:bg-zinc-700",
  } as const;
  return (
    <span dir="ltr" aria-hidden className="flex items-end gap-[2.5px]">
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cn(
            "w-[3px] rounded-[1px]",
            i === 1 ? "h-1" : i === 2 ? "h-1.5" : i === 3 ? "h-2" : "h-2.5",
            i <= level ? colors[tone] : "bg-zinc-400/30 dark:bg-zinc-800",
          )}
        />
      ))}
    </span>
  );
}

/** ── بطاقة الرف — لوح داكن برأس معدني وقناة مرقمة ── */
function RackCard({
  icon,
  title,
  sublabel,
  channel,
  enabled,
  onToggle,
  delay,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  sublabel: string;
  channel: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  delay: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "animate-in-up overflow-hidden rounded-xl border bg-card shadow-sm transition-colors",
        enabled
          ? "border-lime-500/35 dark:border-lime-400/25"
          : "border-border",
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <header className="relative flex items-center gap-3 border-b border-zinc-800/80 bg-zinc-950 px-3.5 py-2.5">
        <div
          aria-hidden
          className="absolute inset-0 opacity-70"
          style={CIRCUIT_BG}
        />
        <div className="relative grid size-9 shrink-0 place-items-center rounded-lg border border-lime-400/30 bg-lime-400/10 text-lime-300">
          {icon}
        </div>
        <div className="relative min-w-0">
          <h3 className="truncate text-sm font-extrabold text-zinc-50">
            {title}
          </h3>
          <p
            dir="ltr"
            className="truncate font-mono text-[9px] font-black tracking-[0.22em] text-lime-300/60"
          >
            {channel} · {sublabel}
          </p>
        </div>
        <div className="relative ms-auto flex items-center gap-2.5">
          <Led on={enabled} />
          <Switch
            checked={enabled}
            onCheckedChange={onToggle}
            aria-label={`تفعيل ${title}`}
            className="data-[state=checked]:bg-lime-600"
          />
        </div>
      </header>
      {children}
    </section>
  );
}

/** ── شريط «القناة موقوفة» داخل بطاقة معطلة ── */
function RackOff() {
  return (
    <div className="flex items-center gap-2 bg-muted/30 px-3.5 py-3 text-xs font-medium text-muted-foreground">
      <Power className="size-3.5 shrink-0" />
      القناة موقوفة — فعّل المفتاح أعلاه لضبط الإعدادات
    </div>
  );
}

/** ── صف مفتاح كوحدة تحكم — LED بجانب كل مفتاح ── */
function SwitchRow({
  label,
  desc,
  checked,
  onChange,
  icon,
  master,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon?: React.ReactNode;
  master?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors",
        master
          ? "border-lime-500/50 bg-lime-500/[0.06] dark:border-lime-400/40 dark:bg-lime-400/[0.07]"
          : "border-border bg-card hover:border-lime-500/25",
      )}
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
          {icon && (
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded",
                checked
                  ? "text-lime-600 dark:text-lime-300"
                  : "text-muted-foreground",
              )}
            >
              {icon}
            </span>
          )}
          {label}
          {master && (
            <span
              dir="ltr"
              className={cn(
                "rounded px-1.5 py-0.5 font-mono text-[8.5px] font-black tracking-[0.22em]",
                checked
                  ? "bg-lime-500/15 text-lime-600 dark:bg-lime-400/15 dark:text-lime-300"
                  : "bg-muted text-muted-foreground",
              )}
            >
              MASTER
            </span>
          )}
        </p>
        {desc && (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {desc}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <Led on={checked} />
        <Switch
          checked={checked}
          onCheckedChange={onChange}
          aria-label={label}
          className="data-[state=checked]:bg-lime-600"
        />
      </div>
    </div>
  );
}

/** ── حقل إعداد — تسمية + عنصر + مسار المساعدة ── */
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="flex items-center gap-1.5 text-xs font-bold">
        <span aria-hidden className="size-1 rounded-[1px] bg-lime-500/70" />
        {label}
      </Label>
      {children}
      {hint && (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

/** ── شارة المنصة (داخل التيرمينال الداكن — ألوان مضيئة) ── */
function ProviderBadge({ provider }: { provider: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    meta: {
      label: "Meta",
      cls: "bg-blue-400/15 text-blue-300",
    },
    tiktok: {
      label: "TikTok",
      cls: "bg-rose-400/15 text-rose-300",
    },
    ga4: {
      label: "GA4",
      cls: "bg-amber-400/15 text-amber-300",
    },
    google_ads: {
      label: "Ads",
      cls: "bg-emerald-400/15 text-emerald-300",
    },
    internal: {
      label: "زيارة",
      cls: "bg-zinc-400/15 text-zinc-300",
    },
  };
  const it = map[provider] ?? {
    label: provider,
    cls: "bg-zinc-400/10 text-zinc-300",
  };
  return (
    <Badge className={`border-0 text-[10px] ${it.cls}`}>{it.label}</Badge>
  );
}

/** ── شارة الحالة (داخل التيرمينال الداكن) ── */
function StatusBadge({ status }: { status: string }) {
  if (status === "sent")
    return (
      <Badge className="border-0 bg-lime-500/12 text-lime-200/95">
        تم الإرسال
      </Badge>
    );
  if (status === "failed")
    return (
      <Badge className="border-0 bg-red-500/20 text-red-400">فشل</Badge>
    );
  return (
    <Badge
      variant="outline"
      className="border-zinc-700 text-zinc-400"
    >
      تجاهل
    </Badge>
  );
}
