import { ContractDocument, DocumentSection } from '../types';

export interface ToolCallInput {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolName: string;
  description: string;
  summary: string;
  data: string;
  isError?: boolean;
}

/**
 * Tool 1: list_clauses
 * Returns a table of contents / list of all identified clauses and sections.
 */
export function executeListClauses(
  documents: ContractDocument[],
  docId?: string
): ToolResult {
  const targetDocs = docId
    ? documents.filter((d) => d.id === docId)
    : documents;

  if (targetDocs.length === 0) {
    return {
      toolName: 'list_clauses',
      description: 'Listing contract clauses and sections',
      summary: 'No matching document found.',
      data: 'Error: Document not found. Available documents: ' + documents.map((d) => `${d.name} (ID: ${d.id})`).join(', '),
      isError: true,
    };
  }

  const lines: string[] = [];
  let totalClauses = 0;

  for (const doc of targetDocs) {
    lines.push(`DOCUMENT: ${doc.name} (ID: ${doc.id}, Pages: ${doc.pageCount})`);
    const sections = doc.sections || [];
    totalClauses += sections.length;

    if (sections.length === 0) {
      lines.push('  No structured sections detected. Document has ' + doc.pages.length + ' page(s).');
      for (const page of doc.pages) {
        lines.push(`  - Page ${page.pageNumber} (${page.wordCount} words)`);
      }
    } else {
      for (const sec of sections) {
        lines.push(`  - [${sec.id}] ${sec.title} (Page ${sec.pageNumber})`);
      }
    }
    lines.push('');
  }

  return {
    toolName: 'list_clauses',
    description: `Listing contract clauses across ${targetDocs.length} document(s)`,
    summary: `Found ${totalClauses} indexed clauses across ${targetDocs.length} document(s).`,
    data: lines.join('\n').trim(),
  };
}

/**
 * Tool 2: search_document
 * Searches across pages and sections for keywords or phrases.
 */
export function executeSearchDocument(
  documents: ContractDocument[],
  query: string,
  docId?: string
): ToolResult {
  const cleanQuery = (query || '').trim().toLowerCase();

  if (!cleanQuery || cleanQuery.length < 2) {
    return {
      toolName: 'search_document',
      description: 'Searching document',
      summary: 'Empty or invalid search query.',
      data: 'Error: Search query must be at least 2 characters.',
      isError: true,
    };
  }

  const targetDocs = docId
    ? documents.filter((d) => d.id === docId)
    : documents;

  const matches: Array<{
    docName: string;
    docId: string;
    pageNumber: number;
    sectionTitle?: string;
    snippet: string;
    score: number;
  }> = [];

  const queryTerms = cleanQuery.split(/\s+/).filter((t) => t.length > 2);

  for (const doc of targetDocs) {
    // Search pages
    for (const page of doc.pages) {
      const pageTextLower = page.text.toLowerCase();
      let matchCount = 0;

      if (pageTextLower.includes(cleanQuery)) {
        matchCount += 5; // Exact phrase match bonus
      }

      for (const term of queryTerms) {
        const occurrences = (pageTextLower.match(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
        matchCount += occurrences;
      }

      if (matchCount > 0) {
        // Find best snippet window
        let snippet = page.text;
        const idx = pageTextLower.indexOf(cleanQuery);
        if (idx !== -1) {
          const start = Math.max(0, idx - 150);
          const end = Math.min(page.text.length, idx + cleanQuery.length + 250);
          snippet = (start > 0 ? '...' : '') + page.text.slice(start, end).trim() + (end < page.text.length ? '...' : '');
        } else {
          snippet = page.text.slice(0, 350).trim() + '...';
        }

        const relatedSection = doc.sections?.find((s) => s.pageNumber === page.pageNumber);

        matches.push({
          docName: doc.name,
          docId: doc.id,
          pageNumber: page.pageNumber,
          sectionTitle: relatedSection?.title,
          snippet,
          score: matchCount,
        });
      }
    }
  }

  matches.sort((a, b) => b.score - a.score);
  const topMatches = matches.slice(0, 5);

  if (topMatches.length === 0) {
    return {
      toolName: 'search_document',
      description: `Searching for "${query}"`,
      summary: `No occurrences of "${query}" found in document text.`,
      data: `Search query "${query}" yielded 0 matches across the contract text. You should verify whether this concept is addressed under an alternative term or completely absent.`,
    };
  }

  const resultLines = topMatches.map((m, i) => {
    return `[Match ${i + 1}] Document: ${m.docName} (Page ${m.pageNumber}${m.sectionTitle ? `, Section: ${m.sectionTitle}` : ''})\nPassage:\n"${m.snippet}"\n`;
  });

  return {
    toolName: 'search_document',
    description: `Searching for "${query}"`,
    summary: `Found ${topMatches.length} relevant passage(s) for "${query}".`,
    data: resultLines.join('\n'),
  };
}

/**
 * Tool 3: get_section
 * Fetches the full text of a specific section or clause by identifier, number, or title.
 */
export function executeGetSection(
  documents: ContractDocument[],
  sectionIdentifier: string,
  docId?: string
): ToolResult {
  const cleanId = (sectionIdentifier || '').trim().toLowerCase();

  if (!cleanId) {
    return {
      toolName: 'get_section',
      description: 'Retrieving section',
      summary: 'Missing section identifier.',
      data: 'Error: Please specify a section ID, number (e.g. "2" or "4.2"), or title (e.g. "Liability").',
      isError: true,
    };
  }

  const targetDocs = docId
    ? documents.filter((d) => d.id === docId)
    : documents;

  let foundSection: DocumentSection | null = null;
  let ownerDoc: ContractDocument | null = null;

  for (const doc of targetDocs) {
    if (!doc.sections || doc.sections.length === 0) continue;

    // 1. Direct ID match (e.g. "sec-1")
    const byId = doc.sections.find((s) => s.id.toLowerCase() === cleanId);
    if (byId) {
      foundSection = byId;
      ownerDoc = doc;
      break;
    }

    // 2. Section number match (e.g. "4", "4.1")
    const byNum = doc.sections.find((s) => {
      const titleLower = s.title.toLowerCase();
      return (
        titleLower.startsWith(`section ${cleanId}`) ||
        titleLower.startsWith(`article ${cleanId}`) ||
        titleLower.startsWith(`${cleanId}.`) ||
        titleLower.startsWith(`${cleanId} `)
      );
    });
    if (byNum) {
      foundSection = byNum;
      ownerDoc = doc;
      break;
    }

    // 3. Keyword in section title (e.g. "termination", "liability", "confidentiality")
    const byTitle = doc.sections.find((s) => s.title.toLowerCase().includes(cleanId));
    if (byTitle) {
      foundSection = byTitle;
      ownerDoc = doc;
      break;
    }
  }

  if (foundSection && ownerDoc) {
    return {
      toolName: 'get_section',
      description: `Reading Section: ${foundSection.title}`,
      summary: `Retrieved "${foundSection.title}" from ${ownerDoc.name} (Page ${foundSection.pageNumber}).`,
      data: `DOCUMENT: ${ownerDoc.name} (Page ${foundSection.pageNumber})\nSECTION: ${foundSection.title} (ID: ${foundSection.id})\n\nFULL CLAUSE TEXT:\n${foundSection.content}`,
    };
  }

  // Graceful fallback for non-existent or malformed requests
  const availableTitles: string[] = [];
  for (const doc of targetDocs) {
    (doc.sections || []).forEach((s) => availableTitles.push(`- [${s.id}] ${s.title} (Page ${s.pageNumber})`));
  }

  return {
    toolName: 'get_section',
    description: `Attempted to retrieve section "${sectionIdentifier}"`,
    summary: `Section "${sectionIdentifier}" not found.`,
    data: `Error: Section "${sectionIdentifier}" could not be located in the indexed document. Available sections:\n${availableTitles.slice(0, 15).join('\n')}`,
    isError: true,
  };
}

/**
 * Universal Tool Router: Handles malformed calls, missing parameters, and parameter aliases.
 */
export function executeAgentTool(
  toolName: string,
  args: Record<string, unknown>,
  documents: ContractDocument[]
): ToolResult {
  const normTool = (toolName || '').toLowerCase().trim();

  // Parameter normalizations
  const query = (args.query || args.q || args.search || args.term || '') as string;
  const sectionId = (args.sectionIdentifier || args.sectionId || args.number || args.section || args.id || args.title || '') as string;
  const docId = (args.docId || args.documentId || args.doc) as string | undefined;

  switch (normTool) {
    case 'list_clauses':
    case 'listclauses':
    case 'get_clauses':
    case 'toc':
      return executeListClauses(documents, docId);

    case 'search_document':
    case 'searchdocument':
    case 'search':
    case 'find':
      return executeSearchDocument(documents, query || String(args[Object.keys(args)[0]] || ''), docId);

    case 'get_section':
    case 'getsection':
    case 'read_section':
    case 'section':
      return executeGetSection(documents, sectionId || String(args[Object.keys(args)[0]] || ''), docId);

    default:
      return {
        toolName: toolName || 'unknown_tool',
        description: `Executed unknown tool "${toolName}"`,
        summary: `Invalid tool name "${toolName}".`,
        data: `Error: Tool "${toolName}" does not exist. Available tools are: search_document(query), get_section(sectionIdentifier), list_clauses(). Please adjust your call.`,
        isError: true,
      };
  }
}
