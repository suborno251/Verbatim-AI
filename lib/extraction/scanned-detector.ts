import { DocumentPage } from '../types';

export interface ScannedCheckResult {
  isScanned: boolean;
  avgCharPerPage: number;
  totalChars: number;
  emptyPageCount: number;
  reason?: string;
}

const MIN_AVG_CHARS_PER_PAGE = 60; // Minimum characters to consider a contract page readable

/**
 * Checks if a parsed document is likely a scanned image with no readable text layer.
 */
export function checkIsScannedDocument(pages: DocumentPage[]): ScannedCheckResult {
  if (pages.length === 0) {
    return {
      isScanned: true,
      avgCharPerPage: 0,
      totalChars: 0,
      emptyPageCount: 0,
      reason: 'Document has no readable pages.',
    };
  }

  let totalChars = 0;
  let emptyPageCount = 0;

  for (const page of pages) {
    const trimmed = page.text.trim();
    totalChars += trimmed.length;
    if (trimmed.length < 20) {
      emptyPageCount++;
    }
  }

  const avgCharPerPage = Math.round(totalChars / pages.length);
  const emptyRatio = emptyPageCount / pages.length;

  // If average characters per page is below the threshold or majority of pages are empty:
  if (avgCharPerPage < MIN_AVG_CHARS_PER_PAGE || (emptyRatio > 0.8 && pages.length > 1)) {
    return {
      isScanned: true,
      avgCharPerPage,
      totalChars,
      emptyPageCount,
      reason: `Scanned document detected: Average of only ${avgCharPerPage} characters per page found across ${pages.length} page(s). This PDF appears to be a scanned image without an embedded text layer (OCR).`,
    };
  }

  return {
    isScanned: false,
    avgCharPerPage,
    totalChars,
    emptyPageCount,
  };
}
