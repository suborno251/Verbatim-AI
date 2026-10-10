// Represents a single page of an extracted document                                                                                                                                               
export interface DocumentPage {
    pageNumber: number;
    text: string;
    charCount: number;
    wordCount: number;
}

// Represents an Article or Clause
export interface DocumentSection {
    id: string;
    title: string;
    level: number;
    pageNumber: number;
    startChar: number;
    endChar: number;
    content: string;
}

// Represents a fully parsed contract (PDF or DOCX)                                                                                                                                                
export interface ContractDocument {
    id: string;
    name: string;
    fileType: 'pdf' | 'docx';
    fileSize: number;
    pageCount: number;
    uploadedAt: string;
    pages: DocumentPage[];
    fullText: string;
    sections?: DocumentSection[];
    isScanned?: boolean;
}

// The result of the Quote Verification Engine                                                                                                                    
export interface QuoteMatch {
    rawQuote: string;        // The quote string the AI returned                                                                                                                                        
    verified: boolean;       // True if confirmed verbatim in the document                                                                                                                              
    confidence: number;      // 0.0 to 1.0 match score                                                                                                                                                  
    pageNumber?: number;     // Exact page where the quote lives                                                                                                                                        
    startOffset?: number;    // Character offset in that page (for highlighting)                                                                                                                        
    endOffset?: number;
    matchedText?: string;    // The actual text found in the document                                                                                                                                   
    documentId?: string;
    documentName?: string;
    failureReason?: string;  // If unverified, why? (e.g. "Paraphrased", "Not found")                                                                                                                   
}

// Agentic Research Loop step (Part C)
export interface AgentActivityStep {
    id: string;
    type: 'tool_call' | 'tool_result' | 'thought' | 'info';
    toolName?: 'search_document' | 'get_section' | 'list_clauses';
    description: string;
    details?: string;
    timestamp: string;
}

// Chat message in the conversation                                                                                                                                                                
export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    quotes?: QuoteMatch[];   // Verified quotes attached to this message
    agentSteps?: AgentActivityStep[]; // Autonomous research feed (Part C)
    mode?: 'standard' | 'agentic';
    timestamp: string;
}

// Contract comparison diff item                                                                                                                                                 
export interface ContractComparisonItem {
    id: string;
    clauseTitle: string;
    significance: 'High' | 'Medium' | 'Low';
    changeType: 'modified' | 'added' | 'removed';
    doc1Text?: string;
    doc2Text?: string;
    substanceSummary: string;
}

export interface ContractComparisonResult {
    doc1Id: string;
    doc2Id: string;
    doc1Name: string;
    doc2Name: string;
    items: ContractComparisonItem[];
    highCount: number;
    mediumCount: number;
    lowCount: number;
}