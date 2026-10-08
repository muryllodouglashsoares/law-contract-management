/**
 * Extrai o texto de um PDF gerado pelo PDFKit com `compress: false` e fontes padrão: o texto sai
 * em strings hexadecimais dentro de operadores Tj/TJ (WinAnsi ≈ latin1). Suficiente para asserts.
 */
export function extractPdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  const chunks: string[] = [];
  for (const match of raw.matchAll(/\[((?:<[0-9a-fA-F]*>|[-\d.\s])+)\]\s*TJ|<([0-9a-fA-F]*)>\s*Tj/g)) {
    const group = match[1] ?? match[2] ?? '';
    const hexParts = [...group.matchAll(/<([0-9a-fA-F]*)>/g)].map((m) => m[1] ?? '');
    const hex = match[2] !== undefined ? [match[2]] : hexParts;
    chunks.push(hex.map((h) => Buffer.from(h, 'hex').toString('latin1')).join(''));
  }
  return chunks.join('\n');
}

export function countPdfPages(buffer: Buffer): number {
  return (buffer.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
}
