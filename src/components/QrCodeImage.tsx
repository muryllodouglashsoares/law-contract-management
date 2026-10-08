import { useEffect, useState } from 'react';

interface Props {
  /** Texto codificado (URI otpauth do 2FA, Pix copia e cola...). Gerado 100% no navegador. */
  value: string;
  size?: number;
  alt: string;
}

/** QR Code gerado localmente (biblioteca `qrcode` carregada sob demanda): o conteúdo nunca sai do navegador. */
export default function QrCodeImage({ value, size = 192, alt }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    import('qrcode')
      .then((QRCode) => QRCode.toDataURL(value, { width: size, margin: 1, errorCorrectionLevel: 'M' }))
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (failed) return <p className="text-xs text-red-600">Não foi possível gerar o QR Code.</p>;
  if (!src) return <div style={{ width: size, height: size }} className="bg-slate-100 rounded animate-pulse" aria-label="Gerando QR Code" />;
  return <img src={src} width={size} height={size} alt={alt} className="rounded border bg-white" style={{ borderColor: 'var(--color-border)' }} />;
}
