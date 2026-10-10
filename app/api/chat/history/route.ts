import { NextResponse } from 'next/server';
import { documentStore } from '@/lib/storage/document-store';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const docId = searchParams.get('docId');

    if (!docId) {
      return NextResponse.json({ success: false, error: 'docId parameter is required' }, { status: 400 });
    }

    const messages = documentStore.getChatHistory(docId);
    return NextResponse.json({ success: true, messages });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to retrieve chat history';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { docId, messages } = await request.json();

    if (!docId || !Array.isArray(messages)) {
      return NextResponse.json({ success: false, error: 'docId and messages array are required' }, { status: 400 });
    }

    documentStore.saveChatHistory(docId, messages);
    return NextResponse.json({ success: true, count: messages.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save chat history';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const docId = searchParams.get('docId');

    if (!docId) {
      return NextResponse.json({ success: false, error: 'docId is required' }, { status: 400 });
    }

    documentStore.clearChatHistory(docId);
    return NextResponse.json({ success: true, message: 'Chat history cleared' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to clear chat history';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
