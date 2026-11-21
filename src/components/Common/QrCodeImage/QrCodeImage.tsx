import { useEffect, useState } from 'react';

import QRCode from 'qrcode';

export interface QrCodeImageProps {
  value: string;
  size?: number;
  alt?: string;
  className?: string;
}

export function QrCodeImage({ value, size = 152, alt, className }: QrCodeImageProps) {
  const [src, setSrc] = useState('');

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(value, {
      width: Math.max(size, 160),
      margin: 2,
      errorCorrectionLevel: 'M',
    })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc('');
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (!src) {
    return (
      <div
        role="img"
        aria-label={alt ?? `QR ${value}`}
        style={{ width: size, height: size }}
        className={`rounded border border-[var(--sc-border-default)] bg-white ${className ?? ''}`.trim()}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt ?? `QR ${value}`}
      width={size}
      height={size}
      style={{ imageRendering: 'pixelated' }}
      className={className}
    />
  );
}
