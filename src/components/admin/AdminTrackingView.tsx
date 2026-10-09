"use client";

/**
 * ═══════════════════════════════════════════════════════════════════
 *  محطة الإشارة — Signal Station · صفحات التسويق والتتبع
 * ═══════════════════════════════════════════════════════════════════
 *  الهوية: أمبر (هوية لوحة السوبر أدمن) + أخضر للحالات النشطة، بألوان الثيم فاتح/داكن
 *  ─ عناصر التوقيع الخاص بهذه الصفحة فقط ─
 *   • شارة «البث نشط/متوقف» تتفاعل لحظياً مع القاطع الرئيسي
 *   • بطاقات القنوات CH-01..04 مع أعمدة إشارة (SignalBars) و LED
 *   • صفوف مفاتيح كوحدة تحكم فيزيائية (LED بجانب كل مفتاح)
 *   • سجل البث: جدول بخط أحادي بألوان الثيم
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

/* نمط الإدخال التقني: خط أحادي + تركيز لايمي */
const MONO_INPUT =
  "font-mono text-[13px] focus-visible:border-amber-500/60 focus-visible:ring-amber-500/25";

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
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-amber-600 dark:hover:text-amber-300"
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
          {/* ─── الهيدر: عنوان الصفحة + حالة البث + الإحصاء ─── */}
          <section className="animate-in-up relative overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div
              aria-hidden
              className="absolute inset-y-0 start-0 w-1 bg-gradient-to-b from-amber-400 to-amber-600"
            />
            <div className="flex flex-col gap-4 p-4 ps-5 sm:p-5 sm:ps-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    dir="ltr"
                    className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9.5px] font-black tracking-[0.28em] text-amber-700 dark:text-amber-300"
                  >
                    {isSettings ? "TRK · CFG" : "TRK · LOG"}
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10.5px] font-black",
                      cfg.general.enabled
                        ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "border-border bg-muted text-muted-foreground",
                    )}
                  >
                    <span className="relative flex size-2">
                      {cfg.general.enabled && (
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                      )}
                      <span
                        className={cn(
                          "relative inline-flex size-2 rounded-full",
                          cfg.general.enabled
                            ? "bg-emerald-500"
                            : "bg-muted-foreground/50",
                        )}
                      />
                    </span>
                    {cfg.general.enabled ? "البث نشط" : "البث متوقف"}
                  </span>
                </div>
                <h1 className="mt-2 text-xl font-black tracking-tight text-foreground sm:text-2xl">
                  {isSettings ? "إعدادات التتبع" : "سجل الأحداث"}
                </h1>
                <p className="mt-1 text-xs text-muted-foreground">
                  {isSettings
                    ? "إعدادات التتبع والتسويق — Google · Meta · TikTok"
                    : "أحداث التتبع المرسلة من السيرفر لكل منصة"}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <HeroStat
                  label="قنوات نشطة"
                  value={`${connectedCount}/${data.statuses.length}`}
                  tone="success"
                />
                <HeroStat label="أحداث مرسلة" value={String(data.stats.sentCount)} />
                <HeroStat
                  label="أحداث فاشلة"
                  value={String(data.stats.failedCount)}
                  tone={data.stats.failedCount > 0 ? "danger" : undefined}
                />
              </div>
            </div>

            {(isSettings || data.stats.lastEvent) && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border bg-muted/30 px-4 py-2.5 ps-5 sm:px-5 sm:ps-6">
                {isSettings && (
                  <>
                    <Button
                      onClick={save}
                      disabled={saving}
                      className="h-9 min-w-32 bg-gradient-to-l from-amber-600 to-amber-500 font-extrabold text-white shadow-md shadow-amber-900/20 transition-all hover:brightness-110"
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
                      className="h-9"
                    >
                      <RefreshCw
                        className={cn("size-4", loading && "animate-spin")}
                      />
                      إعادة تحميل
                    </Button>
                  </>
                )}
                {data.stats.lastEvent && (
                  <span className="ms-auto inline-flex max-w-full items-center gap-1.5 truncate text-xs text-muted-foreground">
                    <Clock className="size-3.5 shrink-0" />
                    آخر حدث:
                    <b className="font-mono text-foreground">
                      {data.stats.lastEvent.eventName}
                    </b>
                    <span className="font-mono text-[10px]">
                      ({data.stats.lastEvent.provider} ·{" "}
                      {new Date(data.stats.lastEvent.createdAt).toLocaleString(
                        "ar-EG",
                      )}
                      )
                    </span>
                  </span>
                )}
              </div>
            )}
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

          {/* ─── حالة القنوات — في الإعدادات فقط ─── */}
          {isSettings && (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {data.statuses.map((s, i) => (
                <ChannelCard key={s.key} s={s} index={i} />
              ))}
            </div>
          )}
        </>
      )}

      {page === "funnel" && <TrackingFunnel />}

      {page === "attribution" && <TrackingAttribution />}

      {page === "campaigns" && <UtmBuilder />}

      {page === "settings" && (
        <div className="space-y-3.5">
          {/* ─── توضيح مهم: لا إيميل/كلمة مرور في أي حقل هنا ─── */}
          <div className="animate-in-up stagger-1 relative overflow-hidden rounded-xl border border-emerald-500/35 bg-emerald-500/[0.06] p-3.5 text-sm">
            <div
              aria-hidden
              className="absolute inset-y-0 start-0 w-1 bg-gradient-to-b from-emerald-400 to-emerald-600"
            />
            <p className="flex items-start gap-2 font-extrabold text-emerald-700 dark:text-emerald-300">
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
              className="h-9 min-w-36 bg-gradient-to-l from-amber-600 to-amber-500 font-extrabold text-white shadow-md shadow-amber-900/20 transition-all hover:brightness-110"
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
              <div className="relative flex flex-wrap items-center gap-3 overflow-hidden rounded-xl border border-amber-500/40 bg-card/95 px-3.5 py-2.5 shadow-2xl shadow-black/20 backdrop-blur supports-[backdrop-filter]:bg-card/90">
                <span className="relative flex size-2.5">
                  <span className="relative inline-flex size-2.5 rounded-full bg-amber-500 shadow-[0_0_7px_rgba(245,158,11,.6)]" />
                </span>
                <p className="relative text-sm font-extrabold text-foreground">
                  لديك تغييرات غير محفوظة
                </p>
                <p
                  dir="ltr"
                  className="relative hidden font-mono text-[9.5px] font-bold tracking-[0.28em] text-amber-700/70 dark:text-amber-300/70 sm:block"
                >
                  UNSAVED CONFIG
                </p>
                <div className="relative ms-auto flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={revert}
                    disabled={saving}
                    className=""
                  >
                    التراجع
                  </Button>
                  <Button
                    size="sm"
                    onClick={save}
                    disabled={saving}
                    className="bg-gradient-to-l from-amber-600 to-amber-500 font-extrabold text-white hover:brightness-110"
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
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-border bg-muted/40 px-3.5 py-2.5">
              <Terminal className="size-4 shrink-0 text-amber-600 dark:text-amber-300" />
              <p className="font-mono text-[11px] font-bold tracking-[0.18em] text-foreground">
                سجل البث
              </p>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[9px] font-black tracking-[0.2em] text-emerald-700 dark:text-emerald-300">
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
                </span>
                LIVE
              </span>
              <span
                dir="ltr"
                className="ms-auto font-mono text-[10px] tabular-nums text-muted-foreground"
              >
                {data.events.length} EVT
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={load}
                disabled={loading}
                className="h-8 "
              >
                <RefreshCw
                  className={cn("size-3.5", loading && "animate-spin")}
                />
                تحديث
              </Button>
            </div>

            {data.events.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <RadioTower
                  aria-hidden
                  strokeWidth={1.2}
                  className="mx-auto size-12 text-muted-foreground/40"
                />
                <p className="mt-3 text-sm text-muted-foreground">
                  لا أحداث بعد — فعّل التتبع وأدخل معرفات المنصات ثم جرّب رحلة
                  تسجيل/دفع حقيقية.
                </p>
              </div>
            ) : (
              <div className="max-h-[480px] overflow-auto" dir="rtl">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-muted">
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="h-10 text-right text-[10.5px] font-bold text-muted-foreground">
                        الحدث
                      </TableHead>
                      <TableHead className="text-right text-[10.5px] font-bold text-muted-foreground">
                        المنصة
                      </TableHead>
                      <TableHead className="text-right text-[10.5px] font-bold text-muted-foreground">
                        Event ID
                      </TableHead>
                      <TableHead className="text-right text-[10.5px] font-bold text-muted-foreground">
                        المصدر
                      </TableHead>
                      <TableHead className="text-right text-[10.5px] font-bold text-muted-foreground">
                        الحالة
                      </TableHead>
                      <TableHead className="text-right text-[10.5px] font-bold text-muted-foreground">
                        الوقت
                      </TableHead>
                      <TableHead className="text-right text-[10.5px] font-bold text-muted-foreground">
                        خطأ
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.events.map((ev) => (
                      <TableRow
                        key={ev.id}
                        className="border-border hover:bg-muted/50"
                      >
                        <TableCell className="py-2.5 font-mono text-[12px] font-bold text-foreground">
                          {ev.eventName}
                        </TableCell>
                        <TableCell>
                          <ProviderBadge provider={ev.provider} />
                        </TableCell>
                        <TableCell
                          className="max-w-44 truncate font-mono text-[11px] text-muted-foreground"
                          dir="ltr"
                          title={ev.eventId}
                        >
                          {ev.eventId}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className="border-border font-mono text-[10px] text-muted-foreground"
                          >
                            {ev.source === "server" ? "Server" : "Browser"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={ev.status} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-[11px] text-muted-foreground">
                          {new Date(ev.createdAt).toLocaleTimeString("ar-EG")}
                        </TableCell>
                        <TableCell
                          className="max-w-40 truncate font-mono text-[11px] text-red-600 dark:text-red-400"
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

/** ── مربع إحصاء صغير في الهيدر ── */
function HeroStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "danger";
}) {
  return (
    <div className="min-w-[5.5rem] rounded-lg border border-border bg-muted/40 px-3 py-2 text-center">
      <p
        dir="ltr"
        className={cn(
          "font-mono text-xl font-black leading-none tabular-nums text-foreground",
          tone === "success" && "text-emerald-600 dark:text-emerald-300",
          tone === "danger" && "text-red-600 dark:text-red-400",
        )}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[10.5px] font-bold text-muted-foreground">
        {label}
      </p>
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
        level === 4 && "border-emerald-500/40 dark:border-emerald-400/30",
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
            ? "bg-gradient-to-l from-emerald-600 via-emerald-400 to-emerald-600"
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
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
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
          <Badge className="gap-1 border-0 bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300">
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
        on && "bg-emerald-400 shadow-[0_0_6px_1px_rgba(16,185,129,.4)]",
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
    lime: "bg-gradient-to-t from-emerald-600 to-emerald-400",
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
          ? "border-emerald-500/35 dark:border-emerald-400/25"
          : "border-border",
      )}
      style={{ animationDelay: `${delay}ms` }}
    >
      <header className="relative flex items-center gap-3 border-b border-border bg-muted/40 px-3.5 py-2.5">
        <div className="relative grid size-9 shrink-0 place-items-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300">
          {icon}
        </div>
        <div className="relative min-w-0">
          <h3 className="truncate text-sm font-extrabold text-foreground">
            {title}
          </h3>
          <p
            dir="ltr"
            className="truncate font-mono text-[9px] font-black tracking-[0.22em] text-muted-foreground"
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
            className="data-[state=checked]:bg-emerald-600"
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
          ? "border-amber-500/50 bg-amber-500/[0.06] dark:border-amber-400/40 dark:bg-amber-400/[0.07]"
          : "border-border bg-card hover:border-amber-500/30",
      )}
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
          {icon && (
            <span
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded",
                checked
                  ? "text-emerald-600 dark:text-emerald-300"
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
                  ? "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"
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
          className="data-[state=checked]:bg-emerald-600"
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
        <span aria-hidden className="size-1 rounded-[1px] bg-amber-500/70" />
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

/** ── شارة المنصة ── */
function ProviderBadge({ provider }: { provider: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    meta: {
      label: "Meta",
      cls: "bg-blue-500/10 text-blue-700 dark:bg-blue-400/15 dark:text-blue-300",
    },
    tiktok: {
      label: "TikTok",
      cls: "bg-rose-500/10 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
    },
    ga4: {
      label: "GA4",
      cls: "bg-amber-500/10 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
    },
    google_ads: {
      label: "Ads",
      cls: "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
    },
    internal: {
      label: "زيارة",
      cls: "bg-muted text-muted-foreground",
    },
  };
  const it = map[provider] ?? {
    label: provider,
    cls: "bg-muted text-muted-foreground",
  };
  return (
    <Badge className={`border-0 text-[10px] hover:bg-transparent ${it.cls}`}>
      {it.label}
    </Badge>
  );
}

/** ── شارة الحالة ── */
function StatusBadge({ status }: { status: string }) {
  if (status === "sent")
    return (
      <Badge className="border-0 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:bg-emerald-400/15 dark:text-emerald-300">
        تم الإرسال
      </Badge>
    );
  if (status === "failed")
    return (
      <Badge className="border-0 bg-red-500/10 text-red-600 hover:bg-red-500/10 dark:bg-red-400/15 dark:text-red-400">
        فشل
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-muted-foreground">
      تجاهل
    </Badge>
  );
}
