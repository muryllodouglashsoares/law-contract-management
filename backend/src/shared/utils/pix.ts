/**
 * Validação do Pix "copia e cola" (BR Code / EMV QR Code): começa com o indicador de formato
 * "000201" e termina com o CRC16-CCITT (poli 0x1021, init 0xFFFF) de 4 hex no campo 63.
 * Só VALIDA o formato — nunca interpreta como pagamento confirmado.
 */
export function crc16Ccitt(input: string): string {
  let crc = 0xffff;
  for (let i = 0; i < input.length; i += 1) {
    crc ^= input.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function isValidPixPayload(payload: string): boolean {
  const code = payload.trim();
  if (code.length < 30 || code.length > 1024 || !code.startsWith('000201')) return false;
  if (!/^[\x20-\x7E]+$/.test(code)) return false;
  const crcIndex = code.length - 8; // "6304" + 4 hex
  if (code.slice(crcIndex, crcIndex + 4) !== '6304') return false;
  return crc16Ccitt(code.slice(0, code.length - 4)) === code.slice(-4).toUpperCase();
}
