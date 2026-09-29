"use client";

/**
 * 🛡️ 2026-09-29: Partial purchase return (مرتجع للمورد).
 * Pick items + quantities (or "return everything left"), say how much money the
 * supplier really hands back — the rest is deducted from what we owe him.
 * Used from both the purchases page and the supplier page.
 */

import * as React from "react";
import { Loader2, RotateCcw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { formatCurrency } from "@/lib/format";

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

const METHOD_OPTIONS = [
  { value: "cash", label: "كاش" },
  { value: "vodafone_cash", label: "محافظ إلكترونية" },
  { value: "instapay", label: "انستاباي" },
  { value: "fawry", label: "محفظة إلكترونية" },
];

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

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
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
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
  const [method, setMethod] = React.useState(order.paymentMethod || "cash");
  const [note, setNote] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const inFlight = React.useRef(false); // hard guard against double click

  const remainingOf = (it: ReturnableItem) =>
    Math.max(0, it.quantity - (it.returnedQty ?? 0));

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

  const setAll = () => {
    const next: Record<number, string> = {};
    for (const it of order.items) {
      const r = remainingOf(it);
      if (r > 0) next[it.id] = String(r);
    }
    setQtys(next);
  };

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

  const anyRemaining = order.items.some((it) => remainingOf(it) > 0);

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <RotateCcw className="size-5 text-destructive" />
          مرتجع للمورد — {order.orderNo ?? `#${order.id}`}
        </DialogTitle>
        <DialogDescription>
          حدّد الأصناف والكميات اللي هترجعها. الكمية بتتسحب من المخزن.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">الأصناف</span>
          {anyRemaining && (
            <Button type="button" variant="outline" size="sm" onClick={setAll}>
              إرجاع كل المتبقي
            </Button>
          )}
        </div>

        <div className="divide-y rounded-lg border">
          {order.items.map((it) => {
            const remaining = remainingOf(it);
            return (
              <div key={it.id} className="flex items-center gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{it.name}</p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {formatCurrency(it.cost)} × {it.quantity}
                    {(it.returnedQty ?? 0) > 0 && (
                      <span className="text-destructive">
                        {" "}
                        — مرتجع سابقاً: {it.returnedQty}
                      </span>
                    )}
                  </p>
                </div>
                {remaining > 0 ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={remaining}
                      step={1}
                      dir="ltr"
                      value={qtys[it.id] ?? ""}
                      placeholder="0"
                      onChange={(e) =>
                        setQtys((p) => ({ ...p, [it.id]: e.target.value }))
                      }
                      className="h-9 w-20 text-center tabular-nums"
                      aria-label={`كمية مرتجع ${it.name}`}
                    />
                    <span className="text-xs text-muted-foreground tabular-nums">
                      / {remaining}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    مرتجع بالكامل
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className="grid gap-3 rounded-lg bg-muted/40 p-3 text-sm">
          <div className="flex justify-between">
            <span>قيمة المرتجع</span>
            <span className="font-semibold tabular-nums">
              {formatCurrency(returnValue)}
            </span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pr-refund">
              {hasSupplier
                ? "الفلوس اللي المورد رجّعها لك فعلاً (سيبها 0 لو خصمها من حسابك بس)"
                : "المبلغ المسترد (فلوس)"}
            </Label>
            <Input
              id="pr-refund"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              dir="ltr"
              className="text-left tabular-nums"
              value={refundTouched ? refund : String(round2(defaultRefund))}
              disabled={!hasSupplier}
              onChange={(e) => {
                setRefundTouched(true);
                setRefund(e.target.value);
              }}
            />
            {hasSupplier && maxRefund > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setRefundTouched(true);
                  setRefund(String(round2(maxRefund)));
                }}
              >
                المورد رجّع كل المبلغ ({formatCurrency(maxRefund)})
              </Button>
            )}
            {refundInvalid && returnValue > 0 && (
              <p className="text-xs text-destructive">
                المبلغ لازم يكون بين صفر و {formatCurrency(maxRefund)}
              </p>
            )}
          </div>

          {refundNum > 0 && (
            <div className="space-y-1.5">
              <Label>طريقة استلام المبلغ</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHOD_OPTIONS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
            <div className="flex justify-between">
              <span>يدخل الخزنة</span>
              <span className="tabular-nums">
                {formatCurrency(refundNum > 0 ? refundNum : 0)}
              </span>
            </div>
            {hasSupplier && (
              <div className="flex justify-between">
                <span>يقل من المستحق للمورد</span>
                <span className="tabular-nums">
                  {formatCurrency(balanceDrop)}
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pr-note">ملاحظات</Label>
          <Input
            id="pr-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="سبب المرتجع (اختياري)"
          />
        </div>
      </div>

      <DialogFooter>
        <Button
          variant="destructive"
          onClick={submit}
          disabled={saving || lines.length === 0 || refundInvalid}
        >
          {saving && <Loader2 className="size-4 animate-spin" />}
          تأكيد المرتجع
        </Button>
        <Button variant="outline" onClick={onClose} disabled={saving}>
          إلغاء
        </Button>
      </DialogFooter>
    </>
  );
}
