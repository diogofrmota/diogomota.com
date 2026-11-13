import { getSession } from "@/auth";
import { readAvatar } from "@/lib/avatars";

// A user's profile picture, for anyone logged in (they show in the account
// menu, Shared's members and Shows' friends). Its URL has ?v=<when it was set>
// (lib/users.ts, avatarUrlSql), so a new picture is a new URL and each one can
// be kept for good. Without a picture (or such a user): 404.
export async function GET(_request: Request, { params }: RouteContext<"/api/avatars/[id]">) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Please log in again." }, { status: 401 });
  const picture = await readAvatar((await params).id);
  if (!picture)
    return Response.json({ error: "No picture." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(picture), {
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(picture.length),
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
