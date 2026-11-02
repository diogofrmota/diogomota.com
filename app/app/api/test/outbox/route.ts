import { testOutbox } from "@/lib/email";
import { testHooksEnabled } from "@/lib/test-hooks";

export const dynamic = "force-dynamic";

// For the e2e tests: the emails the app would have sent, oldest first, to the
// address in ?to= (any case) or to anyone. Not found unless test hooks are on,
// so never in production.
export function GET(request: Request) {
  if (!testHooksEnabled()) return Response.json({ error: "Not found" }, { status: 404 });

  const to = new URL(request.url).searchParams.get("to")?.toLowerCase();
  const emails = to ? testOutbox.filter((email) => email.to.toLowerCase() === to) : testOutbox;
  return Response.json({ emails });
}
