import { addClient, removeClient } from "@/server/services/sse";

export const dynamic = "force-dynamic";

// Vercel kills any function after 300s regardless of activity. Close the
// stream ourselves shortly before that so the client sees a clean
// disconnect (triggering its normal reconnect logic) instead of a
// "Task timed out" runtime error in the logs.
const CONNECTION_LIFETIME_MS = 280_000;

export async function GET() {
  const clientId = crypto.randomUUID();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Add client to the SSE service
      addClient(clientId, controller);

      // Send initial connection message
      controller.enqueue(
        encoder.encode(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`)
      );

      // Keep-alive ping every 30 seconds
      const pingInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          clearInterval(pingInterval);
        }
      }, 30000);

      // Cleanup on close
      const cleanup = () => {
        clearInterval(pingInterval);
        clearTimeout(closeTimeout);
        removeClient(clientId);
      };

      // Proactively close before Vercel's hard timeout so the client
      // reconnects cleanly instead of erroring out.
      const closeTimeout = setTimeout(() => {
        try {
          controller.close();
        } catch {
          // stream already closed
        }
        cleanup();
      }, CONNECTION_LIFETIME_MS);

      return cleanup;
    },
    cancel() {
      removeClient(clientId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

