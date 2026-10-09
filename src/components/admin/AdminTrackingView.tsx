"use client";

/**
 * ═══════════════════════════════════════════════════════════════════
 * Marketing & Tracking — إعدادات التتبع + سجل الأحداث (إعادة تصميم)
 * ═══════════════════════════════════════════════════════════════════
 *  • إعدادات التتبع = «مركز الشبكات الإعلانية»: بطاقة بهوية كل شبكة
 *    (Google / Meta / TikTok) + لوحة إعدادات للشبكة المختارة.
 *  • سجل الأحداث = «مدير الأحداث»: شريط صحة القنوات، فلاتر، وتغذية حية
 *    للأحداث بتفاصيل قابلة للتوسيع (مثل Events Manager / DebugView).
 *
 * 🔒 الأسرار لا تُعرض أبداً — تظهر كنص Masked، وتُحفظ فقط عند إدخال
 * قيمة جديدة. حقل فارغ = بدون تغيير. زر «إزالة» يرسل __CLEAR__.
 */

import * as React from "react";
import {
  Save,
  Loader2,
  Globe,
  BarChart3,
  Megaphone,
  Music2,
  Infinity as InfinityIcon,
  ShieldCheck,
  FlaskConical,
  Bug,
  Power,
  Activity,
  RefreshCw,
  Eye,
  EyeOff,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Copy,
  ChevronDown,
  Search,
  Server,
  Monitor,
  Radio,
  Ban,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { toast } from "sonner";
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
  "funnel" | "attribution" | "campaigns" | "settings" | "events";

type NetId = "google" | "meta" | "tiktok";

// ─── هوية الشبكات الإعلانية ──────────────────────────────────────────

interface Brand {
  name: string;
  short: string;
  color: string;
  gradient: string;
  strip: string;
  icon: React.ElementType;
  glyph?: string;
  iconFx?: string;
}

const GOOGLE_STRIP =
  "linear-gradient(90deg,#4285F4 0 25%,#EA4335 25% 50%,#FBBC05 50% 75%,#34A853 75% 100%)";

const BRANDS: Record<string, Brand> = {
  google: {
    name: "Google",
    short: "Google",
    color: "#4285F4",
    gradient: "linear-gradient(135deg,#4285F4,#1A57D6)",
    strip: GOOGLE_STRIP,
    icon: Globe,
    glyph: "G",
  },
  ga4: {
    name: "Google Analytics 4",
    short: "GA4",
    color: "#F9AB00",
    gradient: "linear-gradient(135deg,#FBBC04,#E37400)",
    strip: "linear-gradient(90deg,#FBBC04,#E37400)",
    icon: BarChart3,
  },
  google_ads: {
    name: "Google Ads",
    short: "Ads",
    color: "#34A853",
    gradient: "linear-gradient(135deg,#4285F4,#34A853)",
    strip: "linear-gradient(90deg,#4285F4,#34A853)",
    icon: Megaphone,
  },
  meta: {
    name: "Meta",
    short: "Meta",
    color: "#0866FF",
    gradient: "linear-gradient(135deg,#0A7CFF,#0045D6)",
    strip: "linear-gradient(90deg,#0A7CFF,#7B5CFF)",
    icon: InfinityIcon,
  },
  tiktok: {
    name: "TikTok",
    short: "TikTok",
    color: "#FE2C55",
    gradient: "linear-gradient(135deg,#0B0B0F,#26262E)",
    strip: "linear-gradient(90deg,#25F4EE,#0B0B0F 50%,#FE2C55)",
    icon: Music2,
    iconFx:
      "drop-shadow(1.5px 1.5px 0 #FE2C55) drop-shadow(-1.5px -1.5px 0 #25F4EE)",
  },
  internal: {
    name: "زيارات الموقع",
    short: "زيارة",
    color: "#64748B",
    gradient: "linear-gradient(135deg,#64748B,#334155)",
    strip: "linear-gradient(90deg,#64748B,#334155)",
    icon: Activity,
  },
};

function brandFor(key: string): Brand {
  const k = key.toLowerCase();
  if (k.includes("tiktok")) return BRANDS.tiktok;
  if (k.includes("meta") || k.includes("facebook")) return BRANDS.meta;
  if (k.includes("ads")) return BRANDS.google_ads;
  if (k.includes("ga4") || k.includes("analytics")) return BRANDS.ga4;
  if (k.includes("google") || k.includes("gtm")) return BRANDS.google;
  if (k.includes("internal")) return BRANDS.internal;
  return BRANDS.internal;
}

const tint = (hex: string, alpha: string) => `${hex}${alpha}`;

function BrandMark({
  brand,
  size = "md",
}: {
  brand: Brand;
  size?: "sm" | "md" | "lg";
}) {
  const dim =
    size === "sm"
      ? "size-8 rounded-lg"
      : size === "lg"
        ? "size-12 rounded-2xl"
        : "size-10 rounded-xl";
  const ic = size === "sm" ? "size-4" : size === "lg" ? "size-6" : "size-5";
  const Icon = brand.icon;
  return (
    <span
      className={cn("grid shrink-0 place-items-center text-white shadow-sm", dim)}
      style={{ background: brand.gradient }}
    >
      {brand.glyph ? (
        <span
          className={cn(
            "font-black leading-none",
            size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-lg",
          )}
        >
          {brand.glyph}
        </span>
      ) : (
        <Icon
          className={ic}
          style={brand.iconFx ? { filter: brand.iconFx } : undefined}
        />
      )}
    </span>
  );
}

function ago(iso: string) {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 10) return "الآن";
  if (s < 60) return `قبل ${s} ث`;
  const m = Math.floor(s / 60);
  if (m < 60) return `قبل ${m} د`;
  const h = Math.floor(m / 60);
  if (h < 24) return `قبل ${h} س`;
  return `قبل ${Math.floor(h / 24)} يوم`;
}

// ─── المكوّن الرئيسي ─────────────────────────────────────────────────

export function AdminTrackingView({ page }: { page: TrackingPage }) {
  const [data, setData] = React.useState<Payload | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [showSecret, setShowSecret] = React.useState<Record<string, boolean>>(
    {},
  );

  // الشبكة المفتوحة في الإعدادات
  const [activeNet, setActiveNet] = React.useState<NetId>("google");

  // حالة سجل الأحداث
  const [live, setLive] = React.useState(false);
  const [evProvider, setEvProvider] = React.useState("all");
  const [evStatus, setEvStatus] = React.useState("all");
  const [evQuery, setEvQuery] = React.useState("");
  const [openId, setOpenId] = React.useState<number | null>(null);
  const [evLimit, setEvLimit] = React.useState(20);
  const [baseline, setBaseline] = React.useState("");

  // حقول الأسرار المحلية — فارغة تعني "بدون تغيير"
  const [secrets, setSecrets] = React.useState({
    ga4ApiSecret: "",
    capiToken: "",
    eventsApiToken: "",
  });
  const clearSecret = (k: keyof typeof secrets) =>
    setSecrets((s) => ({ ...s, [k]: SECRET_CLEAR }));

  const load = React.useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const d = await api<Payload>("/api/admin/tracking");
      setData(d);
      setBaseline(JSON.stringify(d.config));
    } catch (e: any) {
      toast.error(e?.message || "فشل تحميل إعدادات التتبع");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    // deferred حتى لا نستدعي setState تزامنياً داخل الـ effect
    void Promise.resolve().then(() => load());
  }, [load]);

  // تحديث حي لسجل الأحداث كل 15 ثانية
  React.useEffect(() => {
    if (!live || page !== "events") return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, 15_000);
    return () => clearInterval(id);
  }, [live, page, load]);

  React.useEffect(() => {
    setEvLimit(20);
  }, [evProvider, evStatus, evQuery]);

  const events = data?.events;
  const counts = React.useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events ?? []) c[e.provider] = (c[e.provider] ?? 0) + 1;
    return c;
  }, [events]);
  const failedByProvider = React.useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events ?? [])
      if (e.status === "failed") c[e.provider] = (c[e.provider] ?? 0) + 1;
    return c;
  }, [events]);
  const filtered = React.useMemo(() => {
    const q = evQuery.trim().toLowerCase();
    return (events ?? []).filter(
      (e) =>
        (evProvider === "all" || e.provider === evProvider) &&
        (evStatus === "all" || e.status === evStatus) &&
        (!q ||
          e.eventName.toLowerCase().includes(q) ||
          e.eventId.toLowerCase().includes(q)),
    );
  }, [events, evProvider, evStatus, evQuery]);

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

  if (loading || !data) {
    return (
      <div className="w-full space-y-4">
        <Skeleton className="h-16 w-full rounded-xl" />
        <div className="grid gap-3 md:grid-cols-3">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    );
  }

  const cfg = data.config;
  const dirty =
    JSON.stringify(cfg) !== baseline ||
    Object.values(secrets).some((v) => v !== "");
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
            className="pl-9"
          />
          <button
            type="button"
            tabIndex={-1}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
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

  // حالة اتصال كل شبكة (من الـ statuses، وإلا من الإعدادات)
  const netStatus = (id: NetId) => {
    const match = data.statuses.filter((s) => {
      const k = s.key.toLowerCase();
      return id === "google"
        ? k.includes("google") ||
            k.includes("ga4") ||
            k.includes("ads") ||
            k.includes("gtm")
        : k.includes(id);
    });
    if (match.length) {
      return {
        connected: match.some((s) => s.connected),
        detail: match
          .filter((s) => s.connected && s.detail)
          .map((s) => s.detail)
          .join(" · "),
      };
    }
    const fallback =
      id === "google"
        ? cfg.google.enabled &&
          !!(cfg.google.ga4MeasurementId || cfg.google.adsConversionId)
        : id === "meta"
          ? cfg.meta.enabled && !!cfg.meta.pixelId
          : cfg.tiktok.enabled && !!cfg.tiktok.pixelId;
    return { connected: fallback, detail: "" };
  };

  const idInput = (
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
  ) => (
    <Input
      dir="ltr"
      autoComplete="off"
      data-lpignore="true"
      data-1p-ignore
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(sanitizeId(e.target.value))}
      className="font-mono text-sm"
    />
  );

  const missingTokenWarn = (text: string) => (
    <p className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
      {text}
    </p>
  );

  // ═══════════════════ ⚙️ إعدادات التتبع ═══════════════════
  const renderSettings = () => {
    const nets: {
      id: NetId;
      brand: Brand;
      title: string;
      subtitle: string;
      enabled: boolean;
      toggle: (v: boolean) => void;
    }[] = [
      {
        id: "google",
        brand: BRANDS.google,
        title: "Google",
        subtitle: "GA4 · Ads · Tag Manager",
        enabled: cfg.google.enabled,
        toggle: (v) => setGoogle({ enabled: v }),
      },
      {
        id: "meta",
        brand: BRANDS.meta,
        title: "Meta",
        subtitle: "Pixel + Conversions API",
        enabled: cfg.meta.enabled,
        toggle: (v) => setMeta({ enabled: v }),
      },
      {
        id: "tiktok",
        brand: BRANDS.tiktok,
        title: "TikTok",
        subtitle: "Pixel + Events API",
        enabled: cfg.tiktok.enabled,
        toggle: (v) => setTikTok({ enabled: v }),
      },
    ];
    const active = nets.find((n) => n.id === activeNet) ?? nets[0];
    const st = netStatus(active.id);

    return (
      <div className="space-y-4">
        {/* الترويسة */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight sm:text-xl">
              إعدادات <span className="text-primary">الشبكات الإعلانية</span>
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              اربط شبكات الإعلانات وأرسل أحداث التحويل من المتصفح والسيرفر
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => load()}>
              <RefreshCw className="size-4" /> إعادة تحميل
            </Button>
            <Button
              size="sm"
              onClick={save}
              disabled={saving}
              className="min-w-32"
            >
              {saving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              حفظ الإعدادات
            </Button>
          </div>
        </div>

        {/* لوحة التحكم العامة */}
        <section className="rounded-xl border bg-card p-4 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Power className="size-4 text-primary" />
            التحكم العام
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <ToggleTile
              icon={Power}
              label="التتبع (Tracking)"
              desc="المفتاح الرئيسي — عند الإيقاف يتوقف كل الإرسال فوراً"
              checked={cfg.general.enabled}
              onChange={(v) => setGeneral("enabled", v)}
              highlight
            />
            <ToggleTile
              icon={Bug}
              label="Debug Mode"
              desc="تسجيل تفاصيل الأحداث في Console — للتشخيص فقط"
              checked={cfg.general.debugMode}
              onChange={(v) => setGeneral("debugMode", v)}
            />
            <ToggleTile
              icon={FlaskConical}
              label="Test Mode"
              desc="أحداث اختبار — استخدم Test Events في مديري الأحداث"
              checked={cfg.general.testMode}
              onChange={(v) => setGeneral("testMode", v)}
            />
            <ToggleTile
              icon={ShieldCheck}
              label="Consent Management"
              desc="احترام موافقة المستخدم (Consent Mode v2) قبل الإرسال"
              checked={cfg.general.consentManagement}
              onChange={(v) => setGeneral("consentManagement", v)}
            />
          </div>
        </section>

        {/* بطاقات الشبكات */}
        <div className="grid gap-3 md:grid-cols-3">
          {nets.map((n) => {
            const s = netStatus(n.id);
            const isActive = n.id === active.id;
            return (
              <div
                key={n.id}
                className={cn(
                  "relative overflow-hidden rounded-xl border bg-card transition-all",
                  isActive ? "shadow-md" : "hover:shadow-sm",
                  !n.enabled && "opacity-80",
                )}
                style={
                  isActive
                    ? {
                        borderColor: n.brand.color,
                        boxShadow: `0 0 0 1px ${n.brand.color}, 0 10px 28px -14px ${tint(n.brand.color, "99")}`,
                        backgroundImage: `linear-gradient(180deg, ${tint(n.brand.color, "12")}, transparent 60%)`,
                      }
                    : undefined
                }
              >
                <div className="h-1" style={{ background: n.brand.strip }} />
                <button
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setActiveNet(n.id)}
                  className="flex w-full items-center gap-3 p-4 pe-16 text-start"
                >
                  <BrandMark brand={n.brand} size="lg" />
                  <div className="min-w-0">
                    <p className="text-base font-extrabold">{n.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {n.subtitle}
                    </p>
                    <div className="mt-1.5">
                      <ConnPill connected={s.connected} enabled={n.enabled} />
                    </div>
                  </div>
                </button>
                <div className="absolute end-4 top-6">
                  <Switch checked={n.enabled} onCheckedChange={n.toggle} />
                </div>
                <p
                  className="truncate border-t px-4 py-2 font-mono text-[11px] text-muted-foreground"
                  dir="ltr"
                  title={s.detail}
                >
                  {s.detail || "—"}
                </p>
              </div>
            );
          })}
        </div>

        {/* لوحة إعدادات الشبكة المختارة */}
        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="h-1" style={{ background: active.brand.strip }} />
          <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
            <BrandMark brand={active.brand} size="sm" />
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-extrabold">
                إعدادات {active.title}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {active.subtitle}
              </p>
            </div>
            <ConnPill connected={st.connected} enabled={active.enabled} />
          </header>

          <div className="p-4">
            {!active.enabled ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <BrandMark brand={active.brand} size="lg" />
                <p className="text-sm font-semibold">
                  قناة {active.title} متوقفة
                </p>
                <p className="max-w-sm text-xs text-muted-foreground">
                  فعّل القناة لإظهار حقول الربط وبدء إرسال الأحداث إلى{" "}
                  {active.title}.
                </p>
                <Button size="sm" onClick={() => active.toggle(true)}>
                  <Zap className="size-4" /> تفعيل {active.title}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {active.id === "google" && (
                  <>
                    <FormSection title="Google Analytics 4" brand={BRANDS.ga4}>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                          label="GA4 Measurement ID"
                          hint="من Analytics → Data Streams (G-XXXXXXXXXX)"
                        >
                          {idInput(
                            cfg.google.ga4MeasurementId,
                            (v) => setGoogle({ ga4MeasurementId: v }),
                            "G-XXXXXXXXXX",
                          )}
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
                    </FormSection>

                    <FormSection title="Google Ads" brand={BRANDS.google_ads}>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                          label="Google Ads Conversion ID"
                          hint="من Ads → Conversion (AW-XXXXXXXXX)"
                        >
                          {idInput(
                            cfg.google.adsConversionId,
                            (v) => setGoogle({ adsConversionId: v }),
                            "AW-123456789",
                          )}
                        </Field>
                        <div className="grid grid-cols-3 gap-2">
                          <Field label="تسمية التسجيل" hint="Signup">
                            <Input
                              dir="ltr"
                              autoComplete="off"
                              data-lpignore="true"
                              data-1p-ignore
                              placeholder="abc123"
                              className="font-mono text-sm"
                              value={cfg.google.adsLabels.registration}
                              onChange={(e) =>
                                setGoogle({
                                  adsLabels: {
                                    ...cfg.google.adsLabels,
                                    registration: e.target.value,
                                  },
                                })
                              }
                            />
                          </Field>
                          <Field label="تسمية التجربة" hint="Trial">
                            <Input
                              dir="ltr"
                              autoComplete="off"
                              data-lpignore="true"
                              data-1p-ignore
                              placeholder="def456"
                              className="font-mono text-sm"
                              value={cfg.google.adsLabels.trial}
                              onChange={(e) =>
                                setGoogle({
                                  adsLabels: {
                                    ...cfg.google.adsLabels,
                                    trial: e.target.value,
                                  },
                                })
                              }
                            />
                          </Field>
                          <Field label="تسمية الشراء" hint="Purchase">
                            <Input
                              dir="ltr"
                              autoComplete="off"
                              data-lpignore="true"
                              data-1p-ignore
                              placeholder="ghi789"
                              className="font-mono text-sm"
                              value={cfg.google.adsLabels.purchase}
                              onChange={(e) =>
                                setGoogle({
                                  adsLabels: {
                                    ...cfg.google.adsLabels,
                                    purchase: e.target.value,
                                  },
                                })
                              }
                            />
                          </Field>
                        </div>
                      </div>
                    </FormSection>

                    <FormSection title="Tag Manager" brand={BRANDS.google}>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <ToggleTile
                          icon={Zap}
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
                            {idInput(
                              cfg.google.gtmId,
                              (v) => setGoogle({ gtmId: v }),
                              "GTM-XXXXXXX",
                            )}
                          </Field>
                        )}
                      </div>
                    </FormSection>

                    <FormSection title="الخصوصية والمطابقة" brand={BRANDS.google}>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <ToggleTile
                          icon={ShieldCheck}
                          label="Enhanced Conversions"
                          desc="تطبيع وتهشير email/phone (SHA-256) لتحسين دقة التحويلات — يُرسل فقط عند توفر البيانات قانونياً"
                          checked={cfg.google.enhancedConversions}
                          onChange={(v) => setGoogle({ enhancedConversions: v })}
                        />
                        <ToggleTile
                          icon={ShieldCheck}
                          label="Google Consent Mode"
                          desc="أنماط الموافقة (ad_storage / analytics_storage / ad_user_data / ad_personalization)"
                          checked={cfg.google.consentMode}
                          onChange={(v) => setGoogle({ consentMode: v })}
                        />
                      </div>
                    </FormSection>
                  </>
                )}

                {active.id === "meta" && (
                  <>
                    <FormSection title="Pixel & Dataset" brand={BRANDS.meta}>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field
                          label="Meta Pixel ID"
                          hint="من Events Manager ← Data Sources ← انسخ ID البكسل (أرقام فقط)"
                        >
                          {idInput(
                            cfg.meta.pixelId,
                            (v) => setMeta({ pixelId: v }),
                            "123456789012345",
                          )}
                        </Field>
                        <Field
                          label="Dataset ID"
                          hint="اختياري — نفس الـ Pixel ID غالباً في الإعدادات الحديثة"
                        >
                          {idInput(
                            cfg.meta.datasetId,
                            (v) => setMeta({ datasetId: v }),
                            "نفس Pixel ID افتراضياً",
                          )}
                        </Field>
                      </div>
                    </FormSection>

                    <FormSection title="Conversions API" brand={BRANDS.meta}>
                      <div className="space-y-3">
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
                        {!cfg.meta.capiTokenSet &&
                          missingTokenWarn(
                            "بدون هذا التوكن: بكسل المتصفح يرسل PageView وأحداثه فقط، لكن كل أحداث السيرفر المهمة (تسجيل / تجربة / دفع) لن تصل لـ Meta إطلاقاً.",
                          )}
                        <Field
                          label="Test Event Code (اختياري)"
                          hint="من Events Manager → Test Events — يُرسل فقط عند تفعيل وضع الاختبار"
                        >
                          {idInput(
                            cfg.meta.testEventCode,
                            (v) => setMeta({ testEventCode: v }),
                            "TEST12345",
                          )}
                        </Field>
                        <p className="text-[11px] text-muted-foreground">
                          عند التفعيل: الأحداث المهمة تُرسل Browser + Server
                          بنفس event_id (Deduplication تلقائي في Events
                          Manager).
                        </p>
                      </div>
                    </FormSection>
                  </>
                )}

                {active.id === "tiktok" && (
                  <>
                    <FormSection title="Pixel" brand={BRANDS.tiktok}>
                      <Field
                        label="TikTok Pixel ID"
                        hint="من Events Manager → Web Events"
                      >
                        {idInput(
                          cfg.tiktok.pixelId,
                          (v) => setTikTok({ pixelId: v }),
                          "CXXXXXXXXXXXXXXXXXXX",
                        )}
                      </Field>
                    </FormSection>

                    <FormSection title="Events API" brand={BRANDS.tiktok}>
                      <div className="space-y-3">
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
                        {!cfg.tiktok.eventsApiTokenSet &&
                          missingTokenWarn(
                            "بدون هذا التوكن: أحداث السيرفر المهمة (تسجيل / تجربة / دفع) لن تصل لـ TikTok إطلاقاً.",
                          )}
                        <Field
                          label="Test Event Code (اختياري)"
                          hint="من Events Manager → Test Events — يُرسل فقط عند تفعيل وضع الاختبار"
                        >
                          {idInput(
                            cfg.tiktok.testEventCode,
                            (v) => setTikTok({ testEventCode: v }),
                            "TESTXXXX",
                          )}
                        </Field>
                      </div>
                    </FormSection>
                  </>
                )}
              </div>
            )}
          </div>
        </section>

        {/* تنبيه: لا إيميل/كلمة مرور */}
        <div className="flex items-start gap-3 rounded-xl border bg-card p-4 shadow-sm">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-sky-500/15 text-sky-600 dark:text-sky-300">
            <ShieldCheck className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold">
              لا تحتاج إيميل أو كلمة مرور لأي منصة
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              كل الحقول تقبل{" "}
              <b className="text-foreground">معرّفات وتوكنات</b> فقط — تُنسخ من
              صفحات المطورين لكل منصة (المسار مكتوب تحت كل خانة). لا يتم تسجيل
              دخول بأي شكل.
            </p>
          </div>
        </div>

        {/* كبسولة الحفظ العائمة — تظهر فقط عند وجود تعديلات، ولا تحجب ما تحتها */}
        {dirty && (
          <div className="pointer-events-none sticky bottom-4 z-20 flex justify-center">
            <div className="pointer-events-auto flex items-center gap-3 rounded-full border bg-card/95 py-1.5 pe-1.5 ps-4 shadow-lg backdrop-blur">
              <span className="flex items-center gap-2 text-xs font-medium">
                <span className="size-2 animate-pulse rounded-full bg-amber-500" />
                تعديلات غير محفوظة
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 rounded-full px-3 text-xs"
                onClick={() => load()}
                disabled={saving}
              >
                تجاهل
              </Button>
              <Button
                size="sm"
                className="h-8 rounded-full px-4"
                onClick={save}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Save className="size-4" />
                )}
                حفظ
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // ═══════════════════ 📡 سجل الأحداث ═══════════════════
  const renderEvents = () => {
    const evs = data.events;
    const total = data.stats.sentCount + data.stats.failedCount;
    const rate =
      total > 0 ? Math.round((data.stats.sentCount / total) * 100) : null;
    const providers = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const statusOpts: [string, string][] = [
      ["all", "كل الحالات"],
      ["sent", "تم الإرسال"],
      ["failed", "فشل"],
      ["ignored", "تجاهل"],
    ];
    const hasFilter = evProvider !== "all" || evStatus !== "all" || !!evQuery;

    return (
      <div className="space-y-4">
        {/* الترويسة */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight sm:text-xl">
              سجل <span className="text-primary">الأحداث</span>
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              آخر 50 حدثاً من السيرفر لكل منصة — بدون بيانات عملاء حساسة
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setLive((v) => !v)}
              className={cn(
                "gap-1.5",
                live &&
                  "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
              )}
            >
              <Radio className={cn("size-3.5", live && "animate-pulse")} />
              {live ? "بث مباشر" : "بث مباشر؟"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => load(true)}
              disabled={refreshing}
            >
              <RefreshCw
                className={cn("size-4", refreshing && "animate-spin")}
              />
              تحديث
            </Button>
          </div>
        </div>

        {/* مؤشرات */}
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <StatTile
            icon={CheckCircle2}
            tone="success"
            label="أحداث مرسلة"
            value={String(data.stats.sentCount)}
          />
          <StatTile
            icon={XCircle}
            tone={data.stats.failedCount > 0 ? "danger" : "muted"}
            label="أحداث فاشلة"
            value={String(data.stats.failedCount)}
          />
          <StatTile
            icon={Activity}
            tone="primary"
            label="نسبة النجاح"
            value={rate == null ? "—" : `${rate}%`}
          />
          <StatTile
            icon={Clock}
            tone="muted"
            label="آخر حدث"
            value={
              data.stats.lastEvent ? ago(data.stats.lastEvent.createdAt) : "—"
            }
            sub={data.stats.lastEvent?.eventName}
          />
        </div>

        {/* صحة القنوات */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {data.statuses.map((s) => {
            const brand = brandFor(s.key);
            const pk =
              Object.keys(BRANDS).find((k) => BRANDS[k] === brand) ?? s.key;
            const n = counts[pk] ?? 0;
            const f = failedByProvider[pk] ?? 0;
            return (
              <button
                key={s.key}
                type="button"
                disabled={n === 0}
                onClick={() => setEvProvider(evProvider === pk ? "all" : pk)}
                className={cn(
                  "relative overflow-hidden rounded-xl border bg-card p-3.5 text-start transition-all",
                  n > 0 && "hover:shadow-md",
                  evProvider === pk && "shadow-md",
                )}
                style={
                  evProvider === pk
                    ? { borderColor: brand.color }
                    : undefined
                }
              >
                <span
                  aria-hidden
                  className="absolute inset-y-0 start-0 w-1"
                  style={{ background: brand.strip }}
                />
                <div className="flex items-center gap-3 ps-1.5">
                  <BrandMark brand={brand} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{s.label}</p>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span
                        className={cn(
                          "size-1.5 rounded-full",
                          s.connected ? "bg-emerald-500" : "bg-muted-foreground/40",
                        )}
                      />
                      {s.connected ? "متصل" : "غير مضبوط"}
                      <span className="tabular-nums">
                        · {n} حدث{f > 0 ? ` · ${f} فاشل` : ""}
                      </span>
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* الفلاتر + التغذية */}
        <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
          <div className="space-y-3 border-b p-4">
            {/* توزيع المنصات */}
            {evs.length > 0 && (
              <div className="flex h-1.5 overflow-hidden rounded-full bg-muted">
                {providers.map((p) => (
                  <span
                    key={p}
                    title={`${brandFor(p).name}: ${counts[p]}`}
                    style={{
                      width: `${(counts[p] / evs.length) * 100}%`,
                      background: brandFor(p).color,
                    }}
                  />
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-48 flex-1">
                <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={evQuery}
                  onChange={(e) => setEvQuery(e.target.value)}
                  placeholder="ابحث باسم الحدث أو Event ID…"
                  className="ps-9"
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {statusOpts.map(([k, l]) => (
                  <FilterChip
                    key={k}
                    active={evStatus === k}
                    onClick={() => setEvStatus(k)}
                  >
                    {l}
                  </FilterChip>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <FilterChip
                active={evProvider === "all"}
                onClick={() => setEvProvider("all")}
              >
                الكل
                <span className="tabular-nums opacity-70">{evs.length}</span>
              </FilterChip>
              {providers.map((p) => (
                <FilterChip
                  key={p}
                  active={evProvider === p}
                  onClick={() => setEvProvider(evProvider === p ? "all" : p)}
                  dot={brandFor(p).color}
                >
                  {brandFor(p).short}
                  <span className="tabular-nums opacity-70">{counts[p]}</span>
                </FilterChip>
              ))}
              {hasFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setEvProvider("all");
                    setEvStatus("all");
                    setEvQuery("");
                  }}
                  className="ms-auto text-xs font-semibold text-primary hover:underline"
                >
                  مسح الفلاتر
                </button>
              )}
            </div>
          </div>

          {evs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
              <Radio className="size-9 text-muted-foreground/40" />
              <p className="text-sm font-semibold text-muted-foreground">
                لا أحداث بعد
              </p>
              <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                فعّل التتبع وأدخل معرفات المنصات ثم جرّب رحلة تسجيل/دفع حقيقية
                لتظهر الأحداث هنا.
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <Search className="size-8 text-muted-foreground/40" />
              <p className="text-sm font-semibold text-muted-foreground">
                لا نتائج مطابقة للفلاتر
              </p>
            </div>
          ) : (
            <>
            <div className="overflow-x-auto">
              <table
                className="w-full table-fixed text-sm"
                style={{ minWidth: "760px" }}
              >
                <colgroup>
                  <col style={{ width: "34%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "14%" }} />
                  <col style={{ width: "6%" }} />
                </colgroup>
                <thead>
                  <tr className="border-b bg-muted/50 text-[11px] font-semibold text-muted-foreground">
                    <th className="px-4 py-2.5 text-start">الحدث</th>
                    <th className="px-3 py-2.5 text-start">المنصة</th>
                    <th className="px-3 py-2.5 text-start">المصدر</th>
                    <th className="px-3 py-2.5 text-start">الحالة</th>
                    <th className="px-3 py-2.5 text-start">الوقت</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, evLimit).map((ev) => (
                    <EventRow
                      key={ev.id}
                      ev={ev}
                      open={openId === ev.id}
                      onToggle={() =>
                        setOpenId(openId === ev.id ? null : ev.id)
                      }
                    />
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length > evLimit && (
              <div className="border-t p-3 text-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEvLimit((l) => l + 20)}
                >
                  عرض المزيد ({filtered.length - evLimit})
                </Button>
              </div>
            )}
            </>
          )}

          {filtered.length > 0 && (
            <p className="border-t bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
              يعرض {Math.min(evLimit, filtered.length)} من {filtered.length} حدثاً
              {live && " · تحديث تلقائي كل 15 ثانية"}
            </p>
          )}
        </section>
      </div>
    );
  };

  return (
    <div className="w-full min-w-0 space-y-4">
      {/* ─── 🛡️ تنبيه: جداول التتبع غير مُهيّأة (قبل الترحيل) ─── */}
      {(page === "settings" || page === "events") &&
        data.tablesReady === false && (
          <div className="rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-amber-600 dark:text-amber-400">
              <AlertTriangle className="size-4" />
              جداول التتبع غير موجودة في قاعدة البيانات — خطوة تهيئة مطلوبة
            </p>
            <div className="mt-2 space-y-1 text-xs leading-relaxed text-muted-foreground">
              <p>
                الإعدادات أدناه تعمل وتُحفظ طبيعياً، لكن لن تُسجَّل الأحداث حتى
                إنشاء الجدولين. اختر إحدى طريقتين:
              </p>
              <p>
                <b className="text-foreground">1) الأسهل:</b> افتح{" "}
                <b className="text-foreground">Supabase → SQL Editor</b> وشغّل
                ملف{" "}
                <code
                  className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]"
                  dir="ltr"
                >
                  prisma/migrations/20261008_add_tracking_tables/migration.sql
                </code>
              </p>
              <p>
                <b className="text-foreground">2) أو:</b> من جهازك مع{" "}
                <code
                  className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]"
                  dir="ltr"
                >
                  DATABASE_URL
                </code>{" "}
                الخاص بالإنتاج شغّل{" "}
                <code
                  className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]"
                  dir="ltr"
                >
                  npx prisma migrate deploy
                </code>
              </p>
            </div>
          </div>
        )}

      {page === "funnel" && <TrackingFunnel />}
      {page === "attribution" && <TrackingAttribution />}
      {page === "campaigns" && <UtmBuilder />}
      {page === "settings" && renderSettings()}
      {page === "events" && renderEvents()}
    </div>
  );
}

// ─── Sub components ──────────────────────────────────────────────────

function ToggleTile({
  icon: Icon,
  label,
  desc,
  checked,
  onChange,
  highlight,
}: {
  icon: React.ElementType;
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3.5 transition-colors",
        checked
          ? highlight
            ? "border-primary/50 bg-primary/10"
            : "border-primary/30 bg-primary/5"
          : "bg-card",
      )}
    >
      <span
        className={cn(
          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
          checked ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold">{label}</p>
        {desc && (
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            {desc}
          </p>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

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
      <Label className="text-xs font-semibold">{label}</Label>
      {children}
      {hint && (
        <p className="text-[10px] leading-relaxed text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

function FormSection({
  title,
  brand,
  children,
}: {
  title: string;
  brand: Brand;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-muted/20 p-4">
      <h3 className="mb-3 flex items-center gap-2 text-xs font-bold text-muted-foreground">
        <span
          className="h-3.5 w-1 rounded-full"
          style={{ background: brand.color }}
        />
        {title}
      </h3>
      {children}
    </div>
  );
}

function ConnPill({
  connected,
  enabled,
}: {
  connected: boolean;
  enabled: boolean;
}) {
  if (!enabled)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
        <Ban className="size-3" /> متوقفة
      </span>
    );
  if (connected)
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-3" /> متصل
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
      <AlertTriangle className="size-3" /> غير مضبوط
    </span>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  tone: "success" | "danger" | "primary" | "muted";
}) {
  const t = {
    success: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    danger: "bg-destructive/15 text-destructive",
    primary: "bg-primary/15 text-primary",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-card p-3.5 shadow-sm">
      <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", t)}>
        <Icon className="size-5" />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
        <p className="truncate text-xl font-extrabold leading-tight tabular-nums">
          {value}
        </p>
        {sub && (
          <p
            className="truncate font-mono text-[10px] text-muted-foreground"
            dir="ltr"
          >
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  dot,
  children,
}: {
  active: boolean;
  onClick: () => void;
  dot?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
        active
          ? "border-primary/50 bg-primary/10 text-foreground"
          : "bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {dot && (
        <span className="size-2 rounded-full" style={{ background: dot }} />
      )}
      {children}
    </button>
  );
}

function StatusPill({ status }: { status: string }) {
  if (status === "sent")
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
        <CheckCircle2 className="size-3" /> تم الإرسال
      </span>
    );
  if (status === "failed")
    return (
      <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-semibold text-destructive">
        <XCircle className="size-3" /> فشل
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
      <Ban className="size-3" /> تجاهل
    </span>
  );
}

function EventRow({
  ev,
  open,
  onToggle,
}: {
  ev: TrackingEventRow;
  open: boolean;
  onToggle: () => void;
}) {
  const brand = brandFor(ev.provider);
  const isServer = ev.source === "server";
  const bar =
    ev.status === "sent"
      ? "border-s-emerald-500"
      : ev.status === "failed"
        ? "border-s-destructive"
        : "border-s-transparent";
  const copy = (text: string) => {
    void navigator.clipboard?.writeText(text).then(
      () => toast.success("تم النسخ"),
      () => toast.error("تعذّر النسخ"),
    );
  };
  return (
    <>
      <tr
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "cursor-pointer border-b transition-colors hover:bg-muted/40",
          open && "bg-muted/30",
        )}
      >
        <td className={cn("overflow-hidden border-s-4 px-4 py-2", bar)}>
          <p className="truncate text-sm font-bold">{ev.eventName}</p>
          <p
            className="truncate font-mono text-[11px] text-muted-foreground"
            dir="ltr"
          >
            {ev.eventId}
          </p>
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center gap-2">
            <BrandMark brand={brand} size="sm" />
            <span className="truncate text-xs font-semibold">
              {brand.short}
            </span>
          </div>
        </td>
        <td className="px-3 py-2">
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
            {isServer ? (
              <Server className="size-3" />
            ) : (
              <Monitor className="size-3" />
            )}
            {isServer ? "Server" : "Browser"}
          </span>
        </td>
        <td className="px-3 py-2">
          <StatusPill status={ev.status} />
        </td>
        <td className="px-3 py-2">
          <p className="whitespace-nowrap text-xs font-medium">
            {ago(ev.createdAt)}
          </p>
          <p className="whitespace-nowrap text-[10px] tabular-nums text-muted-foreground">
            {new Date(ev.createdAt).toLocaleTimeString("ar-EG")}
          </p>
        </td>
        <td className="px-3 py-2">
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </td>
      </tr>

      {open && (
        <tr className="border-b bg-muted/20">
          <td colSpan={6} className="px-4 py-3">
            <div className="space-y-3 rounded-lg border bg-card p-3.5">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-muted-foreground">Event ID</span>
                <code
                  className="break-all rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]"
                  dir="ltr"
                >
                  {ev.eventId}
                </code>
                <button
                  type="button"
                  onClick={() => copy(ev.eventId)}
                  className="text-muted-foreground hover:text-foreground"
                  title="نسخ"
                >
                  <Copy className="size-3.5" />
                </button>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-xs md:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">المنصة</dt>
                  <dd className="mt-0.5 font-semibold">{brand.name}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">المصدر</dt>
                  <dd className="mt-0.5 font-semibold">
                    {isServer ? "Server (API)" : "Browser (Pixel)"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">الوقت الكامل</dt>
                  <dd className="mt-0.5 font-semibold">
                    {new Date(ev.createdAt).toLocaleString("ar-EG")}
                  </dd>
                </div>
                {ev.subscriptionId != null && (
                  <div>
                    <dt className="text-muted-foreground">الاشتراك</dt>
                    <dd className="mt-0.5 font-mono font-semibold" dir="ltr">
                      #{ev.subscriptionId}
                    </dd>
                  </div>
                )}
              </dl>
              {ev.error && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                  <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-destructive">
                    <AlertTriangle className="size-3.5" /> سبب الفشل
                  </p>
                  <p
                    className="break-words font-mono text-[11px] leading-relaxed text-destructive"
                    dir="ltr"
                  >
                    {ev.error}
                  </p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
