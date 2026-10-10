import mammoth from 'mammoth';
import { ContractDocument, DocumentPage } from '../types';
import { extractContractSections } from './sections';

const CHARS_PER_PAGE_ESTIMATE = 2500;

/**
 * Extracts text and structure from a DOCX buffer.
 */
export async function parseDocxBuffer(
  buffer: Buffer,
  filename: string
): Promise<ContractDocument> {
  const result = await mammoth.extractRawText({ buffer });
  const rawText = result.value.trim();

  if (!rawText || rawText.length < 20) {
    throw new Error('Document rejected: DOCX contains no readable text content.');
  }

  // Chunk DOCX into logical pages for navigation and citation mapping
  const paragraphs = rawText.split(/\n\s*\n/);
  const pages: DocumentPage[] = [];
  let currentPageText = '';
  let currentPageNum = 1;

  for (const para of paragraphs) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;

    if (
      currentPageText.length + trimmedPara.length > CHARS_PER_PAGE_ESTIMATE &&
      currentPageText.length > 500
    ) {
      const words = currentPageText.split(/\s+/).filter(Boolean);
      pages.push({
        pageNumber: currentPageNum,
        text: currentPageText.trim(),
        charCount: currentPageText.length,
        wordCount: words.length,
      });
      currentPageNum++;
      currentPageText = trimmedPara + '\n\n';
    } else {
      currentPageText += trimmedPara + '\n\n';
    }
  }

  if (currentPageText.trim().length > 0) {
    const words = currentPageText.split(/\s+/).filter(Boolean);
    pages.push({
      pageNumber: currentPageNum,
      text: currentPageText.trim(),
      charCount: currentPageText.length,
      wordCount: words.length,
    });
  }

  const fullText = pages.map((p) => `--- PAGE ${p.pageNumber} ---\n${p.text}`).join('\n\n');
  const sections = extractContractSections(pages);

  return {
    id: `doc-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    name: filename,
    fileType: 'docx',
    fileSize: buffer.byteLength,
    pageCount: pages.length,
    uploadedAt: new Date().toISOString(),
    pages,
    fullText,
    sections,
    isScanned: false,
  };
}
