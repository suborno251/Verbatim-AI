import { NextResponse } from 'next/server';
import { documentStore } from '@/lib/storage/document-store';

export async function GET(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await props.params;
    const doc = documentStore.get(id);

    if (!doc) {
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, document: doc });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error retrieving document';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
