import { DocumentPage, DocumentSection } from '../types';

/**
 * Parses contract text across pages into hierarchical sections and clauses.
 * Supports 150+ page contracts and the agentic research loop (Part C).
 */
export function extractContractSections(pages: DocumentPage[]): DocumentSection[] {
  const sections: DocumentSection[] = [];
  const sectionHeadingRegex = /^(?:ARTICLE\s+([0-9IVXLCDM]+)|SECTION\s+([0-9]+(?:\.[0-9]+)*)|CLAUSE\s+([0-9]+)|([0-9]+(?:\.[0-9]+)*)\.?\s+([A-Z][A-Za-z\s]{3,}))/im;

  let currentSection: Partial<DocumentSection> | null = null;
  let sectionContentBuffer: string[] = [];

  for (const page of pages) {
    const lines = page.text.split('\n');
    let charOffset = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(sectionHeadingRegex);

      if (match && trimmed.length < 100) {
        if (currentSection && currentSection.id) {
          currentSection.content = sectionContentBuffer.join('\n').trim();
          currentSection.endChar = (currentSection.startChar || 0) + currentSection.content.length;
          sections.push(currentSection as DocumentSection);
          sectionContentBuffer = [];
        }

        const title = trimmed;
        const id = `sec-${sections.length + 1}`;
        const level = trimmed.toUpperCase().startsWith('ARTICLE') ? 1 : 2;

        currentSection = {
          id,
          title,
          level,
          pageNumber: page.pageNumber,
          startChar: charOffset,
          content: '',
        };
      } else if (currentSection) {
        sectionContentBuffer.push(line);
      }

      charOffset += line.length + 1;
    }
  }

  // Push final section
  if (currentSection && currentSection.id) {
    currentSection.content = sectionContentBuffer.join('\n').trim();
    currentSection.endChar = (currentSection.startChar || 0) + currentSection.content.length;
    sections.push(currentSection as DocumentSection);
  }

  // Fallback: If no explicit numbered headings were matched, create page-based logical sections
  if (sections.length === 0) {
    for (const page of pages) {
      sections.push({
        id: `page-sec-${page.pageNumber}`,
        title: `Page ${page.pageNumber}`,
        level: 1,
        pageNumber: page.pageNumber,
        startChar: 0,
        endChar: page.text.length,
        content: page.text,
      });
    }
  }

  return sections;
}
