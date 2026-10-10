import { NextResponse } from 'next/server';
import { documentStore } from '@/lib/storage/document-store';
import { processAndVerifyResponseQuotes } from '@/lib/verification/parser';


export async function POST(request: Request) {
  try {
    const { text, documentIds } = await request.json();

    if (!text) {
      return NextResponse.json({ success: false, error: 'Text is required' }, { status: 400 });
    }

    const docs = (documentIds || [])
      .map((id: string) => documentStore.get(id))
      .filter((d: unknown): d is import('@/lib/types').ContractDocument => Boolean(d));

    if (docs.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid documents found' }, { status: 404 });
    }

    const result = processAndVerifyResponseQuotes(text, docs);

    return NextResponse.json({
      success: true,
      quotes: result.quotes,
      cleanText: result.cleanText,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Verification failed';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
