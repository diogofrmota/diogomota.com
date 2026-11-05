import { auth } from "@/auth";
import { normalizeUsername, usernameError } from "@/lib/account-rules";
import { usernameCheckLimit } from "@/lib/rate-limit";
import { usernameAvailable } from "@/lib/users";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  const session = await auth();
  if (!session) return Response.json({ error: "Please log in again." }, { status: 401, headers });

  const username = normalizeUsername(new URL(request.url).searchParams.get("username"));
  const error = usernameError(username);
  if (error) return Response.json({ error }, { status: 400, headers });
  if (!usernameCheckLimit(session.user.id)) {
    return Response.json({ error: "Too many checks. Wait a minute and try again." }, { status: 429, headers });
  }

  return Response.json({ data: { available: await usernameAvailable(session.user.id, username) } }, { headers });
}
