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

/**
 * Dados do comprovante de aceite eletrônico (página final do PDF assinado). Todos vêm do registro
 * de aceite gravado no banco (ContractPublicSignature) — nunca do frontend. O CPF/CNPJ chega JÁ
 * MASCARADO; este módulo nunca recebe o documento completo.
 */
export interface AcceptanceReceiptInput {
  signerName: string;
  signerDocumentMasked: string;
  signedAt: Date;
  signerIp: string | null;
  /** Hash da assinatura já existente (computeSignatureHash) — não é recalculado aqui. */
  signatureHash: string;
  consentTextVersion: string;
  /** SHA-256 do conteúdo da versão aceita (o mesmo usado dentro do hash da assinatura). */
  contentHash: string;
}

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
  /** Presente apenas no PDF FINAL: acrescenta a página "COMPROVANTE DE ACEITE ELETRÔNICO". */
  acceptance?: AcceptanceReceiptInput;
  /** Somente testes: `false` deixa os streams legíveis para inspecionar o texto. */
  compress?: boolean;
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

/** Nome do PDF final com comprovante de aceite (distinto do PDF original da versão). */
export function signedContractPdfFileName(contractNumber: number, versionNumber: number): string {
  return `Contrato_${Math.trunc(contractNumber)}_v${Math.trunc(versionNumber)}_assinado.pdf`;
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

function formatTimeBR(date: Date): string {
  return date.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour12: false });
}

/** Página final: comprovante de aceite eletrônico (aceite simples por link público de uso único). */
function renderAcceptanceReceipt(
  doc: PDFKit.PDFDocument,
  input: { contractNumber: number; versionNumber: number; receipt: AcceptanceReceiptInput },
  contentWidth: number,
): void {
  const { receipt } = input;
  doc.addPage();

  doc.font(SANS_BOLD).fontSize(14).fillColor('#111111').text('COMPROVANTE DE ACEITE ELETRÔNICO', { align: 'center' });
  doc
    .font(SANS)
    .fontSize(8.5)
    .fillColor(MUTED)
    .text('Aceite eletrônico simples. Não se trata de assinatura digital ICP-Brasil.', { align: 'center' });
  doc.moveDown(0.6);
  const ruleY = doc.y;
  doc.moveTo(MARGIN.left, ruleY).lineTo(MARGIN.left + contentWidth, ruleY).lineWidth(0.6).strokeColor('#999999').stroke();
  doc.moveDown(1.2);

  const rows: { label: string; value: string; mono?: boolean }[] = [
    { label: 'Contrato nº', value: String(input.contractNumber) },
    { label: 'Versão aceita', value: String(input.versionNumber) },
    { label: 'Signatário', value: normalizePdfText(receipt.signerName) },
    { label: 'CPF/CNPJ (mascarado)', value: receipt.signerDocumentMasked },
    { label: 'Data do aceite', value: formatDateBR(receipt.signedAt) },
    { label: 'Hora do aceite', value: `${formatTimeBR(receipt.signedAt)} (horário de Brasília)` },
    { label: 'Endereço IP', value: receipt.signerIp ?? 'não registrado' },
    { label: 'Forma do aceite', value: 'Link público de uso único' },
    { label: 'Texto de consentimento (versão)', value: receipt.consentTextVersion },
    { label: 'Hash SHA-256 do conteúdo da versão', value: receipt.contentHash, mono: true },
    { label: 'Hash da assinatura (SHA-256)', value: receipt.signatureHash, mono: true },
  ];

  for (const row of rows) {
    doc.font(SANS_BOLD).fontSize(8.5).fillColor(MUTED).text(row.label.toUpperCase(), MARGIN.left, doc.y, { width: contentWidth });
    doc
      .font(row.mono ? 'Courier' : SANS)
      .fontSize(row.mono ? 8.5 : 11)
      .fillColor('#000000')
      .text(row.value, MARGIN.left, doc.y + 1, { width: contentWidth });
    doc.moveDown(0.7);
  }

  doc.moveDown(0.8);
  doc
    .font(SANS)
    .fontSize(8.5)
    .fillColor(MUTED)
    .text(
      'Este comprovante foi gerado automaticamente a partir do registro do aceite. O hash da assinatura identifica o evento (signatário, data/hora, IP, versão e conteúdo aceitos) e permite verificar que o registro não foi alterado.',
      MARGIN.left,
      doc.y,
      { width: contentWidth, align: 'justify' },
    );
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
  const { contract, version, office, acceptance } = input;
  const label = `Contrato #${contract.number} · Versão ${version.versionNumber}${input.acceptance ? ' · Assinado' : ''}`;

  const doc = new PDFDocument({
    size: 'A4',
    margins: MARGIN,
    bufferPages: true, // necessário para escrever "Página X de Y" ao final
    ...(input.compress === false ? { compress: false } : {}),
    info: {
      Title: normalizePdfText(`Contrato Nº ${contract.number} — Versão ${version.versionNumber}${acceptance ? ' (assinado)' : ''}`),
      Author: normalizePdfText(office.name),
      Subject: acceptance ? 'Contrato com comprovante de aceite eletrônico' : 'Contrato',
      // Data da versão / do aceite (não a do momento da geração) => mesmos dados, mesmo PDF.
      CreationDate: acceptance ? acceptance.signedAt : version.createdAt,
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

  // Comprovante de aceite (somente no PDF final) ------------------------
  if (acceptance) {
    renderAcceptanceReceipt(
      doc,
      { contractNumber: contract.number, versionNumber: version.versionNumber, receipt: acceptance },
      contentWidth,
    );
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
    fileName: acceptance
      ? signedContractPdfFileName(contract.number, version.versionNumber)
      : contractPdfFileName(contract.number, version.versionNumber),
    mimeType: 'application/pdf',
  };
}
