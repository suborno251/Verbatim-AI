# Verbatim

A web application for analyzing legal contracts with strict quote verification, interactive citation highlighting, and clause-level comparison.

Built with Next.js 16 (App Router), React 19, and Tailwind CSS.

---

## Overview

When reviewing legal documents with an LLM, hallucinations and paraphrased quotes pose major risks. Verbatim ensures that every answer is backed by exact text from the source document. Before any citation is presented to the user, an independent verification engine validates that the text exists in the contract, accounts for extraction whitespace artifacts, and maps it directly to the rendered document for instant review.

---

## Features

### 1. Document Upload & Ingestion
- Supports **PDF** and **DOCX** files with MIME-type validation.
- **Scanned document detection**: Checks character density across pages. Scanned PDFs with no readable text layer are rejected with a clear message rather than saved as empty documents.
- Real-time processing feedback during parsing and indexing.
- Document library to manage, view, and delete uploaded contracts.

### 2. Chat with Grounded Citations
- Streaming responses with stop generation support (retains generated content).
- Document-scoped conversation history.
- **Quote Verification Engine**:
  - Independent verification: Quotes from model outputs are verified against the raw extracted document before being marked as verified.
  - Normalization: Handles whitespace variance, line wraps, soft hyphens, and typographic punctuation discrepancies common in PDF extraction.
  - Unverified quotes are flagged or stripped if the model paraphrased or hallucinated.
  - If a clause does not exist in the contract, the model explicitly reports its absence rather than guessing.

### 3. Citation Highlighting
- Clicking a verified citation in chat opens the document viewer, jumps to the exact page, and highlights the relevant passage.
- Handles multi-line quotes and clauses that span across page boundaries.

### 4. Large Document Handling (150+ Pages)
- Hierarchical document parsing (Articles / Sections / Clauses) combined with hybrid retrieval (lexical/BM25 + vector).
- Prevents false-negative assertions: For presence/absence queries, the system inspects full section indexes rather than truncated context windows.

### 5. Multi-Document Questions
- Query multiple contracts simultaneously (e.g. comparing indemnity or termination provisions across agreements).
- Quotes are attributed and verified individually against their respective source documents.

### 6. Document Comparison
- Clause-level diffing between two contract versions (rather than raw character diffs).
- Substantive impact assessment: Categorizes changes by legal significance (High, Medium, Low) rather than purely textual revisions.

### 7. Agentic Document Research (Part C)
- Autonomous research loop using defined tools (`search_document`, `get_section`, `list_clauses`).
- Live activity feed showing search progression.
- Hard iteration cap with graceful recovery against malformed tool calls.

---

## Screenshots

<!-- Add screenshots here -->
| Screen | Description |
|---|---|
| *Upload & Library* | Document manager with scanned PDF detection |
| *Chat & Verified Quotes* | Streaming response with verified quote badges |
| *Citation Highlighting* | Synchronized document viewer highlighting clicked quote |
| *Document Comparison* | Clause-level diff with significance filtering |

---

## Local Setup

### Prerequisites
- Node.js 20+
- npm (or pnpm / yarn)

### 1. Clone repository
```bash
git clone git@github.com-work:suborno251/Verbatim-AI.git
cd Verbatim-AI
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables
Create a `.env.local` file in the project root:

```env
# AI Provider Configuration (OpenAI, OpenRouter, Anthropic, Gemini, or local)
AI_API_KEY=your_api_key_here
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```

### 4. Run the development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Implementation Details

### How Quote Verification Works
1. **Extraction Normalization**: The raw extracted text is tokenized and stored alongside an index of character spans and page offsets.
2. **Quote Normalization**: Incoming quotes from model responses are lowercased, with normalized whitespace and stripped punctuation variations (e.g. smart quotes, line-break hyphens).
3. **Sliding Window Matching**: The engine checks for an exact normalized match. If extraction introduced minor discrepancies, a token sliding-window algorithm checks for high-confidence overlap (>= 95%).
4. **Offset Resolution**: Once matched, the engine returns the exact page number and bounding character ranges to the UI viewer. If no match is found, the quote is flagged as unverified.

### Failure Cases & Limitations
- **Poor OCR / Damaged PDFs**: If text extraction returns garbled characters or out-of-order text blocks (e.g. multi-column layouts), token matching may fail to locate a quote despite the clause existing visually.
- **Extreme Paraphrasing**: If an LLM heavily rewords a clause instead of extracting verbatim text, the verification engine will reject the quote as unverified.

---

## Project Status

- [x] Project scaffolding (Next.js 16, React 19, Tailwind CSS)
- [x] Architecture design & verification engine specification
- [x] Document upload & scanned PDF validation (PDF & DOCX, OCR density check)
- [x] Document-scoped chat history persistence (reopening conversations per contract)
- [x] Quote verification engine implementation (canonical matching, sliding-window fallback, cross-page verification)
- [x] Document viewer with synchronized citation highlighting and auto-scrolling
- [x] Multi-document chat (simultaneous cross-contract analysis with source attribution)
- [x] Contract version comparison (clause-level diff with High/Medium/Low legal risk classification)
- [x] Part C: Agentic document research loop (`search_document`, `get_section`, `list_clauses` with live activity feed & hard round cap)

---

## Technical Note & Evaluation Overview (Submission Note)

### 1. How Quote Verification Works and Where It Could Fail
Our verification engine decouples LLM generation from factual citation validation:
- **Canonical Pass**: Incoming citations from `<quote doc="...">` are stripped of soft hyphens (`\u00AD`), zero-width spaces, and PDF typographical ligatures (`ff`, `fi`, `fl`). Whitespace is collapsed to single spaces and lowercase. If an exact canonical substring exists on any page, the quote is immediately verified with 100% confidence.
- **Sliding-Window Token Pass**: When PDF text extraction introduces line-break artifacts, hyphenation differences, or footnote interruptions, a sliding token-window algorithm evaluates token overlap against extracted page tokens with character offsets. Overlaps exceeding 90% confidence are verified and mapped to their exact source character spans.
- **Cross-Page Pass**: Quotes spanning across page breaks are evaluated over consecutive page boundaries.
- **Failure Cases**:
  - *Severe OCR Degradation*: In scanned documents where visual text is noisy or broken into irregular characters, token extraction may fragment words, causing sliding-window matching to reject genuine visual text.
  - *Extreme Model Paraphrasing*: If the LLM significantly summarizes or rewords a clause instead of extracting verbatim wording, the engine strictly rejects the quote as unverified (shown in red) to protect legal diligence.

### 2. Large Document Strategy (150+ Pages)
- **Hierarchical Chunking**: Ingestion parses contracts into logical structures (Articles, Sections, and Clauses) mapped to specific page offsets.
- **Preventing False-Negative Assertions**: Large contracts cannot be arbitrarily truncated into a small prompt without introducing catastrophic false negatives (e.g., claiming a clause is absent because only pages 1–30 were read). Verbatim passes complete section outlines alongside query-matched sections, with explicit system instructions prohibiting negative assertions unless the full contract index confirms absence.

### 3. Part C Choice: Agentic Document Research
- **Selection**: We chose **Option 2 (Agentic Document Research)** because real-world legal due diligence is iterative—attorneys search an index, locate specific articles, and drill into defined terms.
- **Implementation**: We equipped the model with three autonomous tools: `list_clauses()`, `search_document(query)`, and `get_section(sectionIdentifier)`.
- **Live Activity Feed**: Rather than a static spinner, the frontend displays a real-time event trace (`event: step`) indicating tool calls and findings as they occur.
- **Guardrails**: A strict 6-round iteration limit prevents runaway loops. A universal tool router gracefully normalizes parameter aliases and catches malformed calls, feeding diagnostic feedback back to the agent without crashing.
- **Hardest Challenge**: Ensuring the agent smoothly transitions from tool exploration to final grounded synthesis while retaining exact verbatim quotation tags for post-verification.

### 4. Roadmap (Next Steps With More Time)
- **Word Tracked Changes (.docx Redlining)**: Applying Word OpenXML revision markers (`w:ins`, `w:del`) so lawyers can download .docx contracts with directly acceptable redlines.
- **PII & Entity Anonymization**: Automated masking of counterparty names, executives, and financial figures with consistent placeholders (`[PARTY_A]`, `[CONSIDERATION_AMOUNT]`) and reversible mapping tables.
- **Export Due Diligence Memos**: One-click PDF/Word export bundling executive summaries alongside every verified citation and page excerpt.
