import { ContractDocument, QuoteMatch } from '../types';
import { canonicalize, cleanText, tokenizeWithOffsets, NormalizedToken } from './normalize';

export interface VerificationOptions {
    minConfidence?: number;
    allowCrossPage?: boolean;
}

const DEFAULT_MIN_CONFIDENCE = 0.90;

/**
 * Verify a single quote against a contract document.
 * Rule: We NEVER trust any page number or position reported by the AI.
 */
export function verifyQuote(
    rawQuote: string,
    document: ContractDocument,
    options: VerificationOptions = {}
): QuoteMatch {
    const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
    const cleanedQuote = cleanText(rawQuote).trim();
    const canonicalQ = canonicalize(cleanedQuote);

    if (!canonicalQ || canonicalQ.length < 3) {
        return {
            rawQuote,
            verified: false,
            confidence: 0,
            failureReason: 'Quote is empty or too short to verify.',
        };
    }

    const quoteTokens = tokenizeWithOffsets(cleanedQuote);
    if (quoteTokens.length === 0) {
        return {
            rawQuote,
            verified: false,
            confidence: 0,
            failureReason: 'No valid words found in quote.',
        };
    }

    // PASS 1: Check each page for exact canonical match
    for (const page of document.pages) {
        const pageCleaned = cleanText(page.text);
        const pageCanonical = canonicalize(pageCleaned);

        if (pageCanonical.includes(canonicalQ)) {
            const offsets = findTokenOffsetsInPage(pageCleaned, quoteTokens);
            return {
                rawQuote,
                verified: true,
                confidence: 1.0,
                pageNumber: page.pageNumber,
                startOffset: offsets.startOffset,
                endOffset: offsets.endOffset,
                matchedText: offsets.matchedText || rawQuote,
                documentId: document.id,
                documentName: document.name,
            };
        }
    }

    // PASS 2: Sliding-window token match (handles PDF ligatures and punctuation discrepancies)
    let bestMatch: {
        pageNumber: number;
        confidence: number;
        startOffset: number;
        endOffset: number;
        matchedText: string;
    } | null = null;

    for (const page of document.pages) {
        const pageCleaned = cleanText(page.text);
        const pageTokens = tokenizeWithOffsets(pageCleaned);
        if (pageTokens.length === 0) continue;

        const windowResult = findBestTokenWindow(quoteTokens, pageTokens, pageCleaned);
        if (windowResult && (!bestMatch || windowResult.confidence > bestMatch.confidence)) {
            bestMatch = {
                ...windowResult,
                pageNumber: page.pageNumber,
            };
            if (bestMatch.confidence >= 0.98) break;
        }
    }

    if (bestMatch && bestMatch.confidence >= minConfidence) {
        return {
            rawQuote,
            verified: true,
            confidence: bestMatch.confidence,
            pageNumber: bestMatch.pageNumber,
            startOffset: bestMatch.startOffset,
            endOffset: bestMatch.endOffset,
            matchedText: bestMatch.matchedText,
            documentId: document.id,
            documentName: document.name,
        };
    }

    // PASS 3: Cross-page boundary check (quotes spanning across a page break)
    if (options.allowCrossPage !== false && document.pages.length > 1) {
        for (let i = 0; i < document.pages.length - 1; i++) {
            const page1 = document.pages[i];
            const page2 = document.pages[i + 1];
            const combinedText = `${page1.text} ${page2.text}`;
            const combinedCanonical = canonicalize(combinedText);

            if (combinedCanonical.includes(canonicalQ)) {
                return {
                    rawQuote,
                    verified: true,
                    confidence: 0.98,
                    pageNumber: page1.pageNumber,
                    startOffset: 0,
                    endOffset: combinedText.length,
                    matchedText: combinedText,
                    documentId: document.id,
                    documentName: document.name,
                };
            }
        }
    }

    // If none matched, it was hallucinated or paraphrased
    return {
        rawQuote,
        verified: false,
        confidence: bestMatch ? bestMatch.confidence : 0,
        failureReason: 'Quote was not found verbatim in the document (potential paraphrase or hallucination).',
        documentId: document.id,
        documentName: document.name,
    };
}

/**
 * Verifies multiple quotes against one or more contracts.
 */
export function verifyAllQuotes(
    quotes: string[],
    documents: ContractDocument[],
    options: VerificationOptions = {}
): QuoteMatch[] {
    return quotes.map((quote) => {
        let bestResult: QuoteMatch | null = null;
        for (const doc of documents) {
            const result = verifyQuote(quote, doc, options);
            if (result.verified) return result;
            if (!bestResult || result.confidence > bestResult.confidence) {
                bestResult = result;
            }
        }
        return bestResult || {
            rawQuote: quote,
            verified: false,
            confidence: 0,
            failureReason: 'Quote not found in any selected document.',
        };
    });
}

// -----------------------------------------------------------------------------
// Helper Functions: Resolving offsets and sliding token comparison
// -----------------------------------------------------------------------------

function findTokenOffsetsInPage(
    pageText: string,
    quoteTokens: NormalizedToken[]
): { startOffset: number; endOffset: number; matchedText: string } {
    const pageTokens = tokenizeWithOffsets(pageText);
    if (quoteTokens.length === 0 || pageTokens.length === 0) {
        return { startOffset: 0, endOffset: pageText.length, matchedText: pageText };
    }

    const firstWord = quoteTokens[0].word;
    for (let i = 0; i <= pageTokens.length - quoteTokens.length; i++) {
        if (pageTokens[i].word === firstWord) {
            let match = true;
            for (let j = 0; j < quoteTokens.length; j++) {
                if (pageTokens[i + j].word !== quoteTokens[j].word) {
                    match = false;
                    break;
                }
            }
            if (match) {
                const start = pageTokens[i].originalStart;
                const end = pageTokens[i + quoteTokens.length - 1].originalEnd;
                return {
                    startOffset: start,
                    endOffset: end,
                    matchedText: pageText.slice(start, end),
                };
            }
        }
    }
    return { startOffset: 0, endOffset: pageText.length, matchedText: pageText };
}

function findBestTokenWindow(
    quoteTokens: NormalizedToken[],
    pageTokens: NormalizedToken[],
    pageText: string
): { confidence: number; startOffset: number; endOffset: number; matchedText: string } | null {
    const qLen = quoteTokens.length;
    if (pageTokens.length < qLen * 0.7) return null;

    let bestScore = 0;
    let bestStart = 0;
    let bestEnd = 0;

    const minWin = Math.max(1, qLen - 1);
    const maxWin = Math.min(pageTokens.length, qLen + 2);

    for (let win = minWin; win <= maxWin; win++) {
        for (let i = 0; i <= pageTokens.length - win; i++) {
            let matchedCount = 0;
            for (let j = 0; j < qLen && i + j < pageTokens.length; j++) {
                if (quoteTokens[j].word === pageTokens[i + j].word) {
                    matchedCount++;
                }
            }
            const score = matchedCount / qLen;
            if (score > bestScore) {
                bestScore = score;
                bestStart = i;
                bestEnd = Math.min(pageTokens.length - 1, i + win - 1);
            }
        }
    }

    if (bestScore === 0) return null;

    const startOffset = pageTokens[bestStart].originalStart;
    const endOffset = pageTokens[bestEnd].originalEnd;

    return {
        confidence: Math.round(bestScore * 100) / 100,
        startOffset,
        endOffset,
        matchedText: pageText.slice(startOffset, endOffset),
    };
}
