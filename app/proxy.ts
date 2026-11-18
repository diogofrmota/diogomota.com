import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { homeWithNext } from "@/lib/next-path";

// Keeps logged-out users out of the apps and account settings: pages redirect
// to home (which offers to log in and come back), API routes answer 401.
// The pages, routes and actions behind it check the session again themselves.
export async function proxy(request: NextRequest) {
  if (
    /^\/api\/recipes\/[^/]+\/photos$/.test(request.nextUrl.pathname) &&
    Number(request.headers.get("content-length")) > 20 * 1024 * 1024 + 64 * 1024
  )
    return Response.json({ error: "That photo is over 20 MB. Try a smaller one." }, { status: 413 });
  const session = await auth.api.getSession({ headers: request.headers });
  if (session) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL(homeWithNext(`${pathname}${search}`), request.nextUrl));
}

export const config = {
  matcher: [
    "/books/:path*",
    "/api/books/:path*",
    "/shared/:path*",
    "/shows/:path*",
    "/api/social/:path*",
    "/recipes/:path*",
    "/fitness/:path*",
    "/account/:path*",
    "/api/shared/:path*",
    "/api/shows/:path*",
    "/api/recipes/:path*",
    "/api/fitness/:path*",
  ],
};
