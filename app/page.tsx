'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  FileText,
  CheckCircle2,
  AlertTriangle,
  Send,
  Square,
  Trash2,
  Upload,
  Scale,
  BookOpen,
  ExternalLink,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Sparkles,
  Bot,
  Zap,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { ContractDocument, QuoteMatch, ChatMessage, ContractComparisonResult, AgentActivityStep } from '@/lib/types';

export default function Home() {
  // Navigation & View State
  const [activeTab, setActiveTab] = useState<'chat' | 'library' | 'compare'>('chat');
  const [documents, setDocuments] = useState<Array<{ id: string; name: string; fileType: string; fileSize: number; pageCount: number; uploadedAt: string }>>([]);
  
  // Viewer state: active doc in left viewer
  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [activeDocument, setActiveDocument] = useState<ContractDocument | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [activeCitation, setActiveCitation] = useState<{
    pageNumber: number;
    quoteText: string;
    matchedText?: string;
    startOffset?: number;
    endOffset?: number;
    documentId?: string;
    documentName?: string;
  } | null>(null);

  // Multi-document chat selection state (Part B Feature 6)
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);

  // Chat State & Mode (Part C Agentic Research Loop)
  const [chatMode, setChatMode] = useState<'standard' | 'agentic'>('standard');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputPrompt, setInputPrompt] = useState<string>('');
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [agentLiveStep, setAgentLiveStep] = useState<string>('');
  const [expandedStepsMsgId, setExpandedStepsMsgId] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const viewerContainerRef = useRef<HTMLDivElement>(null);

  // Upload State
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadStatusText, setUploadStatusText] = useState<string>('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Comparison State (Part B Feature 7)
  const [compareDoc1Id, setCompareDoc1Id] = useState<string>('');
  const [compareDoc2Id, setCompareDoc2Id] = useState<string>('');
  const [isComparing, setIsComparing] = useState<boolean>(false);
  const [comparisonResult, setComparisonResult] = useState<ContractComparisonResult | null>(null);
  const [significanceFilter, setSignificanceFilter] = useState<'All' | 'High' | 'Medium' | 'Low'>('All');

  const loadDocumentList = useCallback(async () => {
    try {
      const res = await fetch('/api/documents');
      const data = await res.json();
      if (data.success && data.documents.length > 0) {
        setDocuments(data.documents);
      }
    } catch (err) {
      console.error('Failed to load documents:', err);
    }
  }, []);

  // Initial load of documents
  useEffect(() => {
    let ignore = false;
    async function init() {
      try {
        const res = await fetch('/api/documents');
        const data = await res.json();
        if (!ignore && data.success && data.documents.length > 0) {
          setDocuments(data.documents);
          const firstId = data.documents[0].id;
          setSelectedDocId(firstId);
          setSelectedDocIds([firstId]);
          if (data.documents.length >= 2) {
            setCompareDoc1Id(data.documents[0].id);
            setCompareDoc2Id(data.documents[1].id);
          }
        }
      } catch (err) {
        console.error('Failed to initialize document list:', err);
      }
    }
    init();
    return () => {
      ignore = true;
    };
  }, []);

  // Fetch full details and chat history whenever selectedDocId changes (Part A.2)
  useEffect(() => {
    if (!selectedDocId) return;
    let ignore = false;

    async function loadDocAndChat() {
      try {
        const [docRes, histRes] = await Promise.all([
          fetch(`/api/documents/${selectedDocId}`),
          fetch(`/api/chat/history?docId=${selectedDocId}`),
        ]);
        const [docData, histData] = await Promise.all([docRes.json(), histRes.json()]);

        if (!ignore) {
          if (docData.success) {
            setActiveDocument(docData.document);
            setCurrentPage(1);
          }
          if (histData.success && Array.isArray(histData.messages) && histData.messages.length > 0) {
            setMessages(histData.messages);
          } else {
            const local = localStorage.getItem(`verbatim_chat_${selectedDocId}`);
            setMessages(local ? JSON.parse(local) : []);
          }
        }
      } catch (err) {
        console.warn('Failed to load document details or history:', err);
      }
    }

    loadDocAndChat();
    return () => {
      ignore = true;
    };
  }, [selectedDocId]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming, agentLiveStep]);

  // Auto-scroll Document Viewer to highlighted citation passage (Part B Feature 5)
  useEffect(() => {
    if (activeCitation) {
      const timer = setTimeout(() => {
        const mark = document.getElementById('active-citation-highlight');
        if (mark) {
          mark.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [activeCitation, currentPage, selectedDocId]);

  const saveCurrentChatHistory = async (docId: string, updatedMsgs: ChatMessage[]) => {
    if (!docId) return;
    try {
      localStorage.setItem(`verbatim_chat_${docId}`, JSON.stringify(updatedMsgs));
      await fetch('/api/chat/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docId, messages: updatedMsgs }),
      });
    } catch (err) {
      console.warn('Failed to persist chat history:', err);
    }
  };

  // Upload handler with progress feedback & scanned PDF detection
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    setUploadStatusText('Uploading document...');

    try {
      setUploadStatusText('Extracting pages & checking text layer...');
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setUploadError(data.error || 'Failed to process document');
        setUploading(false);
        return;
      }

      setUploadStatusText('Indexing clauses and citations...');
      await loadDocumentList();
      setSelectedDocId(data.document.id);
      setSelectedDocIds([data.document.id]);
      setActiveTab('chat');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setUploadError(msg);
    } finally {
      setUploading(false);
      setUploadStatusText('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteDocument = async (id: string) => {
    if (!confirm('Are you sure you want to delete this contract?')) return;
    try {
      await fetch(`/api/documents?id=${id}`, { method: 'DELETE' });
      localStorage.removeItem(`verbatim_chat_${id}`);
      await loadDocumentList();
      if (selectedDocId === id) {
        setSelectedDocId('');
        setActiveDocument(null);
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
  };

  const toggleDocumentSelection = (id: string) => {
    setSelectedDocIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter((d) => d !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  // Chat message submit handler (supports Standard Streaming & Part C Agentic Research Loop)
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const effectiveDocIds = selectedDocIds.length > 0 ? selectedDocIds : [selectedDocId];
    if (!inputPrompt.trim() || isStreaming || effectiveDocIds.length === 0) return;

    const userText = inputPrompt.trim();
    setInputPrompt('');

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const assistantMsgId = `asst-${Date.now()}`;
    const initialAssistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      mode: chatMode,
      agentSteps: [],
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const updatedWithUser = [...messages, userMsg, initialAssistantMsg];
    setMessages(updatedWithUser);
    setIsStreaming(true);
    setAgentLiveStep(chatMode === 'agentic' ? 'Initializing autonomous research loop...' : '');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (chatMode === 'agentic') {
      // -----------------------------------------------------------------------
      // PART C: Agentic Document Research Loop (SSE Stream)
      // -----------------------------------------------------------------------
      try {
        const response = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userText,
            documentIds: effectiveDocIds,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Error in agent research' }));
          throw new Error(errorData.error || 'Server error');
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        const accumulatedSteps: AgentActivityStep[] = [];

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (!line.trim()) continue;
              const eventMatch = line.match(/^event:\s*(\w+)/m);
              const dataMatch = line.match(/^data:\s*(.+)$/m);
              if (!eventMatch || !dataMatch) continue;

              const eventType = eventMatch[1];
              const eventData = JSON.parse(dataMatch[1]);

              if (eventType === 'step') {
                const step = eventData as AgentActivityStep;
                accumulatedSteps.push(step);
                setAgentLiveStep(step.description);
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId ? { ...msg, agentSteps: [...accumulatedSteps] } : msg
                  )
                );
              } else if (eventType === 'done') {
                setMessages((prev) => {
                  const final = prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? {
                          ...msg,
                          content: eventData.answer,
                          quotes: eventData.quotes,
                          agentSteps: eventData.steps || accumulatedSteps,
                        }
                      : msg
                  );
                  saveCurrentChatHistory(selectedDocId, final);
                  return final;
                });
                setAgentLiveStep('');
              } else if (eventType === 'error') {
                throw new Error(eventData.error);
              }
            }
          }
        }
      } catch (err: unknown) {
        if ((err as Error).name !== 'AbortError') {
          const errorMsg = err instanceof Error ? err.message : 'Agent execution error';
          setMessages((prev) => {
            const final = prev.map((msg) =>
              msg.id === assistantMsgId
                ? { ...msg, content: `*[Agent Error: ${errorMsg}]*` }
                : msg
            );
            saveCurrentChatHistory(selectedDocId, final);
            return final;
          });
        }
      } finally {
        setIsStreaming(false);
        setAgentLiveStep('');
        abortControllerRef.current = null;
      }
    } else {
      // -----------------------------------------------------------------------
      // STANDARD GROUNDED STREAMING CHAT
      // -----------------------------------------------------------------------
      let streamedAccumulated = '';

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: userText,
            documentIds: effectiveDocIds,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Error processing chat' }));
          throw new Error(errorData.error || 'Server error');
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            streamedAccumulated += chunk;

            // Stream display: Mask raw <quote> XML tags gracefully during streaming
            const liveDisplay = streamedAccumulated.replace(
              /<quote(?:\s+doc=["'][^"']+["'])?>([\s\S]*?)<\/quote>/gi,
              '"$1"'
            );

            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId ? { ...msg, content: liveDisplay } : msg
              )
            );
          }
        }
      } catch (err: unknown) {
        if ((err as Error).name !== 'AbortError') {
          const errorMsg = err instanceof Error ? err.message : 'Chat error';
          streamedAccumulated += `\n\n*[Error: ${errorMsg}]*`;
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, content: streamedAccumulated } : msg
            )
          );
        }
      } finally {
        setIsStreaming(false);
        abortControllerRef.current = null;

        if (!streamedAccumulated.trim()) {
          const fallbackMsg = '⚠️ No response was received from the AI model. Please verify your AI API key in .env.local.';
          setMessages((prev) => {
            const final = prev.map((msg) =>
              msg.id === assistantMsgId ? { ...msg, content: fallbackMsg } : msg
            );
            saveCurrentChatHistory(selectedDocId, final);
            return final;
          });
        } else {
          // Post-stream strict quote verification pass
          try {
            const verifyRes = await fetch('/api/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                text: streamedAccumulated,
                documentIds: effectiveDocIds,
              }),
            });
            const verifyData = await verifyRes.json();
            if (verifyData.success) {
              setMessages((prev) => {
                const final = prev.map((msg) =>
                  msg.id === assistantMsgId
                    ? { ...msg, content: verifyData.cleanText, quotes: verifyData.quotes }
                    : msg
                );
                saveCurrentChatHistory(selectedDocId, final);
                return final;
              });
            }
          } catch (vErr) {
            console.error('Quote verification pass failed:', vErr);
          }
        }
      }
    }
  };

  const handleStopStreaming = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
      setAgentLiveStep('');
    }
  };

  // Jump to citation in Document Viewer (Part B Feature 5 & Feature 6)
  const handleJumpToCitation = (quote: QuoteMatch) => {
    // If quote belongs to a different document, switch the viewer active document
    if (quote.documentId && quote.documentId !== selectedDocId) {
      setSelectedDocId(quote.documentId);
    }

    if (quote.pageNumber) {
      setCurrentPage(quote.pageNumber);
      setActiveCitation({
        pageNumber: quote.pageNumber,
        quoteText: quote.rawQuote,
        matchedText: quote.matchedText,
        startOffset: quote.startOffset,
        endOffset: quote.endOffset,
        documentId: quote.documentId,
        documentName: quote.documentName,
      });
    }
  };

  // Run contract version comparison (Part B Feature 7)
  const handleRunComparison = async () => {
    if (!compareDoc1Id || !compareDoc2Id || compareDoc1Id === compareDoc2Id) return;
    setIsComparing(true);
    setComparisonResult(null);

    try {
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doc1Id: compareDoc1Id, doc2Id: compareDoc2Id }),
      });
      const data = await res.json();
      if (data.success) {
        setComparisonResult(data.comparison);
      } else {
        alert(data.error || 'Comparison failed');
      }
    } catch (err) {
      console.error('Comparison error:', err);
    } finally {
      setIsComparing(false);
    }
  };

  // Render Document Page with Highlighting (Whitespace tolerant, handles multi-line citations)
  const renderPageText = (pageText: string) => {
    if (!activeCitation || activeCitation.pageNumber !== currentPage) {
      return <div className="whitespace-pre-wrap leading-relaxed text-slate-300 font-mono text-xs sm:text-sm">{pageText}</div>;
    }

    const target = activeCitation.matchedText || activeCitation.quoteText;
    
    // Normalization check for whitespace & punctuation matching
    const normTarget = target.replace(/\s+/g, ' ').trim().toLowerCase();
    const leadingSnippet = normTarget.slice(0, Math.min(35, normTarget.length));

    // Try finding character offset in original text
    let matchIdx = -1;
    let matchLength = target.length;

    if (activeCitation.startOffset !== undefined && activeCitation.endOffset !== undefined && activeCitation.endOffset > activeCitation.startOffset) {
      matchIdx = activeCitation.startOffset;
      matchLength = activeCitation.endOffset - activeCitation.startOffset;
    } else {
      // Fuzzy substring locator
      const lowerOriginal = pageText.toLowerCase();
      matchIdx = lowerOriginal.indexOf(leadingSnippet);
      if (matchIdx === -1) {
        // Fallback word search
        const firstWord = normTarget.split(' ')[0];
        if (firstWord && firstWord.length > 3) {
          matchIdx = lowerOriginal.indexOf(firstWord);
          matchLength = Math.min(target.length, pageText.length - matchIdx);
        }
      }
    }

    if (matchIdx === -1 || matchIdx >= pageText.length) {
      return (
        <div className="whitespace-pre-wrap leading-relaxed text-slate-300 font-mono text-xs sm:text-sm">
          {pageText}
        </div>
      );
    }

    const before = pageText.slice(0, matchIdx);
    const highlighted = pageText.slice(matchIdx, matchIdx + matchLength);
    const after = pageText.slice(matchIdx + matchLength);

    return (
      <div className="whitespace-pre-wrap leading-relaxed text-slate-300 font-mono text-xs sm:text-sm">
        {before}
        <mark
          id="active-citation-highlight"
          className="bg-amber-400/35 text-amber-100 border-b-2 border-amber-400 px-1 py-0.5 rounded font-semibold transition-all duration-300 shadow-md ring-2 ring-amber-400/20"
        >
          {highlighted}
        </mark>
        {after}
      </div>
    );
  };

  const filteredComparisonItems = (comparisonResult?.items || [])
    .filter((item) => significanceFilter === 'All' || item.significance === significanceFilter)
    .sort((a, b) => {
      const priority = { High: 3, Medium: 2, Low: 1 };
      return (priority[b.significance] || 0) - (priority[a.significance] || 0);
    });

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 overflow-hidden font-sans">
      {/* Top Header */}
      <header className="h-14 border-b border-slate-800 bg-slate-900/80 backdrop-blur px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
            <span className="font-bold text-lg tracking-tight text-white">VERBATIM</span>
          </div>
          <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-medium hidden sm:inline-block">
            Strict Quote Verification Engine
          </span>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center space-x-1.5 ${
              activeTab === 'chat'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Review & Chat</span>
          </button>
          <button
            onClick={() => setActiveTab('library')}
            className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center space-x-1.5 ${
              activeTab === 'library'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Document Library ({documents.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('compare')}
            className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center space-x-1.5 ${
              activeTab === 'compare'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            <span>Compare Versions</span>
          </button>
        </div>
      </header>

      {/* Main Split-Screen Workspace */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane: Interactive Document Viewer (60% width) */}
        <section className="w-full lg:w-3/5 border-r border-slate-800 flex flex-col bg-slate-950/60 overflow-hidden">
          {/* Viewer Toolbar */}
          <div className="h-12 border-b border-slate-800/80 bg-slate-900/40 px-4 flex items-center justify-between shrink-0">
            <div className="flex items-center space-x-2 truncate max-w-md">
              <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
              <span className="text-xs sm:text-sm font-semibold truncate text-slate-200">
                {activeDocument ? activeDocument.name : 'No Document Selected'}
              </span>
              {activeDocument && (
                <span className="text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-400 uppercase font-mono">
                  {activeDocument.fileType}
                </span>
              )}
            </div>

            {/* Pagination Controls */}
            {activeDocument && activeDocument.pageCount > 0 && (
              <div className="flex items-center space-x-2">
                <button
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1 rounded bg-slate-800/80 hover:bg-slate-700 disabled:opacity-40 text-slate-300 transition-colors"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-slate-400 font-mono">
                  Page <strong className="text-white">{currentPage}</strong> of {activeDocument.pageCount}
                </span>
                <button
                  disabled={currentPage >= activeDocument.pageCount}
                  onClick={() => setCurrentPage((p) => Math.min(activeDocument.pageCount, p + 1))}
                  className="p-1 rounded bg-slate-800/80 hover:bg-slate-700 disabled:opacity-40 text-slate-300 transition-colors"
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Viewer Content Area with Scroll Container */}
          <div ref={viewerContainerRef} className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
            {activeDocument ? (
              <div className="w-full max-w-3xl bg-slate-900/90 border border-slate-800 rounded-xl p-8 shadow-2xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs text-slate-400 font-mono">
                  <span>PAGE {currentPage} OF {activeDocument.pageCount}</span>
                  {activeCitation && activeCitation.pageNumber === currentPage && (
                    <span className="text-amber-400 flex items-center space-x-1.5 font-sans font-medium animate-pulse">
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Verified Citation Highlighted Below</span>
                    </span>
                  )}
                </div>

                {/* Page Content with Citation Highlighting */}
                {renderPageText(
                  activeDocument.pages.find((p) => p.pageNumber === currentPage)?.text ||
                    'Page content not available.'
                )}

                {/* Cross-page match notice */}
                {activeCitation && activeCitation.pageNumber === currentPage && activeDocument.pages.length > currentPage && (
                  <div className="pt-2 border-t border-slate-800/60 text-[11px] text-slate-400 flex items-center justify-between">
                    <span className="italic">Document text verified against exact source offsets.</span>
                    <button
                      onClick={() => setCurrentPage((p) => Math.min(activeDocument.pageCount, p + 1))}
                      className="text-indigo-400 hover:text-indigo-300 flex items-center space-x-1"
                    >
                      <span>Next Page</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center space-y-3 p-8">
                <FileText className="w-12 h-12 text-slate-700" />
                <h3 className="text-base font-semibold text-slate-300">No Contract Loaded</h3>
                <p className="text-xs text-slate-500 max-w-sm">
                  Upload a PDF or Word document in the Library tab or select one of the preloaded sample agreements.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Right Pane: Interactive Sidebar (40% width) */}
        <section className="w-full lg:w-2/5 flex flex-col bg-slate-900/60 overflow-hidden">
          {/* TAB 1: Chat & Verified Citations */}
          {activeTab === 'chat' && (
            <div className="flex-1 flex flex-col h-full overflow-hidden">
              {/* Document Multi-Select Bar & Mode Selector (Part B Feature 6 & Part C) */}
              <div className="p-3 border-b border-slate-800 bg-slate-900/95 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Scope:</span>
                    <span className="text-xs text-slate-300 font-medium">
                      {selectedDocIds.length > 1
                        ? `Multi-Document (${selectedDocIds.length} contracts)`
                        : documents.find((d) => d.id === selectedDocId)?.name || 'Select Contract'}
                    </span>
                  </div>

                  {/* Mode Toggle: Standard vs Part C Agentic Loop */}
                  <div className="flex items-center bg-slate-950 p-0.5 rounded border border-slate-800 text-[11px]">
                    <button
                      onClick={() => setChatMode('standard')}
                      className={`px-2 py-0.5 rounded font-medium flex items-center space-x-1 transition-all ${
                        chatMode === 'standard'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Direct response with instant quote verification"
                    >
                      <Zap className="w-3 h-3" />
                      <span>Standard</span>
                    </button>
                    <button
                      onClick={() => setChatMode('agentic')}
                      className={`px-2 py-0.5 rounded font-medium flex items-center space-x-1 transition-all ${
                        chatMode === 'agentic'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title="Autonomous multi-round loop with tools and live activity feed (Part C)"
                    >
                      <Bot className="w-3 h-3" />
                      <span>Agentic (Part C)</span>
                    </button>
                  </div>
                </div>

                {/* Multi-Document Selection Pills (Part B Feature 6) */}
                <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 pt-0.5">
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider shrink-0">Contracts:</span>
                  {documents.map((doc) => {
                    const isChecked = selectedDocIds.includes(doc.id);
                    return (
                      <button
                        key={doc.id}
                        onClick={() => {
                          toggleDocumentSelection(doc.id);
                          if (!isChecked) {
                            setSelectedDocId(doc.id);
                          }
                        }}
                        className={`text-[11px] px-2 py-0.5 rounded-full border transition-all shrink-0 flex items-center space-x-1 ${
                          isChecked
                            ? 'bg-indigo-950/80 border-indigo-500/80 text-indigo-200 shadow-sm'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-300'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isChecked ? 'bg-indigo-400' : 'bg-slate-600'}`} />
                        <span className="truncate max-w-[130px]">{doc.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Messages Feed */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center space-y-4 p-6">
                    <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                      {chatMode === 'agentic' ? <Bot className="w-6 h-6 text-emerald-400" /> : <ShieldCheck className="w-6 h-6 text-indigo-400" />}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-white">
                        {chatMode === 'agentic' ? 'Agentic Document Research Loop' : 'Strict Legal Quote Verification'}
                      </h4>
                      <p className="text-xs text-slate-400 mt-1 max-w-xs">
                        {chatMode === 'agentic'
                          ? 'The agent autonomously calls search_document, get_section, and list_clauses before answering, showing a live activity trace.'
                          : 'Ask any question across selected contracts. Every answer is backed by exact quotes confirmed against the document.'}
                      </p>
                    </div>

                    {/* Example Due Diligence Prompts */}
                    <div className="space-y-1.5 w-full text-left pt-2">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                        Quick Due Diligence Queries:
                      </span>
                      {[
                        'What are the termination for convenience requirements?',
                        'Compare the aggregate liability cap across both agreements.',
                        'Does the contract include an uncapped IP indemnity?',
                        'Is there a non-compete clause in this agreement?',
                      ].map((prompt, idx) => (
                        <button
                          key={idx}
                          onClick={() => setInputPrompt(prompt)}
                          className="w-full text-left text-xs p-2 rounded bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
                        >
                          &ldquo;{prompt}&rdquo;
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col space-y-2 ${
                        msg.role === 'user' ? 'items-end' : 'items-start'
                      }`}
                    >
                      <div
                        className={`max-w-[95%] p-3.5 rounded-xl text-xs sm:text-sm leading-relaxed shadow-sm ${
                          msg.role === 'user'
                            ? 'bg-indigo-600 text-white rounded-br-none'
                            : 'bg-slate-950 border border-slate-800 text-slate-200 rounded-bl-none'
                        }`}
                      >
                        {/* Part C: Autonomous Research Activity Feed (Expandable) */}
                        {msg.agentSteps && msg.agentSteps.length > 0 && (
                          <div className="mb-3 pb-3 border-b border-slate-800/80">
                            <button
                              onClick={() =>
                                setExpandedStepsMsgId(expandedStepsMsgId === msg.id ? null : msg.id)
                              }
                              className="w-full flex items-center justify-between text-left p-2 rounded bg-emerald-950/20 border border-emerald-500/20 hover:border-emerald-500/40 text-emerald-300 text-xs transition-colors"
                            >
                              <div className="flex items-center space-x-2">
                                <Bot className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="font-semibold">
                                  Autonomous Research Trace ({msg.agentSteps.length} step{msg.agentSteps.length > 1 ? 's' : ''})
                                </span>
                              </div>
                              {expandedStepsMsgId === msg.id ? (
                                <ChevronUp className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 text-emerald-400" />
                              )}
                            </button>

                            {expandedStepsMsgId === msg.id && (
                              <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-emerald-500/40 text-[11px]">
                                {msg.agentSteps.map((step) => (
                                  <div key={step.id} className="py-1">
                                    <div className="flex items-center space-x-1.5 text-slate-300">
                                      <span className="font-mono text-emerald-400 text-[10px]">
                                        [{step.toolName || step.type}]
                                      </span>
                                      <span className="font-medium">{step.description}</span>
                                    </div>
                                    {step.details && (
                                      <p className="text-[10px] text-slate-400 font-mono pl-4 mt-0.5 line-clamp-2">
                                        {step.details}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Live Agent activity indicator while thinking */}
                        {isStreaming && msg.id.startsWith('asst-') && agentLiveStep && (
                          <div className="mb-3 p-2 rounded bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs flex items-center space-x-2 animate-pulse">
                            <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                            <span>{agentLiveStep}</span>
                          </div>
                        )}

                        {/* Message Main Body */}
                        <div className="whitespace-pre-wrap">
                          {msg.content || (isStreaming && !agentLiveStep && <span className="animate-pulse">Analyzing contract text & validating quotes...</span>)}
                        </div>

                        {/* Verified Quotes Cards */}
                        {msg.quotes && msg.quotes.length > 0 && (
                          <div className="mt-3 pt-3 border-t border-slate-800/80 space-y-2">
                            <span className="text-[10px] font-bold tracking-wider text-slate-400 uppercase block">
                              Independent Quote Verification:
                            </span>
                            {msg.quotes.map((q, qIdx) => (
                              <div
                                key={qIdx}
                                className={`p-2.5 rounded-lg border text-xs flex flex-col space-y-1.5 ${
                                  q.verified
                                    ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-200'
                                    : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center space-x-1.5 font-medium">
                                    {q.verified ? (
                                      <>
                                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                                        <span className="text-emerald-400">
                                          Verified Quote {q.pageNumber ? `(Page ${q.pageNumber})` : ''}
                                          {q.documentName ? ` • ${q.documentName}` : ''}
                                        </span>
                                      </>
                                    ) : (
                                      <>
                                        <AlertTriangle className="w-3.5 h-3.5 text-rose-400" />
                                        <span className="text-rose-400">Unverified / Paraphrased</span>
                                      </>
                                    )}
                                  </div>

                                  {q.verified && (
                                    <button
                                      onClick={() => handleJumpToCitation(q)}
                                      className="text-[11px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 px-2 py-0.5 rounded flex items-center space-x-1 transition-colors"
                                      title="Highlight passage in document viewer"
                                    >
                                      <span>View in Doc</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                                <p className="italic text-[11px] opacity-90 font-mono bg-black/20 p-1.5 rounded">
                                  &ldquo;{q.rawQuote}&rdquo;
                                </p>
                                {q.failureReason && (
                                  <span className="text-[10px] text-rose-400/80">
                                    {q.failureReason}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-500 px-1">{msg.timestamp}</span>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input Bar */}
              <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-800 bg-slate-900/90 flex flex-col space-y-2">
                <div className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={inputPrompt}
                    onChange={(e) => setInputPrompt(e.target.value)}
                    placeholder={
                      chatMode === 'agentic'
                        ? 'Ask an agentic research question (e.g. "Examine the liability caps across contracts")...'
                        : 'Ask questions about selected contract(s)...'
                    }
                    disabled={isStreaming}
                    className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  {isStreaming ? (
                    <button
                      type="button"
                      onClick={handleStopStreaming}
                      className="px-3 py-2 bg-rose-600 hover:bg-rose-500 rounded-lg text-white font-medium text-xs flex items-center space-x-1.5 transition-colors"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>Stop</span>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!inputPrompt.trim() || selectedDocIds.length === 0}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg text-white font-medium text-xs flex items-center space-x-1.5 transition-colors"
                    >
                      <span>Send</span>
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* TAB 2: Document Library & File Upload */}
          {activeTab === 'library' && (
            <div className="flex-1 flex flex-col h-full overflow-y-auto p-4 space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Upload className="w-4 h-4 text-indigo-400" />
                  <span>Upload & Ingest Contracts</span>
                </h3>
                <span className="text-xs text-slate-400 font-mono">PDF & DOCX</span>
              </div>

              {/* Drag & Drop Upload Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-700 hover:border-indigo-500 bg-slate-950/50 rounded-xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-colors space-y-2"
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".pdf,.docx"
                  className="hidden"
                />
                <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-300">
                  <Upload className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-200">
                    Click or drag contract file here
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Supports PDF and Word (.docx). Automatic scanned document detection.
                  </p>
                </div>
              </div>

              {/* Upload Status / Progress */}
              {uploading && (
                <div className="p-3 bg-indigo-950/30 border border-indigo-500/30 rounded-lg text-xs text-indigo-300 flex items-center space-x-2 animate-pulse">
                  <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                  <span>{uploadStatusText}</span>
                </div>
              )}

              {/* Upload Error Banner (Scanned PDF rejection / Invalid types) */}
              {uploadError && (
                <div className="p-3 bg-rose-950/30 border border-rose-500/30 rounded-lg text-xs text-rose-300 space-y-1">
                  <div className="flex items-center space-x-1.5 font-bold">
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>Upload Rejected</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-rose-200/90">{uploadError}</p>
                </div>
              )}

              {/* Document Library List */}
              <div className="space-y-2 pt-2">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                  Contract Repository ({documents.length}):
                </span>
                {documents.map((doc) => (
                  <div
                    key={doc.id}
                    onClick={() => {
                      setSelectedDocId(doc.id);
                      setSelectedDocIds([doc.id]);
                      setActiveTab('chat');
                    }}
                    className={`p-3 rounded-lg border text-xs cursor-pointer transition-all flex items-center justify-between ${
                      selectedDocId === doc.id
                        ? 'bg-slate-800/80 border-indigo-500 shadow-sm'
                        : 'bg-slate-950 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center space-x-3 truncate">
                      <FileText className="w-5 h-5 text-indigo-400 shrink-0" />
                      <div className="truncate">
                        <p className="font-semibold text-slate-200 truncate">{doc.name}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {doc.pageCount} page(s) • {(doc.fileSize / 1024).toFixed(1)} KB
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      {selectedDocId === doc.id && (
                        <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded font-medium">
                          Active
                        </span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteDocument(doc.id);
                        }}
                        className="p-1 text-slate-500 hover:text-rose-400 transition-colors"
                        title="Delete contract"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 3: Contract Version Comparison (Part B Feature 7) */}
          {activeTab === 'compare' && (
            <div className="flex-1 flex flex-col h-full overflow-y-auto p-4 space-y-4">
              <div className="pb-2 border-b border-slate-800">
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Scale className="w-4 h-4 text-indigo-400" />
                  <span>Clause-Level Contract Diff</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Compare two contracts with substantive legal risk classification (High, Medium, Low).
                </p>
              </div>

              {/* Selector Bar */}
              <div className="grid grid-cols-2 gap-2 bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs">
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                    Base Agreement (v1):
                  </label>
                  <select
                    value={compareDoc1Id}
                    onChange={(e) => setCompareDoc1Id(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200 text-xs"
                  >
                    <option value="">Select contract...</option>
                    {documents.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                    Revised Agreement (v2):
                  </label>
                  <select
                    value={compareDoc2Id}
                    onChange={(e) => setCompareDoc2Id(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-slate-200 text-xs"
                  >
                    <option value="">Select contract...</option>
                    {documents.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Instant Sample Comparison Helper Button */}
              {documents.length >= 2 && (!compareDoc1Id || !compareDoc2Id) && (
                <button
                  onClick={() => {
                    setCompareDoc1Id(documents[0].id);
                    setCompareDoc2Id(documents[1].id);
                  }}
                  className="text-xs text-indigo-400 hover:text-indigo-300 text-left underline"
                >
                  Quick compare: Load Sample Agreement v1 vs v2 Revised
                </button>
              )}

              <button
                disabled={!compareDoc1Id || !compareDoc2Id || compareDoc1Id === compareDoc2Id || isComparing}
                onClick={handleRunComparison}
                className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 rounded-lg text-white font-medium text-xs transition-colors flex items-center justify-center space-x-1.5"
              >
                {isComparing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Analyzing Legal Substance Variance...</span>
                  </>
                ) : (
                  <>
                    <Scale className="w-3.5 h-3.5" />
                    <span>Compare Clauses</span>
                  </>
                )}
              </button>

              {/* Comparison Results */}
              {comparisonResult && (
                <div className="space-y-3 pt-2">
                  {/* Significance Filters */}
                  <div className="flex items-center space-x-1 text-xs">
                    {(['All', 'High', 'Medium', 'Low'] as const).map((filter) => (
                      <button
                        key={filter}
                        onClick={() => setSignificanceFilter(filter)}
                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                          significanceFilter === filter
                            ? 'bg-slate-700 text-white'
                            : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {filter}
                        {filter === 'High' && ` (${comparisonResult.highCount})`}
                        {filter === 'Medium' && ` (${comparisonResult.mediumCount})`}
                        {filter === 'Low' && ` (${comparisonResult.lowCount})`}
                      </button>
                    ))}
                  </div>

                  {/* Changes List */}
                  <div className="space-y-3">
                    {filteredComparisonItems.map((item) => (
                      <div
                        key={item.id}
                        className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-200">{item.clauseTitle}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              item.significance === 'High'
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                : item.significance === 'Medium'
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {item.significance} Risk
                          </span>
                        </div>

                        <p className="text-slate-300 leading-relaxed font-sans">
                          {item.substanceSummary}
                        </p>

                        {(item.doc1Text || item.doc2Text) && (
                          <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                            {item.doc1Text && (
                              <div className="p-2 bg-rose-950/20 border border-rose-900/30 rounded text-rose-200/90 font-mono">
                                <span className="text-[10px] text-rose-400 block font-sans font-bold">Base (v1):</span>
                                &ldquo;{item.doc1Text}&rdquo;
                              </div>
                            )}
                            {item.doc2Text && (
                              <div className="p-2 bg-emerald-950/20 border border-emerald-900/30 rounded text-emerald-200/90 font-mono">
                                <span className="text-[10px] text-emerald-400 block font-sans font-bold">Revised (v2):</span>
                                &ldquo;{item.doc2Text}&rdquo;
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}