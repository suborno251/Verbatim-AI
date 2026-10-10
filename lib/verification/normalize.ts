export interface NormalizedToken {
    word: string;
    originalStart: number;
    originalEnd: number;
}

/**                                                                                                                                                                                                   
 * Strips invisible characters, unifies curly quotes, dashes, and PDF font ligatures.                                                                                                                 
 */
export function cleanText(input: string): string {
    if (!input) return '';
    return input
        // Remove zero-width characters and soft hyphens                                                                                                                                                  
        .replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '')
        // Normalize typographic quotes and apostrophes                                                                                                                                                   
        .replace(/[\u2018\u2019\u201A\u201B\u0060\u00B4]/g, "'")
        .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"')
        // Normalize dashes and hyphens                                                                                                                                                                   
        .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
        // Decompose common PDF ligatures                                                                                                                                                                 
        .replace(/\uFB00/g, 'ff')
        .replace(/\uFB01/g, 'fi')
        .replace(/\uFB02/g, 'fl')
        .replace(/\uFB03/g, 'ffi')
        .replace(/\uFB04/g, 'ffl')
        // Replace non-breaking spaces with standard space                                                                                                                                                
        .replace(/[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
        // Normalize line breaks                                                                                                                                                                          
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n');
}

/**                                                                                                                                                                                                   
 * Converts text into a single-spaced, lowercase string for canonical matching.                                                                                                                       
 */
export function canonicalize(input: string): string {
    return cleanText(input)
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/**                                                                                                                                                                                                   
 * Splits text into words while recording each word's start and end index                                                                                                                             
 * so we can highlight the exact passage in the document viewer.                                                                                                                                      
 */
export function tokenizeWithOffsets(text: string): NormalizedToken[] {
    const cleaned = cleanText(text);
    const tokens: NormalizedToken[] = [];
    const regex = /\S+/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(cleaned)) !== null) {
        const rawWord = match[0];
        // Strip surrounding punctuation for comparison                                                                                                                                                   
        const normalizedWord = rawWord
            .toLowerCase()
            .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

        if (normalizedWord.length > 0) {
            tokens.push({
                word: normalizedWord,
                originalStart: match.index,
                originalEnd: match.index + rawWord.length,
            });
        }
    }

    return tokens;
}