import { ContractDocument, QuoteMatch } from '../types';
import { verifyQuote } from './engine';

export interface ExtractedQuoteInfo {
  rawText: string;
  docId?: string;
  tagStartIndex: number;
  tagEndIndex: number;
}

/**
 * Parses <quote doc="...">...</quote> tags from model response text.
 */
export function extractQuotesFromText(text: string): ExtractedQuoteInfo[] {
  const quotes: ExtractedQuoteInfo[] = [];
  const regex = /<quote(?:\s+doc=["']([^"']+)["'])?>([\s\S]*?)<\/quote>/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const docId = match[1];
    const rawText = match[2].trim();
    if (rawText.length > 0) {
      quotes.push({
        rawText,
        docId,
        tagStartIndex: match.index,
        tagEndIndex: match.index + match[0].length,
      });
    }
  }

  return quotes;
}

/**
 * Extracts and verifies all quotes from a response against the provided documents.
 */
export function processAndVerifyResponseQuotes(
  responseText: string,
  documents: ContractDocument[]
): { quotes: QuoteMatch[]; cleanText: string } {
  const extracted = extractQuotesFromText(responseText);
  const docMap = new Map(documents.map((d) => [d.id, d]));
  const quoteMatches: QuoteMatch[] = [];

  for (const item of extracted) {
    let targetDoc: ContractDocument | undefined;
    if (item.docId && docMap.has(item.docId)) {
      targetDoc = docMap.get(item.docId);
    } else if (documents.length === 1) {
      targetDoc = documents[0];
    } else {
      let bestResult: QuoteMatch | null = null;
      for (const doc of documents) {
        const res = verifyQuote(item.rawText, doc);
        if (res.verified) {
          bestResult = res;
          break;
        }
        if (!bestResult || res.confidence > bestResult.confidence) {
          bestResult = res;
        }
      }
      if (bestResult) {
        quoteMatches.push(bestResult);
        continue;
      }
    }

    if (targetDoc) {
      const matchResult = verifyQuote(item.rawText, targetDoc);
      quoteMatches.push(matchResult);
    } else {
      quoteMatches.push({
        rawQuote: item.rawText,
        verified: false,
        confidence: 0,
        failureReason: 'Target document could not be resolved.',
      });
    }
  }

  // Clean the text: replace <quote>content</quote> with clean highlighted markdown
  const cleanText = responseText.replace(
    /<quote(?:\s+doc=["'][^"']+["'])?>([\s\S]*?)<\/quote>/gi,
    (_match, content) => `"${content.trim()}"`
  );

  return {
    quotes: quoteMatches,
    cleanText,
  };
}
