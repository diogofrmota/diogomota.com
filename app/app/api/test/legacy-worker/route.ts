import { testHooksEnabled } from "@/lib/test-hooks";

/** Isolated production regression fixture: the pre-cleanup worker protocol. */
export function GET() {
  if (!testHooksEnabled()) return new Response("Not found", { status: 404 });
  return new Response(
    'self.addEventListener("install", () => self.skipWaiting()); self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));',
    {
      headers: { "Content-Type": "application/javascript", "Service-Worker-Allowed": "/", "Cache-Control": "no-store" },
    },
  );
}
