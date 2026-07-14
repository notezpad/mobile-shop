/**
 * InvoiceThermalView — thermal receipt template (80mm or 58mm).
 * Compact layout for thermal printers.
 */
import { useEffect, useState } from 'react';
import type { SaleWithDetails } from '@modules/sales/hooks/useSales';
import type { InvoiceSettings } from '@lib/invoice-pdf';
import { generateInvoiceQr, formatInvoiceAmount } from '@lib/invoice-pdf';
import { formatDateTime } from '@core/utils/date';

interface InvoiceThermalViewProps {
  sale: SaleWithDetails;
  settings: InvoiceSettings;
  width?: 80 | 58;
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

export function InvoiceThermalView({
  sale,
  settings,
  width = 80,
  elementId = 'invoice-thermal-area',
}: InvoiceThermalViewProps) {
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const fontSize = width === 80 ? 'text-xs' : 'text-[10px]';
  const smallSize = width === 80 ? 'text-[10px]' : 'text-[8px]';

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
    })();
  }, [sale, settings]);

  const pageWidth = width === 80 ? '80mm' : '58mm';

  return (
    <div
      id={elementId}
      dir="rtl"
      className={`mx-auto bg-white p-2 text-black ${fontSize}`}
      style={{ width: pageWidth, fontFamily: 'Cairo, Tahoma, sans-serif' }}
    >
      {/* Store header */}
      <div className="text-center">
        <h1 className="font-bold" style={{ fontSize: width === 80 ? '16px' : '14px' }}>
          {settings.storeName}
        </h1>
        {settings.storeAddress ? <p className={smallSize}>{settings.storeAddress}</p> : null}
        {settings.storePhone ? <p className={smallSize} dir="ltr">{settings.storePhone}</p> : null}
        {settings.vatNumber ? <p className={smallSize}>VAT: {settings.vatNumber}</p> : null}
      </div>

      {settings.receiptHeader ? (
        <p className="my-1 text-center border-y border-dashed border-gray-400 py-1">{settings.receiptHeader}</p>
      ) : null}

      {/* Invoice info */}
      <div className={`my-2 border-y border-dashed border-gray-400 py-1 ${smallSize}`}>
        <div className="flex justify-between">
          <span>رقم الفاتورة:</span>
          <span className="font-mono">{sale.invoice_no}</span>
        </div>
        <div className="flex justify-between">
          <span>التاريخ:</span>
          <span>{formatDateTime(sale.created_at)}</span>
        </div>
        <div className="flex justify-between">
          <span>الفرع:</span>
          <span>{sale.branch_name ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span>الكاشير:</span>
          <span>{sale.cashier_name ?? '—'}</span>
        </div>
        {sale.customer_name ? (
          <div className="flex justify-between">
            <span>العميل:</span>
            <span>{sale.customer_name}</span>
          </div>
        ) : null}
      </div>

      {/* Items */}
      <table className="w-full">
        <thead>
          <tr className="border-b border-dashed border-gray-400">
            <th className="text-right">الصنف</th>
            <th className="w-8 text-center">×‎</th>
            <th className="w-16 text-left">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item, idx) => (
            <tr key={idx} className="border-b border-dotted border-gray-300">
              <td className="py-0.5">
                <div className="font-medium">{item.product_name ?? 'منتج'}</div>
                {item.imei1 ? <div className={smallSize} dir="ltr">{item.imei1}</div> : null}
                <div className={smallSize}>
                  {item.quantity} × {formatInvoiceAmount(item.unit_price, settings.currency)}
                  {item.discount > 0 ? ` -${formatInvoiceAmount(item.discount, settings.currency)}` : ''}
                </div>
              </td>
              <td className="text-center">{item.quantity}</td>
              <td className="text-left font-bold">{formatInvoiceAmount(item.total, settings.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="mt-2 border-t border-dashed border-gray-400 pt-1">
        <div className="flex justify-between">
          <span>المجموع:</span>
          <span>{formatInvoiceAmount(sale.subtotal, settings.currency)}</span>
        </div>
        {sale.discount > 0 ? (
          <div className="flex justify-between">
            <span>الخصم:</span>
            <span>-{formatInvoiceAmount(sale.discount, settings.currency)}</span>
          </div>
        ) : null}
        <div className="flex justify-between">
          <span>الضريبة:</span>
          <span>{formatInvoiceAmount(sale.tax, settings.currency)}</span>
        </div>
        <div className="flex justify-between border-t border-black pt-1 font-bold" style={{ fontSize: width === 80 ? '14px' : '12px' }}>
          <span>الإجمالي:</span>
          <span>{formatInvoiceAmount(sale.total, settings.currency)}</span>
        </div>
        <div className="flex justify-between">
          <span>المدفوع:</span>
          <span>{formatInvoiceAmount(sale.paid, settings.currency)}</span>
        </div>
        {sale.change > 0 ? (
          <div className="flex justify-between">
            <span>صرف:</span>
            <span>{formatInvoiceAmount(sale.change, settings.currency)}</span>
          </div>
        ) : null}
        {sale.due_amount > 0 ? (
          <div className="flex justify-between font-bold">
            <span>متبقي:</span>
            <span>{formatInvoiceAmount(sale.due_amount, settings.currency)}</span>
          </div>
        ) : null}
      </div>

      {/* Payments */}
      <div className="mt-1">
        {sale.payments.map((p, i) => (
          <div key={i} className="flex justify-between">
            <span>{PAYMENT_LABELS[p.method] ?? p.method}:</span>
            <span>{formatInvoiceAmount(p.amount, settings.currency)}</span>
          </div>
        ))}
      </div>

      {/* QR */}
      {qrUrl ? (
        <div className="mt-2 flex justify-center">
          <img src={qrUrl} alt="QR" className="size-20" />
        </div>
      ) : null}

      {/* Footer */}
      {settings.receiptFooter ? (
        <p className="mt-2 text-center border-t border-dashed border-gray-400 pt-1">{settings.receiptFooter}</p>
      ) : null}

      <p className={`mt-1 text-center ${smallSize}`}>
        {formatDateTime(sale.created_at)}
      </p>
    </div>
  );
}
