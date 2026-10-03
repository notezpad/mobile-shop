"use client";

/**
 * 🛡️ 2026-09-29: Partial purchase return (مرتجع للمورد).
 * Pick items + quantities (or "return everything left"), say how much money the
 * supplier really hands back — the rest is deducted from what we owe him.
 * Used from both the purchases page and the supplier page.
 *
 * 2026-10: واجهة جديدة بهوية صفحة المشتريات (بترولي). المنطق والتحقق والـ API
 * زي ما هم بالظبط — اتغيّر الشكل بس، وزاد اختيار صريح "يخصمها من حسابي / رجّع لي فلوس".
 */

import * as React from "react";
import { Info, Loader2, RotateCcw, Search, Truck, Wallet, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  DecimalInput,
  DialogHero,
  MethodPills,
  SectionTitle,
  Stepper,
} from "./purchase-dialog-ui";

export interface ReturnableItem {
  id: number;
  name: string;
  cost: number;
  quantity: number;
  returnedQty?: number;
}

export interface ReturnableOrder {
  id: number;
  orderNo: string | null;
  paid: number;
  refunded?: number;
  /** how this order was paid — used as the default refund method */
  paymentMethod?: string | null;
  items: ReturnableItem[];
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (n: number) =>
  n.toLocaleString("en-US", { maximumFractionDigits: 2 });

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  order: ReturnableOrder | null;
  /** false → no supplier account: the whole value must come back in cash. */
  hasSupplier: boolean;
  onDone?: () => void;
}

export function PurchaseReturnDialog({
  open,
  onOpenChange,
  order,
  hasSupplier,
  onDone,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        mobileSheet
        className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        {/* DialogContent unmounts when closed, so ReturnForm (and all of its
            state) starts fresh on every open; `key` covers switching orders. */}
        {order && (
          <ReturnForm
            key={order.id}
            order={order}
            hasSupplier={hasSupplier}
            onClose={() => onOpenChange(false)}
            onDone={onDone}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReturnForm({
  order,
  hasSupplier,
  onClose,
  onDone,
}: {
  order: ReturnableOrder;
  hasSupplier: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const [qtys, setQtys] = React.useState<Record<number, string>>({});
  const [refund, setRefund] = React.useState("");
  const [refundTouched, setRefundTouched] = React.useState(false);
  // واجهة فقط: هل المستخدم اختار "المورد رجّع لي فلوس"؟
  const [cashMode, setCashMode] = React.useState(false);
  const [method, setMethod] = React.useState(order.paymentMethod || "cash");
  const [note, setNote] = React.useState("");
  // فواتير الجملة (أصناف كتير): بحث + "المحدد فقط"
  const [itemQ, setItemQ] = React.useState("");
  const [onlySel, setOnlySel] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const inFlight = React.useRef(false); // hard guard against double click

  const remainingOf = (it: ReturnableItem) =>
    Math.max(0, it.quantity - (it.returnedQty ?? 0));

  const qtyOf = (it: ReturnableItem) =>
    Math.min(
      remainingOf(it),
      Math.max(0, Math.floor(Number(qtys[it.id]) || 0)),
    );

  const setQty = (it: ReturnableItem, n: number) =>
    setQtys((p) => ({ ...p, [it.id]: n > 0 ? String(n) : "" }));

  const many = order.items.length > 8; // بحث + "المحدد فقط"
  const compact = order.items.length > 3; // صفوف مضغوطة + تمرير داخلي
  const needle = itemQ.trim().toLowerCase();
  const visibleItems = order.items.filter(
    (it) =>
      (!needle || it.name.toLowerCase().includes(needle)) &&
      (!onlySel || qtyOf(it) > 0),
  );

  const lines = React.useMemo(() => {
    return order.items
      .map((it) => {
        const max = Math.max(0, it.quantity - (it.returnedQty ?? 0));
        const q = Math.min(
          max,
          Math.max(0, Math.floor(Number(qtys[it.id]) || 0)),
        );
        return { it, q };
      })
      .filter((l) => l.q > 0);
  }, [order, qtys]);

  const returnValue = round2(lines.reduce((s, l) => s + l.it.cost * l.q, 0));
  const totalQty = lines.reduce((s, l) => s + l.q, 0);

  // 🛡️ 2026-09-30: the refund is NEVER assumed. Default = 0 → the supplier just
  // deducts the return from what we owe him and the till is untouched. Only if
  // he really hands money back does the user type it (or press the shortcut).
  // Without a supplier account the whole value must come back as money.
  const paidNotRefunded = Math.max(0, round2(order.paid - (order.refunded ?? 0)));
  const maxRefund = hasSupplier ? Math.min(returnValue, paidNotRefunded) : returnValue;
  const defaultRefund = hasSupplier ? 0 : returnValue;
  const refundNum = hasSupplier
    ? refundTouched
      ? Number(refund) || 0
      : defaultRefund
    : returnValue;
  const refundInvalid =
    refundNum < 0 ||
    round2(refundNum) > round2(maxRefund) ||
    (!hasSupplier && round2(refundNum) !== returnValue);
  const balanceDrop = round2(returnValue - refundNum);
  const cashEmpty = hasSupplier && cashMode && refundNum <= 0;

  const anyRemaining = order.items.some((it) => remainingOf(it) > 0);
  const allSelected =
    anyRemaining &&
    order.items.every((it) => remainingOf(it) === 0 || qtyOf(it) === remainingOf(it));

  const setAll = () => {
    const next: Record<number, string> = {};
    for (const it of order.items) {
      const r = remainingOf(it);
      if (r > 0) next[it.id] = String(r);
    }
    setQtys(next);
  };

  const chooseDeduct = () => {
    setCashMode(false);
    setRefundTouched(true);
    setRefund("0");
  };
  const chooseCash = () => {
    setCashMode(true);
    setRefundTouched(true);
    setRefund((prev) => (Number(prev) > 0 ? prev : ""));
  };

  const blockReason =
    lines.length === 0
      ? "اختار كمية من صنف واحد على الأقل"
      : refundInvalid
        ? `المبلغ المسترد لازم يكون بين صفر و ${formatCurrency(maxRefund)}`
        : cashEmpty
          ? "اكتب المبلغ اللي المورد رجّعه لك فعلاً"
          : null;

  const submit = async () => {
    if (inFlight.current) return;
    if (lines.length === 0) {
      toast.error("اختر كمية للإرجاع من صنف واحد على الأقل");
      return;
    }
    if (refundInvalid) {
      toast.error(
        !hasSupplier
          ? "الأمر غير مرتبط بمورد، لازم المبلغ المسترد يساوي قيمة المرتجع"
          : `المبلغ المسترد لازم يكون بين صفر و ${formatCurrency(maxRefund)} (المدفوع فعلاً ولم يُسترد)`,
      );
      return;
    }
    if (cashEmpty) {
      toast.error("اكتب المبلغ اللي المورد رجّعه لك، أو اختار الخصم من حسابك");
      return;
    }
    inFlight.current = true;
    setSaving(true);
    try {
      await api(`/api/purchase-orders/${order.id}/returns`, {
        method: "POST",
        body: {
          items: lines.map((l) => ({ itemId: l.it.id, quantity: l.q })),
          refund: round2(refundNum),
          refundMethod: method,
          note: note.trim() || null,
        },
      });
      toast.success("تم تسجيل المرتجع للمورد");
      onDone?.();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "فشل تسجيل المرتجع");
      inFlight.current = false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DialogHero
        icon={RotateCcw}
        title="مرتجع للمورد"
        chip={order.orderNo ?? `#${order.id}`}
        subtitle="الكمية المرتجعة بتتسحب من المخزن، وبعدها تحدّد القيمة هتتسوّى إزاي."
      />

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain bg-muted/20 p-4 sm:p-6">
        {/* ═════════ 1) الأصناف ═════════ */}
        <section>
          <SectionTitle
            n={1}
            aside={
              anyRemaining && (
                <button
                  type="button"
                  onClick={() => (allSelected ? setQtys({}) : setAll())}
                  className="h-8 rounded-full border bg-background px-3 text-xs font-bold text-foreground/80 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-cyan-600/40"
                >
                  {allSelected ? "إلغاء التحديد" : "رجّع كل المتبقي"}
                </button>
              )
            }
          >
            الأصناف المراد إرجاعها
          </SectionTitle>

          {many && (
            <div className="mb-2.5 flex flex-wrap items-center gap-2">
              <label className="relative flex h-10 min-w-[10rem] flex-1 items-center rounded-xl border bg-card focus-within:border-cyan-600 focus-within:ring-[3px] focus-within:ring-cyan-600/25">
                <Search className="pointer-events-none absolute right-3 size-4 text-muted-foreground" aria-hidden />
                <input
                  value={itemQ}
                  onChange={(e) => setItemQ(e.target.value)}
                  placeholder="ابحث في أصناف الفاتورة…"
                  aria-label="بحث في أصناف الفاتورة"
                  className="h-full w-full bg-transparent pe-8 text-sm outline-none placeholder:text-muted-foreground/80"
                  style={{ paddingInlineStart: "2.5rem" }}
                />
                {itemQ && (
                  <button
                    type="button"
                    onClick={() => setItemQ("")}
                    aria-label="مسح البحث"
                    className="absolute left-2 flex size-6 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </label>
              <button
                type="button"
                aria-pressed={onlySel}
                onClick={() => setOnlySel((v) => !v)}
                disabled={lines.length === 0 && !onlySel}
                className={cn(
                  "inline-flex h-10 items-center gap-1.5 rounded-xl border px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-cyan-600/40 disabled:cursor-not-allowed disabled:opacity-45",
                  onlySel
                    ? "border-cyan-600 bg-cyan-600/10 text-cyan-900 dark:text-cyan-100"
                    : "bg-card text-foreground/75 hover:bg-muted",
                )}
              >
                المحدد فقط ({lines.length})
              </button>
              <span className="w-full text-xs font-semibold tabular-nums text-foreground/65 sm:w-auto">
                {needle || onlySel
                  ? `عرض ${visibleItems.length} من ${order.items.length}`
                  : `${order.items.length} صنف`}
              </span>
            </div>
          )}

          <ul
            className={cn(
              compact
                ? "max-h-[20rem] space-y-1.5 overflow-y-auto overscroll-contain rounded-2xl border bg-card/60 p-1.5"
                : "space-y-2.5",
            )}
          >
            {visibleItems.map((it) => {
              const remaining = remainingOf(it);
              const prev = it.returnedQty ?? 0;
              const q = qtyOf(it);
              const on = q > 0;
              const pctPrev = it.quantity > 0 ? (prev / it.quantity) * 100 : 0;
              const pctNow = it.quantity > 0 ? (q / it.quantity) * 100 : 0;
              const pctKeep = Math.max(0, 100 - pctPrev - pctNow);
              return (
                <li
                  key={it.id}
                  className={cn(
                    "rounded-2xl border bg-card transition-colors",
                    compact ? "px-3.5 py-2.5" : "p-3.5",
                    on && "border-cyan-600/60 bg-cyan-600/[0.045]",
                    remaining <= 0 && "bg-muted/40",
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
                    <div className="min-w-[9rem] flex-1">
                      <p className="truncate text-sm font-extrabold">{it.name}</p>
                      <p className="mt-0.5 text-xs font-medium tabular-nums text-foreground/65">
                        {compact
                          ? `${formatCurrency(it.cost)} · متاح ${remaining} من ${it.quantity}${prev > 0 ? ` · رجع قبل كده ${prev}` : ""}`
                          : `${formatCurrency(it.cost)} للقطعة · استلمت ${it.quantity}`}
                      </p>
                    </div>

                    {remaining > 0 ? (
                      <div className="flex items-center gap-2">
                        {compact && on && (
                          <b className="text-sm font-extrabold tabular-nums text-rose-600 dark:text-rose-300">
                            −{formatCurrency(q * it.cost)}
                          </b>
                        )}
                        <Stepper
                          value={q}
                          min={0}
                          max={remaining}
                          onChange={(n) => setQty(it, n)}
                          label={`كمية مرتجع ${it.name}`}
                        />
                        <button
                          type="button"
                          onClick={() => setQty(it, remaining)}
                          disabled={q === remaining}
                          className="h-10 rounded-xl border bg-background px-3 text-xs font-bold text-foreground/80 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-cyan-600/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-background"
                        >
                          الكل
                        </button>
                      </div>
                    ) : (
                      <span className="rounded-lg bg-slate-500/15 px-2.5 py-1 text-xs font-bold text-slate-700 dark:text-slate-200">
                        مرتجع بالكامل
                      </span>
                    )}
                  </div>

                  {!compact && (
                    <>
                      {/* شريط الكمية: المتاح | هترجّعه الآن | رجع قبل كده */}
                      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <span className="h-full bg-cyan-600" style={{ width: `${pctKeep}%` }} />
                        <span
                          className="h-full bg-rose-500 transition-[width] duration-300 motion-reduce:transition-none"
                          style={{ width: `${pctNow}%` }}
                        />
                        <span className="h-full bg-slate-400" style={{ width: `${pctPrev}%` }} />
                      </div>
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs font-medium tabular-nums">
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-foreground/70">
                          {remaining > 0 && (
                            <span className="inline-flex items-center gap-1.5">
                              <i aria-hidden className="size-2 rounded-full bg-cyan-600" />
                              متاح للإرجاع {remaining} من {it.quantity}
                            </span>
                          )}
                          {prev > 0 && (
                            <span className="inline-flex items-center gap-1.5">
                              <i aria-hidden className="size-2 rounded-full bg-slate-400" />
                              رجع قبل كده {prev}
                            </span>
                          )}
                        </span>
                        {on && (
                          <b className="text-sm font-extrabold text-rose-600 dark:text-rose-300">
                            −{formatCurrency(q * it.cost)}
                          </b>
                        )}
                      </div>
                    </>
                  )}
                </li>
              );
            })}
            {visibleItems.length === 0 && (
              <li className="rounded-2xl border border-dashed bg-card/60 px-4 py-8 text-center text-sm font-medium text-foreground/65">
                مفيش أصناف بالفلتر ده
              </li>
            )}
          </ul>
        </section>

        {/* ═════════ 2) التسوية ═════════ */}
        <section>
          <SectionTitle n={2}>التسوية</SectionTitle>

          {lines.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-card/60 px-4 py-8 text-center">
              <RotateCcw className="mx-auto size-6 text-cyan-700/60" aria-hidden />
              <p className="mt-2 text-sm font-bold">اختار كمية من صنف</p>
              <p className="mt-0.5 text-xs font-medium text-foreground/65">
                وهتظهر هنا قيمة المرتجع وإزاي هتتسوّى.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border bg-card">
              <div className="flex items-center justify-between gap-3 bg-slate-500/[0.07] px-4 py-3.5">
                <div>
                  <p className="text-[11px] font-semibold text-foreground/60">قيمة المرتجع</p>
                  <p className="text-2xl font-extrabold tabular-nums">
                    {num(returnValue)}
                    <span className="ms-1 text-xs font-semibold text-foreground/60">جنيه</span>
                  </p>
                </div>
                <p className="text-xs font-semibold tabular-nums text-foreground/65">
                  {totalQty} قطعة من {lines.length} صنف
                </p>
              </div>

              <div className="space-y-4 p-4">
                {hasSupplier ? (
                  <>
                    <p className="text-sm font-extrabold">المورد هيسوّي القيمة دي إزاي؟</p>
                    <div role="radiogroup" aria-label="طريقة التسوية" className="grid gap-2.5 sm:grid-cols-2">
                      <ChoiceCard
                        on={!cashMode}
                        onClick={chooseDeduct}
                        icon={Truck}
                        title="يخصمها من حسابي"
                        desc="من اللي عليك للمورد — مفيش فلوس بتتحرك"
                      />
                      <ChoiceCard
                        on={cashMode}
                        disabled={paidNotRefunded <= 0}
                        onClick={chooseCash}
                        icon={Wallet}
                        title="رجّع لي فلوس"
                        desc={
                          paidNotRefunded > 0
                            ? `تقدر تسترد لحد ${formatCurrency(paidNotRefunded)} من اللي اتدفع`
                            : "مفيش مدفوع على الأمر ده يتسترد"
                        }
                      />
                    </div>

                    {cashMode && (
                      <div className="space-y-2.5 rounded-xl border border-dashed p-3.5">
                        <label htmlFor="pr-refund" className="block text-xs font-bold">
                          المبلغ اللي المورد رجّعه لك فعلاً
                        </label>
                        <DecimalInput
                          id="pr-refund"
                          value={refundNum}
                          onChange={(n) => {
                            setRefundTouched(true);
                            setRefund(String(n));
                          }}
                          suffix="جنيه"
                          invalid={refundInvalid}
                        />
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          {maxRefund > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setRefundTouched(true);
                                setRefund(String(round2(maxRefund)));
                              }}
                              className="h-8 rounded-full border bg-background px-3 text-xs font-bold text-foreground/80 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-cyan-600/40"
                            >
                              رجّع كل المبلغ ({formatCurrency(maxRefund)})
                            </button>
                          )}
                          {refundInvalid && (
                            <p className="text-xs font-semibold text-rose-600 dark:text-rose-300">
                              المبلغ لازم يكون بين صفر و {formatCurrency(maxRefund)}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-start gap-2.5 rounded-xl bg-cyan-600/[0.07] p-3 text-xs font-medium leading-relaxed text-foreground/80">
                    <Info className="mt-0.5 size-4 shrink-0 text-cyan-700 dark:text-cyan-300" aria-hidden />
                    الأمر ده مش مرتبط بمورد، فالقيمة كلها لازم ترجع فلوس للخزنة.
                  </div>
                )}

                {refundNum > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-bold">استلمت الفلوس إزاي؟</p>
                    <MethodPills value={method} onChange={setMethod} label="طريقة استلام المبلغ" />
                  </div>
                )}
              </div>

              {/* النتيجة بعد التأكيد */}
              <div className="space-y-3 border-t bg-muted/30 p-4">
                <p className="text-xs font-bold text-foreground/70">بعد التأكيد</p>
                {hasSupplier && (refundNum > 0 || balanceDrop > 0) && (
                  <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted" aria-hidden>
                    {refundNum > 0 && (
                      <span className="h-full bg-cyan-600" style={{ flexGrow: refundNum, flexBasis: 0 }} />
                    )}
                    {balanceDrop > 0 && (
                      <span className="h-full bg-amber-400" style={{ flexGrow: balanceDrop, flexBasis: 0 }} />
                    )}
                  </div>
                )}
                <ul className="space-y-2 text-sm">
                  <ResultLine
                    dot="bg-cyan-600"
                    label="يدخل الخزنة"
                    value={formatCurrency(refundNum > 0 ? refundNum : 0)}
                  />
                  {hasSupplier && (
                    <ResultLine
                      dot="bg-amber-400"
                      label="يقل من المستحق للمورد"
                      value={formatCurrency(Math.max(0, balanceDrop))}
                    />
                  )}
                </ul>
              </div>
            </div>
          )}
        </section>

        {/* ═════════ 3) ملاحظات ═════════ */}
        <section>
          <SectionTitle n={3}>ملاحظات</SectionTitle>
          <input
            id="pr-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="سبب المرتجع (اختياري)"
            aria-label="سبب المرتجع"
            className="h-11 w-full rounded-xl border bg-background px-3.5 text-sm outline-none transition-shadow placeholder:text-muted-foreground/80 focus:border-cyan-600 focus:ring-[3px] focus:ring-cyan-600/25"
          />
        </section>
      </div>

      {/* ═════════ الشريط السفلي ═════════ */}
      <div className="shrink-0 border-t bg-card px-4 py-3 sm:px-6 sm:py-4">
        {blockReason && (
          <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
            <Info className="size-3.5 shrink-0" aria-hidden />
            {blockReason}
          </p>
        )}
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-foreground/60">قيمة المرتجع</p>
            <p className="truncate text-lg font-extrabold tabular-nums">{formatCurrency(returnValue)}</p>
          </div>
          <Button variant="outline" onClick={onClose} disabled={saving} className="h-11 rounded-xl px-5">
            إلغاء
          </Button>
          <Button
            onClick={submit}
            disabled={saving || lines.length === 0 || refundInvalid || cashEmpty}
            className="h-11 rounded-xl bg-cyan-950 px-6 font-bold text-white hover:bg-cyan-900 disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100 dark:bg-cyan-700 dark:hover:bg-cyan-600"
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
            تأكيد المرتجع
          </Button>
        </div>
      </div>
    </>
  );
}

/* ───────────── مكوّنات محلية ───────────── */

function ChoiceCard({
  on,
  disabled,
  onClick,
  icon: Icon,
  title,
  desc,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-2xl border p-3.5 text-start transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-cyan-600/40 disabled:cursor-not-allowed disabled:opacity-50",
        on
          ? "border-cyan-600 bg-cyan-600/[0.08] ring-1 ring-cyan-600/40"
          : "bg-background hover:bg-muted/60 disabled:hover:bg-background",
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl transition-colors",
          on ? "bg-cyan-700 text-white" : "bg-muted text-foreground/70",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-extrabold">{title}</span>
        <span className="mt-0.5 block text-xs font-medium leading-relaxed text-foreground/65">
          {desc}
        </span>
      </span>
    </button>
  );
}

function ResultLine({
  dot,
  label,
  value,
}: {
  dot: string;
  label: string;
  value: string;
}) {
  return (
    <li className="flex items-center gap-2.5">
      <span aria-hidden className={cn("size-2.5 shrink-0 rounded-full", dot)} />
      <span className="font-semibold text-foreground/80">{label}</span>
      <span aria-hidden className="mb-0.5 h-px flex-1 border-b border-dotted border-foreground/25" />
      <b className="font-extrabold tabular-nums">{value}</b>
    </li>
  );
}
