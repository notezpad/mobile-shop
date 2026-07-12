/**
 * BarcodeDisplay — renders a barcode for a product SKU.
 * Used on product detail page and inventory labels.
 */
import { useState, useEffect } from 'react';
import { renderBarcodeDataUrl } from '@lib/barcode';

interface BarcodeDisplayProps {
  value: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  className?: string;
}

export function BarcodeDisplay({
  value,
  width = 2,
  height = 60,
  displayValue = true,
  className,
}: BarcodeDisplayProps) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    try {
      const url = renderBarcodeDataUrl(value, { width, height, displayValue });
      setDataUrl(url);
    } catch (err) {
      console.error('Barcode generation failed:', err);
    }
  }, [value, width, height, displayValue]);

  if (!dataUrl) return null;

  return <img src={dataUrl} alt={`Barcode: ${value}`} className={className} />;
}
