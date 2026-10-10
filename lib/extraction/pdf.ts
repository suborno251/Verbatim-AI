import { ContractDocument, DocumentPage } from '../types';
import { checkIsScannedDocument } from './scanned-detector';
import { extractContractSections } from './sections';

/**
 * Extracts text and structure from a PDF buffer page by page.
 * Validates against scanned documents with no OCR text.
 */
export async function parsePdfBuffer(
  buffer: Buffer | Uint8Array,
  filename: string
): Promise<ContractDocument> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // pdfjs-dist requires a clean Uint8Array without Node Buffer prototype
  const rawUint8 = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const uint8 = new Uint8Array(rawUint8.byteLength);
  uint8.set(rawUint8);

  const loadingTask = pdfjs.getDocument({
    data: uint8,
    useSystemFonts: true,
    disableFontFace: true,
  });

  const pdfDoc = await loadingTask.promise;
  const numPages = pdfDoc.numPages;
  const pages: DocumentPage[] = [];

  for (let i = 1; i <= numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();

    let pageText = '';
    for (const item of textContent.items) {
      if ('str' in item) {
        pageText += item.str + (item.hasEOL ? '\n' : ' ');
      }
    }

    const trimmed = pageText.trim();
    const words = trimmed.split(/\s+/).filter(Boolean);

    pages.push({
      pageNumber: i,
      text: trimmed,
      charCount: trimmed.length,
      wordCount: words.length,
    });
  }

  // Reject scanned PDF with no readable text layer
  const scanCheck = checkIsScannedDocument(pages);
  if (scanCheck.isScanned) {
    throw new Error(scanCheck.reason || 'Scanned document rejected: No readable text layer detected.');
  }

  const fullText = pages.map((p) => `--- PAGE ${p.pageNumber} ---\n${p.text}`).join('\n\n');
  const sections = extractContractSections(pages);

  return {
    id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    name: filename,
    fileType: 'pdf',
    fileSize: uint8.byteLength,
    pageCount: numPages,
    uploadedAt: new Date().toISOString(),
    pages,
    fullText,
    sections,
    isScanned: false,
  };
}
