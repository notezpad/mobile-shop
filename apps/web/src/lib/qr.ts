/**
 * QR code generation — uses `qrcode` to render QR codes.
 * Used for invoices (Egyptian Tax Authority TLV format) + repair tracking.
 */
import QRCode from 'qrcode';

/** Generate a QR code as a data URL (PNG, base64). */
export async function generateQrDataUrl(
  text: string,
  options?: { width?: number; margin?: number; dark?: string; light?: string },
): Promise<string> {
  return QRCode.toDataURL(text, {
    width: options?.width ?? 200,
    margin: options?.margin ?? 1,
    color: {
      dark: options?.dark ?? '#000000',
      light: options?.light ?? '#FFFFFF',
    },
    errorCorrectionLevel: 'M',
  });
}

/** Generate QR code as an SVG string. */
export async function generateQrSvg(
  text: string,
  options?: { width?: number; margin?: number },
): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    width: options?.width ?? 200,
    margin: options?.margin ?? 1,
    errorCorrectionLevel: 'M',
  });
}

/**
 * Encode an Egyptian Tax Authority invoice TLV (Tag-Length-Value) QR payload.
 * Tags: 1=seller, 2=VAT, 3=timestamp, 4=total, 5=tax.
 * See: https://www.zatca.gov.sa/en/eInvoice/Pages/WhatIsQRCode.aspx
 */
export function encodeEgyptianInvoiceTlv(input: {
  sellerName: string;
  vatNumber: string;
  timestamp: string;
  total: number;
  taxTotal: number;
}): string {
  const enc = new TextEncoder();
  const tags = [
    [1, enc.encode(input.sellerName)],
    [2, enc.encode(input.vatNumber)],
    [3, enc.encode(input.timestamp)],
    [4, enc.encode(input.total.toFixed(2))],
    [5, enc.encode(input.taxTotal.toFixed(2))],
  ] as const;

  const chunks: number[] = [];
  for (const [tag, value] of tags) {
    chunks.push(tag, value.length, ...Array.from(value));
  }

  const bytes = new Uint8Array(chunks);
  return btoa(String.fromCharCode(...bytes));
}
