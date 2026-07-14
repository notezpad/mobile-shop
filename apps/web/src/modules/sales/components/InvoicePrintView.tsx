/**
 * InvoicePrintView — A4 printable invoice template.
 * Full-page layout with store header, items table, totals, QR code, and barcode.
 *
 * Designed for window.print() — uses print-friendly CSS.
 */
import { useEffect, useState } from 'react';
import type { SaleWithDetails } from '@modules/sales/hooks/useSales';
import type { InvoiceSettings } from '@lib/invoice-pdf';
import { generateInvoiceQr, generateInvoiceBarcode, formatInvoiceAmount } from '@lib/invoice-pdf';
import { formatDateTime } from '@core/utils/date';

interface InvoicePrintViewProps {
  sale: SaleWithDetails;
  settings: InvoiceSettings;
  elementId?: string;
}

const PAYMENT_LABELS: Record<string, string> = {
  cash: 'كاش',
  card: 'بطاقة',
  vodafone_cash: 'فودافون كاش',
  instapay: 'إنستاباي',
  fawry: 'فوري',
  credit: 'آجل',
  mixed: 'متعدد',
};

export function InvoicePrintView({ sale, settings, elementId = 'invoice-print-area' }: InvoicePrintViewProps) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [barcodeUrl, setBarcodeUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (settings.showQr) {
        try {
          const url = await generateInvoiceQr(sale, settings);
          setQrUrl(url);
        } catch (err) {
          console.error('QR generation failed:', err);
        }
      }
      if (settings.showBarcode) {
        setBarcodeUrl(generateInvoiceBarcode(sale.invoice_no));
      }
    })();
  }, [sale, settings]);

  return (
    <div
      id={elementId}
      dir="rtl"
      className="mx-auto bg-white p-8 text-black"
      style={{ maxWidth: '210mm', minHeight: '297mm', fontFamily: 'Almarai, sans-serif' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between border-b-2 border-black pb-4">
        <div>
          <h1 className="text-2xl font-bold">{settings.storeName}</h1>
          {settings.storeAddress ? <p className="text-sm text-gray-600">{settings.storeAddress}</p> : null}
          {settings.storePhone ? (
            <p className="text-sm text-gray-600" dir="ltr">tel: {settings.storePhone}</p>
          ) : null}
          {settings.vatNumber ? (
            <p className="text-sm text-gray-600">رقم ضريبي: {settings.vatNumber}</p>
          ) : null}
        </div>
        <div className="text-left">
          <h2 className="text-xl font-bold">فاتورة ضريبية</h2>
          <p className="text-sm">رقم: <span className="font-mono">{sale.invoice_no}</span></p>
          <p className="text-sm">التاريخ: {formatDateTime(sale.created_at)}</p>
          <p className="text-sm">الفرع: {sale.branch_name ?? '—'}</p>
        </div>
      </div>

      {/* Receipt header text */}
      {settings.receiptHeader ? (
        <div className="my-3 rounded bg-gray-100 p-2 text-center text-sm">
          {settings.receiptHeader}
        </div>
      ) : null}

      {/* Customer info */}
      <div className="my-4 grid grid-cols-2 gap-4">
        <div>
          <h3 className="mb-1 text-sm font-bold text-gray-500">بيانات العميل</h3>
          <p className="text-sm font-medium">{sale.customer_name ?? 'عميل نقدي'}</p>
          {sale.customer_phone ? (
            <p className="text-sm text-gray-600" dir="ltr">{sale.customer_phone}</p>
          ) : null}
        </div>
        <div>
          <h3 className="mb-1 text-sm font-bold text-gray-500">بيانات البائع</h3>
          <p className="text-sm font-medium">{sale.cashier_name ?? '—'}</p>
          <p className="text-sm text-gray-600">{sale.branch_name ?? '—'}</p>
        </div>
      </div>

      {/* Items table */}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y-2 border-black bg-gray-100">
            <th className="border border-gray-300 p-2 text-right">#</th>
            <th className="border border-gray-300 p-2 text-right">الصنف</th>
            <th className="border border-gray-300 p-2 text-center">الكمية</th>
            <th className="border border-gray-300 p-2 text-center">السعر</th>
            <th className="border border-gray-300 p-2 text-center">الخصم</th>
            <th className="border border-gray-300 p-2 text-center">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item, idx) => (
            <tr key={item.id} className="border-b border-gray-200">
              <td className="border border-gray-300 p-2 text-center">{idx + 1}</td>
              <td className="border border-gray-300 p-2">
                <div>
                  <span className="font-medium">{item.product_name ?? 'منتج'}</span>
                  {item.imei1 ? (
                    <span className="block text-xs text-gray-500" dir="ltr">IMEI: {item.imei1}</span>
                  ) : null}
                </div>
              </td>
              <td className="border border-gray-300 p-2 text-center tabular-nums">{item.quantity}</td>
              <td className="border border-gray-300 p-2 text-center tabular-nums">
                {formatInvoiceAmount(item.unit_price, settings.currency)}
              </td>
              <td className="border border-gray-300 p-2 text-center tabular-nums text-red-600">
                {item.discount > 0 ? `-${formatInvoiceAmount(item.discount, settings.currency)}` : '—'}
              </td>
              <td className="border border-gray-300 p-2 text-center font-bold tabular-nums">
                {formatInvoiceAmount(item.total, settings.currency)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="mt-4 flex justify-end">
        <div className="w-64 space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">المجموع الفرعي:</span>
            <span className="tabular-nums">{formatInvoiceAmount(sale.subtotal, settings.currency)}</span>
          </div>
          {sale.discount > 0 ? (
            <div className="flex justify-between text-red-600">
              <span>الخصم:</span>
              <span className="tabular-nums">-{formatInvoiceAmount(sale.discount, settings.currency)}</span>
            </div>
          ) : null}
          <div className="flex justify-between">
            <span className="text-gray-600">الضريبة:</span>
            <span className="tabular-nums">{formatInvoiceAmount(sale.tax, settings.currency)}</span>
          </div>
          <div className="flex justify-between border-t-2 border-black pt-1 text-base font-bold">
            <span>الإجمالي:</span>
            <span className="tabular-nums">{formatInvoiceAmount(sale.total, settings.currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">المدفوع:</span>
            <span className="tabular-nums">{formatInvoiceAmount(sale.paid, settings.currency)}</span>
          </div>
          {sale.change > 0 ? (
            <div className="flex justify-between">
              <span className="text-gray-600">صرف:</span>
              <span className="tabular-nums">{formatInvoiceAmount(sale.change, settings.currency)}</span>
            </div>
          ) : null}
          {sale.due_amount > 0 ? (
            <div className="flex justify-between font-bold text-red-600">
              <span>متبقي:</span>
              <span className="tabular-nums">{formatInvoiceAmount(sale.due_amount, settings.currency)}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Payment methods */}
      <div className="mt-4 border-t border-gray-200 pt-2">
        <p className="text-xs text-gray-500">طريقة الدفع:</p>
        <div className="flex flex-wrap gap-2">
          {sale.payments.map((p, i) => (
            <span key={i} className="rounded border px-2 py-1 text-xs">
              {PAYMENT_LABELS[p.method] ?? p.method}: {formatInvoiceAmount(p.amount, settings.currency)}
              {p.reference ? ` (${p.reference})` : ''}
            </span>
          ))}
        </div>
      </div>

      {/* QR + Barcode */}
      <div className="mt-6 flex items-end justify-between border-t-2 border-black pt-4">
        <div className="flex gap-4">
          {qrUrl ? (
            <div className="text-center">
              <img src={qrUrl} alt="QR" className="size-24" />
              <p className="text-xs text-gray-500">رمز الفاتورة</p>
            </div>
          ) : null}
          {barcodeUrl ? (
            <div className="text-center">
              <img src={barcodeUrl} alt="Barcode" className="h-12" />
              <p className="text-xs text-gray-500">باركود الفاتورة</p>
            </div>
          ) : null}
        </div>
        <div className="text-left text-xs text-gray-500">
          <p>تم إصدار هذه الفاتورة إلكترونياً</p>
          <p>{formatDateTime(sale.created_at)}</p>
        </div>
      </div>

      {/* Footer */}
      {settings.receiptFooter ? (
        <div className="mt-4 border-t border-gray-200 pt-2 text-center text-sm text-gray-600">
          {settings.receiptFooter}
        </div>
      ) : null}

      {sale.notes ? (
        <div className="mt-2 text-xs text-gray-500">
          <span className="font-medium">ملاحظات:</span> {sale.notes}
        </div>
      ) : null}
    </div>
  );
}
