/**
 * InvoicePreviewModal — preview, print, and download invoice.
 *
 * Supports 3 templates:
 *  - A4 (full page)
 *  - Thermal 80mm
 *  - Thermal 58mm
 *
 * Actions:
 *  - Print (window.print — browser native)
 *  - Download PDF (jsPDF + html2canvas)
 *  - Close
 */
import { useState, useEffect } from 'react';
import { X, Printer, Download, FileText, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import { Button, Badge } from '@components/ui';
import type { SaleWithDetails } from '../hooks/useSales';
import { InvoicePrintView } from './InvoicePrintView';
import { InvoiceThermalView } from './InvoiceThermalView';
import {
  printInvoice,
  downloadInvoicePdf,
  type InvoiceSettings,
} from '@lib/invoice-pdf';
import { useSettings } from '@modules/settings/hooks/useSettings';
import { useBranch } from '@modules/branches/hooks/useBranches';

interface InvoicePreviewModalProps {
  sale: SaleWithDetails;
  onClose: () => void;
}

type TemplateType = 'a4' | 'thermal_80' | 'thermal_58';

export function InvoicePreviewModal({ sale, onClose }: InvoicePreviewModalProps) {
  const [template, setTemplate] = useState<TemplateType>('a4');
  const [downloading, setDownloading] = useState(false);
  const { getSetting } = useSettings();
  const branch = useBranch(sale.branch_id);

  // Build invoice settings from global settings + branch settings.
  const settings: InvoiceSettings = {
    storeName: getSetting('general.app_name', 'Mobile Shop ERP') as string,
    storeAddress: branch?.address ?? null,
    storePhone: branch?.phone ?? null,
    storeEmail: branch?.email ?? null,
    vatNumber: (branch?.settings as { vatNumber?: string } | null)?.vatNumber ?? null,
    receiptHeader: getSetting('receipt.invoice_header', null) as string | null,
    receiptFooter: getSetting('receipt.invoice_footer', null) as string | null,
    showQr: getSetting('receipt.show_qr_on_invoice', true) as boolean,
    showBarcode: getSetting('receipt.show_barcode_on_invoice', false) as boolean,
    template: getSetting('receipt.invoice_template', 'a4') as TemplateType,
    currency: (branch?.settings as { currency?: string } | null)?.currency ?? 'EGP',
  };

  // Sync template from settings on mount.
  useEffect(() => {
    if (settings.template) {
      setTemplate(settings.template);
    }
  }, [settings.template]);

  const handlePrint = () => {
    const elementId =
      template === 'a4' ? 'invoice-print-area' : 'invoice-thermal-area';
    printInvoice(elementId, `فاتورة ${sale.invoice_no}`);
  };

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const elementId =
        template === 'a4' ? 'invoice-print-area' : 'invoice-thermal-area';
      await downloadInvoicePdf(elementId, sale.invoice_no, template);
      toast.success('تم تحميل الفاتورة');
    } catch (err) {
      toast.error('فشل تحميل الفاتورة');
      console.error(err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/60" role="dialog">
      {/* Header */}
      <div className="flex items-center justify-between border-b bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">معاينة الفاتورة</h2>
          <Badge variant="secondary" className="font-mono text-xs">{sale.invoice_no}</Badge>
        </div>
        <div className="flex items-center gap-2">
          {/* Template switcher */}
          <div className="flex rounded-md border bg-muted p-1">
            <button
              onClick={() => setTemplate('a4')}
              className={`flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition-colors ${
                template === 'a4' ? 'bg-background shadow-sm' : 'text-muted-foreground'
              }`}
            >
              <FileText className="size-3.5" />
              <span>A4</span>
            </button>
            <button
              onClick={() => setTemplate('thermal_80')}
              className={`flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition-colors ${
                template === 'thermal_80' ? 'bg-background shadow-sm' : 'text-muted-foreground'
              }`}
            >
              <CreditCard className="size-3.5" />
              <span>80mm</span>
            </button>
            <button
              onClick={() => setTemplate('thermal_58')}
              className={`flex items-center gap-1 rounded px-3 py-1 text-xs font-medium transition-colors ${
                template === 'thermal_58' ? 'bg-background shadow-sm' : 'text-muted-foreground'
              }`}
            >
              <CreditCard className="size-3.5" />
              <span>58mm</span>
            </button>
          </div>

          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="size-4" />
            <span>طباعة</span>
          </Button>
          <Button size="sm" onClick={handleDownload} loading={downloading}>
            <Download className="size-4" />
            <span>PDF</span>
          </Button>
          <Button size="icon" variant="ghost" onClick={onClose}>
            <X className="size-5" />
          </Button>
        </div>
      </div>

      {/* Body — invoice preview */}
      <div className="flex-1 overflow-y-auto bg-muted/30 p-4">
        {template === 'a4' ? (
          <div className="shadow-elevated">
            <InvoicePrintView sale={sale} settings={settings} />
          </div>
        ) : (
          <div className="flex justify-center py-4">
            <div className="shadow-elevated">
              <InvoiceThermalView sale={sale} settings={settings} width={template === 'thermal_80' ? 80 : 58} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
