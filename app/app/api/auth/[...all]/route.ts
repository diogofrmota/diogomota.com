import { toNextJsHandler } from "better-auth/next-js";
import { auth } from "@/auth";
import { grantSessionTransition } from "@/lib/session-transition";

// Better Auth's endpoints (auth.ts): the links in its emails (confirming an email)
// and reading or ending the session. The site's forms call it from server actions.
const handlers = toNextJsHandler(auth);
export const POST = handlers.POST;

export async function GET(request: Request) {
  const response = await handlers.GET(request);
  // Verification may automatically establish a different user's session.
  // Apply the same awaited document cleanup as an explicit successful login.
  const location = response.headers.get("location");
  if (
    new URL(request.url).pathname === "/api/auth/verify-email" &&
    location &&
    response.status >= 300 &&
    response.status < 400
  ) {
    const destination = new URL(location, request.url);
    const origin = new URL(process.env.AUTH_URL ?? request.url).origin;
    if (destination.origin === origin && destination.pathname !== "/session-transition") {
      const headers = new Headers(response.headers);
      headers.set(
        "location",
        new URL(await grantSessionTransition(`${destination.pathname}${destination.search}`, true), origin).href,
      );
      return new Response(response.body, { status: response.status, headers });
    }
  }
  return response;
}
