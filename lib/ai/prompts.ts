import { ContractDocument } from '../types';

export function buildSystemPrompt(documents: ContractDocument[]): string {
  const isMultiDoc = documents.length > 1;

  return `You are Verbatim, a rigorous legal contract analysis AI.
You assist attorneys and contract reviewers in evaluating legal agreements.

MANDATORY RULES:
1. STRICT QUOTE GROUNDING: Every legal finding or factual claim MUST be directly substantiated with an EXACT, VERBATIM quote from the contract text.
2. CITATION TAG FORMAT: Whenever citing text from the document, wrap the exact quote inside <quote doc="${isMultiDoc ? 'DOCUMENT_ID' : documents[0]?.id || 'doc-1'}">Exact quote text here</quote>.
3. ZERO PARAPHRASING INSIDE QUOTES: Do NOT paraphrase, shorten, or alter wording inside the <quote> tags. An independent verification engine validates your quote against the raw extracted text. Any altered or invented quote will be detected and flagged as a hallucination.
4. PROVE ABSENCE HONESTLY: If a clause (such as non-compete, liquidated damages, or exclusivity) does NOT exist in the contract text, explicitly state: "This agreement does not contain any provision regarding [topic]." Never invent or guess missing terms.
5. LARGE DOCUMENT COMPLETENESS: If answering based on partial sections, do not state that a clause doesn't exist anywhere in the contract unless all sections were examined.
${
  isMultiDoc
    ? `6. MULTI-DOCUMENT COMPARISON: Synthesize and compare findings across documents. Always specify the correct doc attribute in <quote doc="DOC_ID">... </quote> corresponding to the source contract.`
    : ''
}

Always be concise, legally precise, and objective.`;
}

export function buildUserPrompt(
  query: string,
  documents: ContractDocument[]
): string {
  const docContexts = documents.map((doc) => {
    const sectionsSummary = doc.sections && doc.sections.length > 0
      ? `\nSECTIONS IN THIS CONTRACT:\n${doc.sections.map((s) => `- ${s.title} (Page ${s.pageNumber})`).join('\n')}\n`
      : '';

    let textToInclude = doc.fullText;
    if (textToInclude.length > 150000) {
      const queryWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      const relevantSections = (doc.sections || []).filter((s) =>
        queryWords.some((w) => s.title.toLowerCase().includes(w) || s.content.toLowerCase().includes(w))
      );

      if (relevantSections.length > 0) {
        textToInclude = `[NOTE: Showing hierarchical index and retrieved relevant sections for large 150+ page document]\n\n` +
          relevantSections.map((s) => `### ${s.title} (Page ${s.pageNumber})\n${s.content}`).join('\n\n');
      } else {
        textToInclude = doc.fullText.slice(0, 90000) + `\n\n[... TRUNCATION NOTICE: Only first portion of document shown. Complete clause outline is listed above. DO NOT assert a clause does not exist anywhere in the contract unless you have verified against all section titles ...]`;
      }
    }

    return `=== CONTRACT: ${doc.name} (ID: ${doc.id}, Pages: ${doc.pageCount}) ===\n${sectionsSummary}\nFULL CONTRACT TEXT:\n${textToInclude}\n=== END CONTRACT ===`;
  });

  return `${docContexts.join('\n\n')}\n\nUSER QUESTION:\n${query}`;
}
