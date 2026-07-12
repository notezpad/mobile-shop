/**
 * Invoice PDF generation + print utilities.
 *
 * Approach:
 *  - For PRINTING: use window.print() with print-specific CSS (best Arabic support).
 *  - For PDF DOWNLOAD: use html2canvas to capture the invoice HTML, then jsPDF to wrap it.
 *
 * Both approaches work fully offline (no server round-trip).
 */
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { generateQrDataUrl, encodeEgyptianInvoiceTlv } from './qr';
import { renderBarcodeDataUrl } from './barcode';
import type { SaleWithDetails } from '@modules/sales/hooks/useSales';

export interface InvoiceSettings {
  storeName: string;
  storeAddress: string | null;
  storePhone: string | null;
  storeEmail: string | null;
  vatNumber: string | null;
  receiptHeader: string | null;
  receiptFooter: string | null;
  showQr: boolean;
  showBarcode: boolean;
  template: 'a4' | 'thermal_80' | 'thermal_58';
  currency: string;
}

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  storeName: 'Mobile Shop ERP',
  storeAddress: null,
  storePhone: null,
  storeEmail: null,
  vatNumber: null,
  receiptHeader: null,
  receiptFooter: null,
  showQr: true,
  showBarcode: false,
  template: 'a4',
  currency: 'EGP',
};

/** Generate QR data URL for an invoice (Egyptian Tax Authority TLV format). */
export async function generateInvoiceQr(
  sale: SaleWithDetails,
  settings: InvoiceSettings,
): Promise<string> {
  const tlvPayload = encodeEgyptianInvoiceTlv({
    sellerName: settings.storeName,
    vatNumber: settings.vatNumber ?? '',
    timestamp: sale.created_at,
    total: sale.total,
    taxTotal: sale.tax,
  });
  return generateQrDataUrl(tlvPayload, { width: 120, margin: 1 });
}

/** Generate barcode data URL for the invoice number. */
export function generateInvoiceBarcode(invoiceNo: string): string {
  return renderBarcodeDataUrl(invoiceNo, { width: 2, height: 40, displayValue: true });
}

/**
 * Print an invoice element via browser print.
 * Opens a new window, writes the invoice HTML + print CSS, triggers print.
 */
export function printInvoice(elementId: string, title = 'فاتورة'): void {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Invoice element #${elementId} not found`);
    return;
  }

  const printWindow = window.open('', '_blank', 'width=800,height=600');
  if (!printWindow) {
    alert('يرجى السماح بالنوافذ المنبثقة للطباعة');
    return;
  }

  // Extract all stylesheets from the current document.
  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map((node) => node.outerHTML)
    .join('\n');

  printWindow.document.write(`<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  ${styles}
  <style>
    @page { margin: 0; }
    body { margin: 0; padding: 16px; background: white; }
    .no-print { display: none !important; }
    .print-area { box-shadow: none !important; }
  </style>
</head>
<body>
  ${element.outerHTML}
</body>
</html>`);
  printWindow.document.close();

  // Wait for fonts + images to load before printing.
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
      // Close after print dialog (some browsers delay this).
      setTimeout(() => printWindow.close(), 500);
    }, 300);
  };
}

/**
 * Download an invoice as PDF.
 * Uses html2canvas to capture the invoice HTML, then jsPDF to wrap it.
 */
export async function downloadInvoicePdf(
  elementId: string,
  filename: string,
  template: 'a4' | 'thermal_80' | 'thermal_58' = 'a4',
): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Invoice element #${elementId} not found`);
    return;
  }

  // Capture HTML to canvas.
  const canvas = await html2canvas(element, {
    scale: 2, // higher resolution
    useCORS: true,
    backgroundColor: '#ffffff',
    logging: false,
  });

  const imgData = canvas.toDataURL('image/png');
  const pdf = new jsPDF({
    orientation: template === 'a4' ? 'portrait' : 'portrait',
    unit: 'mm',
    format: template === 'a4' ? 'a4' : template === 'thermal_80' ? [80, 297] : [58, 297],
  });

  const pdfWidth = pdf.internal.pageSize.getWidth();
  const pdfHeight = pdf.internal.pageSize.getHeight();
  const imgWidth = pdfWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  if (template === 'a4') {
    // Single page A4 — fit to page.
    const finalHeight = Math.min(imgHeight, pdfHeight - 20);
    pdf.addImage(imgData, 'PNG', 10, 10, imgWidth - 20, finalHeight);
  } else {
    // Thermal — multi-page if needed.
    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pdfHeight;
    while (heightLeft > 0) {
      position -= pdfHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
    }
  }

  pdf.save(`${filename}.pdf`);
}

/** Format currency for invoice display. */
export function formatInvoiceAmount(amount: number, currency = 'EGP'): string {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
