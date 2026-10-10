import { documentStore } from '@/lib/storage/document-store';
import { runAgentResearchLoop } from '@/lib/agent/loop';
import { AgentActivityStep } from '@/lib/types';

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

    // Set up Server-Sent Events stream for real-time activity updates
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        try {
          const result = await runAgentResearchLoop({
            query: message,
            documents: docs,
            maxRounds: 6,
            onActivity: (step: AgentActivityStep) => {
              sendEvent('step', step);
            },
          });

          sendEvent('done', {
            answer: result.answer,
            quotes: result.quotes,
            steps: result.steps,
          });
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : 'Agent research failed';
          sendEvent('error', { error: errMsg });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Agent API error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
