import { generateText } from 'ai';
import { getLanguageModel } from '../ai/client';
import { ContractDocument, QuoteMatch, AgentActivityStep } from '../types';
import { executeAgentTool, ToolResult } from './tools';
import { processAndVerifyResponseQuotes } from '../verification/parser';

export interface AgentRunOptions {
  query: string;
  documents: ContractDocument[];
  maxRounds?: number;
  onActivity?: (step: AgentActivityStep) => void;
}

export interface AgentRunResult {
  success: boolean;
  answer: string;
  quotes: QuoteMatch[];
  steps: AgentActivityStep[];
  error?: string;
}

interface MessageHistoryItem {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/**
 * Executes a multi-round autonomous document research loop (Part C).
 * Emits live activity steps as tools are called and returns final grounded answer with verified quotes.
 */
export async function runAgentResearchLoop(options: AgentRunOptions): Promise<AgentRunResult> {
  const { query, documents, maxRounds = 6, onActivity } = options;
  const model = getLanguageModel();
  const activitySteps: AgentActivityStep[] = [];

  const emitStep = (step: Omit<AgentActivityStep, 'id' | 'timestamp'>) => {
    const fullStep: AgentActivityStep = {
      ...step,
      id: `step-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
    activitySteps.push(fullStep);
    if (onActivity) {
      onActivity(fullStep);
    }
  };

  // Initial step notification
  emitStep({
    type: 'info',
    description: `Initiated autonomous research for "${query.slice(0, 60)}..."`,
    details: `Searching across ${documents.length} document(s). Hard round limit: ${maxRounds}.`,
  });

  const docsMetadata = documents.map((d) => {
    return `- ${d.name} (ID: ${d.id}, ${d.pageCount} pages, ${d.sections?.length || 0} indexed sections)`;
  }).join('\n');

  const systemPrompt = `You are an autonomous legal contract research agent.
Your objective is to answer the user's inquiry with 100% grounded precision by autonomously researching the contract using available tools.

AVAILABLE DOCUMENTS:
${docsMetadata}

AVAILABLE TOOLS:
1. list_clauses(docId?)
   Returns table of contents and all indexed sections/clauses.
2. search_document(query, docId?)
   Performs lexical search across all pages and sections for keywords or phrases.
3. get_section(sectionIdentifier, docId?)
   Retrieves the full text of a specific section by ID (e.g. "sec-1"), section number (e.g. "2" or "4.2"), or title (e.g. "Limitation of Liability").

RULES:
- When you need to investigate, call ONE tool by outputting a JSON object with this exact shape:
\`\`\`json
{
  "tool": "search_document",
  "arguments": { "query": "termination notice" }
}
\`\`\`
- You can inspect sections repeatedly until you have sufficient evidence.
- Once you have the exact text needed, output your FINAL ANSWER.
- In your FINAL ANSWER, every factual assertion must be backed by an EXACT verbatim quote wrapped in <quote doc="DOC_ID">exact text here</quote>.
- Do NOT guess or paraphrase quotes.
- If a clause does not exist in the contract after checking the index and searching, explicitly state that it does not exist.
- If you are ready with the final answer, do NOT call any tools. Output the response directly to the user.`;

  const conversation: MessageHistoryItem[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `QUESTION: ${query}\n\nBegin your research now. Inspect clauses or search the document as needed.` },
  ];

  let round = 0;
  let finalRawAnswer = '';

  while (round < maxRounds) {
    round++;

    // Generate model action
    const response = await generateText({
      model,
      messages: conversation,
      temperature: 0.1,
    });

    const outputText = response.text.trim();

    // Parse potential tool call
    const toolCall = parseToolCallFromText(outputText);

    if (toolCall) {
      // Human-readable tool descriptions for live activity feed
      let friendlyDesc = `Calling tool "${toolCall.toolName}"`;
      if (toolCall.toolName === 'search_document') {
        const q = String(toolCall.args.query || toolCall.args.q || '');
        friendlyDesc = `Searching document for "${q}"`;
      } else if (toolCall.toolName === 'get_section') {
        const s = String(toolCall.args.sectionIdentifier || toolCall.args.section || toolCall.args.id || '');
        friendlyDesc = `Inspecting Section "${s}"`;
      } else if (toolCall.toolName === 'list_clauses') {
        friendlyDesc = 'Scanning contract clause index';
      }

      emitStep({
        type: 'tool_call',
        toolName: toolCall.toolName as 'search_document' | 'get_section' | 'list_clauses',
        description: friendlyDesc,
        details: JSON.stringify(toolCall.args),
      });

      // Execute tool with error recovery
      const result: ToolResult = executeAgentTool(toolCall.toolName, toolCall.args, documents);

      emitStep({
        type: 'tool_result',
        toolName: toolCall.toolName as 'search_document' | 'get_section' | 'list_clauses',
        description: result.summary,
        details: result.data.slice(0, 300) + (result.data.length > 300 ? '...' : ''),
      });

      // Feed tool result back into conversation
      conversation.push({ role: 'assistant', content: outputText });
      conversation.push({
        role: 'user',
        content: `TOOL RESULT [${result.toolName}]:\n${result.data}\n\nReview this result. If you have enough evidence, provide your FINAL ANSWER with verbatim <quote doc="...">...</quote> tags. Otherwise, call another tool.`,
      });
    } else {
      // Model decided to give final answer
      finalRawAnswer = outputText;
      break;
    }
  }

  // If hard round cap reached without final answer
  if (!finalRawAnswer) {
    emitStep({
      type: 'info',
      description: `Reached maximum research limit (${maxRounds} rounds). Formulating synthesis...`,
    });

    conversation.push({
      role: 'user',
      content: 'Maximum research rounds reached. Please synthesize your final response now using the evidence gathered above. Back all claims with <quote doc="...">...</quote> verbatim citations.',
    });

    const finalResponse = await generateText({
      model,
      messages: conversation,
      temperature: 0.1,
    });

    finalRawAnswer = finalResponse.text.trim();
  }

  emitStep({
    type: 'info',
    description: 'Verifying quotes against source document text...',
  });

  // Strict Quote Verification Pass on Final Answer
  const verificationResult = processAndVerifyResponseQuotes(finalRawAnswer, documents);

  const verifiedCount = verificationResult.quotes.filter((q) => q.verified).length;
  const unverifiedCount = verificationResult.quotes.filter((q) => !q.verified).length;

  emitStep({
    type: 'info',
    description: `Research complete: ${verifiedCount} verified citation(s), ${unverifiedCount} unverified.`,
  });

  return {
    success: true,
    answer: verificationResult.cleanText,
    quotes: verificationResult.quotes,
    steps: activitySteps,
  };
}

/**
 * Extracts tool calls from model output (supports JSON markdown blocks, raw JSON, or XML tags).
 */
function parseToolCallFromText(text: string): { toolName: string; args: Record<string, unknown> } | null {
  // 1. JSON markdown block ```json { "tool": "..." } ```
  const jsonBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1]);
      if (parsed.tool) {
        return { toolName: parsed.tool, args: parsed.arguments || parsed.args || {} };
      }
    } catch {
      // Fall through
    }
  }

  // 2. Direct JSON object containing "tool"
  const directJsonMatch = text.match(/\{\s*"tool"\s*:\s*"([^"]+)"[\s\S]*?\}/);
  if (directJsonMatch) {
    try {
      const parsed = JSON.parse(directJsonMatch[0]);
      return { toolName: parsed.tool, args: parsed.arguments || parsed.args || {} };
    } catch {
      // Fall through
    }
  }

  // 3. XML style: <tool name="search_document" query="..." />
  const xmlMatch = text.match(/<tool\s+name=["']([^"']+)["']([^>]*?)(?:\/?>|>([\s\S]*?)<\/tool>)/i);
  if (xmlMatch) {
    const toolName = xmlMatch[1];
    const rawAttrs = xmlMatch[2];
    const content = xmlMatch[3];
    const args: Record<string, unknown> = {};

    const attrRegex = /(\w+)=["']([^"']+)["']/g;
    let attrMatch: RegExpExecArray | null;
    while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
      args[attrMatch[1]] = attrMatch[2];
    }

    if (content) {
      args.content = content.trim();
    }

    return { toolName, args };
  }

  return null;
}
