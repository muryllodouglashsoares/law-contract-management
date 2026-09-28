import PDFDocument from 'pdfkit';

/**
 * Gera o PDF de UMA versão específica de um contrato.
 *
 * Camada pura: recebe dados já carregados e devolve um Buffer. Não conhece
 * HTTP, Prisma nem storage — quem chama decide onde salvar o resultado.
 *
 * Usa as fontes padrão do PDF (Times/Helvetica), que dispensam embutir
 * arquivos de fonte e cobrem todo o português (WinAnsi). Caracteres fora
 * desse conjunto são substituídos por "?" em vez de sair corrompidos.
 */

export interface ContractPdfInput {
  contract: { number: number };
  version: { versionNumber: number; content: string; createdAt: Date };
  office: {
    name: string;
    document?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  };
}

export interface GeneratedPdf {
  buffer: Buffer;
  fileName: string;
  mimeType: 'application/pdf';
}

const MARGIN = { top: 64, bottom: 72, left: 72, right: 72 };
const BODY_FONT = 'Times-Roman';
const BOLD_FONT = 'Times-Bold';
const SANS = 'Helvetica';
const SANS_BOLD = 'Helvetica-Bold';
const MUTED = '#555555';

/** Nome previsível e seguro: só dígitos derivados de dados numéricos do sistema. */
export function contractPdfFileName(contractNumber: number, versionNumber: number): string {
  return `Contrato_${Math.trunc(contractNumber)}_v${Math.trunc(versionNumber)}.pdf`;
}

// Caracteres representáveis nas fontes padrão do PDF (Windows-1252).
const UNSUPPORTED_CHARS = /[^\n\t\u0020-\u007E\u00A0-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026\u20AC]/g;

export function normalizePdfText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, '    ')
    .replace(UNSUPPORTED_CHARS, '?');
}

/** Linha curta toda em maiúsculas (ex.: "CLÁUSULA PRIMEIRA") é tratada como título. */
function isHeadingLine(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.length > 2 &&
    trimmed.length <= 80 &&
    trimmed === trimmed.toLocaleUpperCase('pt-BR') &&
    /\p{L}/u.test(trimmed)
  );
}

function formatDateBR(date: Date): string {
  return date.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function officeDetailLines(office: ContractPdfInput['office']): string[] {
  const lines: string[] = [];
  if (office.document) lines.push(`CNPJ/CPF: ${office.document}`);
  if (office.address) lines.push(office.address);
  const contact = [office.phone, office.email].filter(Boolean).join('  ·  ');
  if (contact) lines.push(contact);
  return lines;
}

export async function generateContractPdf(input: ContractPdfInput): Promise<GeneratedPdf> {
  const { contract, version, office } = input;
  const label = `Contrato #${contract.number} · Versão ${version.versionNumber}`;

  const doc = new PDFDocument({
    size: 'A4',
    margins: MARGIN,
    bufferPages: true, // necessário para escrever "Página X de Y" ao final
    info: {
      Title: normalizePdfText(`Contrato Nº ${contract.number} — Versão ${version.versionNumber}`),
      Author: normalizePdfText(office.name),
      Subject: 'Contrato',
      // Data da versão (não a do momento da geração) => mesma versão, mesmo PDF.
      CreationDate: version.createdAt,
    },
  });

  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const contentWidth = doc.page.width - MARGIN.left - MARGIN.right;

  // Cabeçalho (primeira página) --------------------------------------
  doc.font(SANS_BOLD).fontSize(13).fillColor('#111111').text(normalizePdfText(office.name), { align: 'center' });
  const details = officeDetailLines(office);
  if (details.length > 0) {
    doc.font(SANS).fontSize(8.5).fillColor(MUTED);
    for (const line of details) doc.text(normalizePdfText(line), { align: 'center' });
  }
  doc.moveDown(0.6);
  const ruleY = doc.y;
  doc.moveTo(MARGIN.left, ruleY).lineTo(MARGIN.left + contentWidth, ruleY).lineWidth(0.6).strokeColor('#999999').stroke();
  doc.moveDown(1.4);

  // Identificação ----------------------------------------------------
  doc.font(BOLD_FONT).fontSize(15).fillColor('#000000').text(`CONTRATO Nº ${contract.number}`, { align: 'center' });
  doc
    .font(SANS)
    .fontSize(9)
    .fillColor(MUTED)
    .text(`Versão ${version.versionNumber} · ${formatDateBR(version.createdAt)}`, { align: 'center' });
  doc.moveDown(1.6);

  // Conteúdo ---------------------------------------------------------
  doc.fillColor('#000000');
  for (const rawLine of normalizePdfText(version.content).split('\n')) {
    const line = rawLine.trimEnd();
    if (line.trim() === '') {
      doc.moveDown(0.7);
      continue;
    }
    if (isHeadingLine(line)) {
      doc.font(BOLD_FONT).fontSize(11.5).text(line.trim(), { align: 'left', lineGap: 3 });
    } else {
      doc.font(BODY_FONT).fontSize(11.5).text(line, { align: 'justify', lineGap: 3 });
    }
  }

  // Rodapé com paginação ----------------------------------------------
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    // Escrever abaixo da margem inferior faria o pdfkit abrir outra página;
    // zeramos a margem apenas durante o rodapé.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc
      .font(SANS)
      .fontSize(8)
      .fillColor(MUTED)
      .text(`${label} · Página ${i - range.start + 1} de ${range.count}`, MARGIN.left, doc.page.height - 44, {
        width: contentWidth,
        align: 'center',
        lineBreak: false,
      });
    doc.page.margins.bottom = bottomMargin;
  }

  doc.end();
  const buffer = await finished;

  return {
    buffer,
    fileName: contractPdfFileName(contract.number, version.versionNumber),
    mimeType: 'application/pdf',
  };
}
