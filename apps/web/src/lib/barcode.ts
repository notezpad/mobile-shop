/**
 * Barcode generation — uses JsBarcode to render CODE128 barcodes to SVG or canvas.
 * Used for product barcodes and inventory scanning.
 */
import JsBarcode from 'jsbarcode';

/** Render a barcode to an SVG element (string). */
export function renderBarcodeSvg(value: string, options?: {
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  margin?: number;
}): string {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, value, {
    format: 'CODE128',
    width: options?.width ?? 2,
    height: options?.height ?? 60,
    displayValue: options?.displayValue ?? true,
    fontSize: options?.fontSize ?? 14,
    margin: options?.margin ?? 10,
  });
  return canvas.toDataURL('image/png');
}

/** Render a barcode to an <img> data URL (PNG). Suitable for printing. */
export function renderBarcodeDataUrl(value: string, options?: {
  width?: number;
  height?: number;
  displayValue?: boolean;
}): string {
  const canvas = document.createElement('canvas');
  JsBarcode(canvas, value, {
    format: 'CODE128',
    width: options?.width ?? 2,
    height: options?.height ?? 60,
    displayValue: options?.displayValue ?? true,
  });
  return canvas.toDataURL('image/png');
}
