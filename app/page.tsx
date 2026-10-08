'use client'; // 1. Tells Next.js this runs interactively in the browser                                                                                                                              

import { useState } from 'react';

const CONTRACT_TEXT = 'Neither party shall be liable for aggregate damages exceeding AED 500,000.';

export default function Home() {
  const [inputQuote, setInputQuote] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const checkQuote = () => {
    // Basic check: normalize whitespace & lowercase                                                                                                                                                  
    const normalizedContract = CONTRACT_TEXT.toLowerCase();
    const normalizedInput = inputQuote.trim().toLowerCase();

    if (!normalizedInput) {
      setResult('Please type a quote first!');
    } else if (normalizedContract.includes(normalizedInput)) {
      setResult('✅ VERIFIED: Found verbatim in the contract text.');
    } else {
      setResult('❌ REJECTED: Not found or was paraphrased.');
    }
  };

  return (
    <main className="min-h-screen bg-slate-900 text-slate-100 p-8 flex flex-col items-center justify-center font-sans">
      <div className="max-w-lg w-full bg-slate-800 p-6 rounded-xl border border-slate-700 shadow-xl space-y-4">
        <h1 className="text-xl font-bold text-white">Mini Quote Verifier Warm-Up</h1>

        <div className="p-3 bg-slate-900/80 rounded border border-slate-700 text-sm text-slate-300">
          <span className="text-xs font-semibold text-emerald-400 block mb-1">SAMPLE CONTRACT CLAUSE:</span>
          &quot;{CONTRACT_TEXT}&quot;
        </div>

        <input
          type="text"
          value={inputQuote}
          onChange={(e) => setInputQuote(e.target.value)}
          placeholder="Try typing: AED 500,000 or aggregate damages"
          className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded text-white text-sm focus:outline-none focus:border-indigo-500"
        />

        <button
          onClick={checkQuote}
          className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 rounded font-medium text-sm transition-colors"
        >
          Verify Quote
        </button>

        {result && (
          <div className="p-3 bg-slate-900/50 rounded text-sm font-medium border border-slate-700">
            {result}
          </div>
        )}
      </div>
    </main>
  );
}