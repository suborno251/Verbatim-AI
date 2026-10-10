import { NextResponse } from 'next/server';
import { documentStore } from '@/lib/storage/document-store';
import { parsePdfBuffer } from '@/lib/extraction/pdf';
import { parseDocxBuffer } from '@/lib/extraction/docx';


export async function GET() {
  try {
    const docs = documentStore.getAll();
    const summaries = docs.map((d) => ({
      id: d.id,
      name: d.name,
      fileType: d.fileType,
      fileSize: d.fileSize,
      pageCount: d.pageCount,
      uploadedAt: d.uploadedAt,
      isScanned: d.isScanned,
      sectionCount: d.sections?.length || 0,
    }));

    return NextResponse.json({ success: true, documents: summaries });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to list documents';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

// POST /api/documents - Upload & extract contract
export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file uploaded. Please select a PDF or DOCX file.' },
        { status: 400 }
      );
    }

    const filename = file.name;
    const extension = filename.split('.').pop()?.toLowerCase();

    // Rejection of invalid types with clear error message (Part A Requirement 1)
    if (extension !== 'pdf' && extension !== 'docx') {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported file type: .${extension}. Only PDF (.pdf) and Word (.docx) documents are accepted.`,
        },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let parsedDoc;
    if (extension === 'pdf') {
      parsedDoc = await parsePdfBuffer(buffer, filename);
    } else {
      parsedDoc = await parseDocxBuffer(buffer, filename);
    }

    documentStore.save(parsedDoc, buffer);

    return NextResponse.json({
      success: true,
      document: {
        id: parsedDoc.id,
        name: parsedDoc.name,
        fileType: parsedDoc.fileType,
        fileSize: parsedDoc.fileSize,
        pageCount: parsedDoc.pageCount,
        uploadedAt: parsedDoc.uploadedAt,
        sectionCount: parsedDoc.sections?.length || 0,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error processing document';
    const isScannedError = message.toLowerCase().includes('scanned document');
    return NextResponse.json(
      {
        success: false,
        error: message,
        isScanned: isScannedError,
      },
      { status: isScannedError ? 422 : 500 }
    );
  }
}

// DELETE /api/documents?id=... - Delete contract
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: 'Document ID is required' }, { status: 400 });
    }

    const deleted = documentStore.delete(id);
    if (!deleted) {
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Document deleted successfully' });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete document';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
