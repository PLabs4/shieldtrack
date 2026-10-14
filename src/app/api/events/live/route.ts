import { listBalancedLiveEvents } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const encoder = new TextEncoder();
  let closed = false;
  let lastSeen = new Set<string>();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
      };

      send({ type: "hello", at: new Date().toISOString() });

      const boot = await listBalancedLiveEvents({ perSide: 35 });
      lastSeen = new Set(boot.map((e) => e.id));
      send({ type: "snapshot", events: boot });

      const timer = setInterval(async () => {
        try {
          const latest = await listBalancedLiveEvents({ perSide: 35 });
          const fresh = latest.filter((e) => !lastSeen.has(e.id));
          if (fresh.length > 0) {
            for (const event of fresh.reverse()) {
              send({ type: "event", event });
              lastSeen.add(event.id);
            }
            // Bound memory
            if (lastSeen.size > 800) {
              lastSeen = new Set(latest.map((e) => e.id));
            }
          } else {
            send({ type: "ping", at: new Date().toISOString() });
          }
        } catch (err) {
          send({
            type: "error",
            message: err instanceof Error ? err.message : "stream error",
          });
        }
      }, 2000);

      const cancel = () => {
        closed = true;
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          // ignore
        }
      };

      // @ts-expect-error attach for cancel
      controller._cancel = cancel;
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
