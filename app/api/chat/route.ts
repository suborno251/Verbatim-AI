import { streamText } from 'ai';
import { getLanguageModel } from '@/lib/ai/client';
import { buildSystemPrompt, buildUserPrompt } from '@/lib/ai/prompts';
import { documentStore } from '@/lib/storage/document-store';


export async function POST(request: Request) {
  try {
    const { message, documentIds } = await request.json();

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!documentIds || !Array.isArray(documentIds) || documentIds.length === 0) {
      return new Response(JSON.stringify({ error: 'At least one document must be selected' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const docs = documentIds
      .map((id: string) => documentStore.get(id))
      .filter((d: unknown): d is import('@/lib/types').ContractDocument => Boolean(d));

    if (docs.length === 0) {
      return new Response(JSON.stringify({ error: 'Selected document(s) not found in library' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let model;
    try {
      model = getLanguageModel();
    } catch (e: unknown) {
      const errMessage = e instanceof Error ? e.message : 'AI configuration error';
      return new Response(JSON.stringify({ error: errMessage }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const systemPrompt = buildSystemPrompt(docs);
    const userPrompt = buildUserPrompt(message, docs);

    const result = streamText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.1,
    });

    return result.toTextStreamResponse();
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Chat error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
