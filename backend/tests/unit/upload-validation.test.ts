import { describe, expect, it } from 'vitest';

import { ValidationError } from '../../src/shared/errors';
import { sanitizeFileName, validateUpload } from '../../src/shared/storage/upload-validation';
import { SAMPLE_PDF, SAMPLE_PNG } from './helpers-storage';

const MAX = 1024;
const check = (fileName: string, declaredMimeType: string, buffer: Buffer) => validateUpload({ fileName, declaredMimeType, buffer }, { maxBytes: MAX });

const zipWith = (...names: string[]) => Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from(['[Content_Types].xml', ...names].join('\0'))]);
const OLE = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(32)]);

describe('validateUpload', () => {
  it('aceita PDF válido e devolve o MIME canônico', () => {
    expect(check('contrato.pdf', 'application/pdf', SAMPLE_PDF)).toEqual({ fileName: 'contrato.pdf', mimeType: 'application/pdf', fileType: 'PDF' });
  });

  it('aceita PNG, JPG, DOCX, XLSX, DOC e TXT com assinatura correta', () => {
    expect(check('a.png', 'image/png', SAMPLE_PNG).fileType).toBe('PNG');
    expect(check('a.JPEG', 'image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0])).fileType).toBe('JPG');
    expect(check('a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', zipWith('word/document.xml')).fileType).toBe('DOCX');
    expect(check('a.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', zipWith('xl/workbook.xml')).fileType).toBe('XLSX');
    expect(check('a.doc', 'application/msword', OLE).fileType).toBe('DOC');
    expect(check('a.txt', 'text/plain; charset=utf-8', Buffer.from('olá mundo')).fileType).toBe('TXT');
  });

  it('aceita MIME genérico do navegador quando a assinatura confere', () => {
    expect(check('a.pdf', 'application/octet-stream', SAMPLE_PDF).mimeType).toBe('application/pdf');
    expect(check('a.pdf', '', SAMPLE_PDF).mimeType).toBe('application/pdf');
  });

  it('barra executável renomeado para .pdf mesmo declarando application/pdf', () => {
    const exe = Buffer.from('MZ\x90\x00\x03\x00\x00\x00', 'latin1');
    expect(() => check('arquivo.pdf', 'application/pdf', exe)).toThrow(/conteúdo/);
  });

  it('barra PDF disfarçado de imagem, e ZIP genérico como .docx', () => {
    expect(() => check('a.png', 'image/png', SAMPLE_PDF)).toThrow(ValidationError);
    expect(() => check('a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', zipWith('outra/coisa.txt'))).toThrow(/conteúdo/);
  });

  it('barra MIME declarado incompatível com a extensão', () => {
    expect(() => check('a.pdf', 'image/png', SAMPLE_PDF)).toThrow(/não corresponde à sua extensão/);
  });

  it('barra extensões não permitidas (.exe, .html, sem extensão)', () => {
    expect(() => check('a.exe', 'application/octet-stream', Buffer.from('MZ'))).toThrow(/não permitido/);
    expect(() => check('a.html', 'text/html', Buffer.from('<html>'))).toThrow(/não permitido/);
    expect(() => check('semextensao', 'application/pdf', SAMPLE_PDF)).toThrow(/não permitido/);
  });

  it('barra texto com bytes binários', () => {
    expect(() => check('a.txt', 'text/plain', Buffer.from([0x68, 0x00, 0x69]))).toThrow(/conteúdo/);
  });

  it('barra arquivo vazio e arquivo acima do limite', () => {
    expect(() => check('a.pdf', 'application/pdf', Buffer.alloc(0))).toThrow(/vazio/);
    expect(() => check('a.pdf', 'application/pdf', Buffer.concat([SAMPLE_PDF, Buffer.alloc(MAX)]))).toThrow(/tamanho máximo/);
  });

  it('barra nome vazio', () => {
    expect(() => check('   ', 'application/pdf', SAMPLE_PDF)).toThrow(/Nome do arquivo/);
  });
});

describe('sanitizeFileName', () => {
  it('remove diretórios e caracteres de controle', () => {
    expect(sanitizeFileName('../../etc/passwd.pdf')).toBe('passwd.pdf');
    expect(sanitizeFileName('C:\\Users\\x\\contrato.pdf')).toBe('contrato.pdf');
    expect(sanitizeFileName('a\r\nb.pdf')).toBe('ab.pdf');
  });
});
