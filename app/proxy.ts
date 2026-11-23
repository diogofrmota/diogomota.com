import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { homeWithNext } from "@/lib/next-path";
import { photoMaxBytes, photoTooBig } from "@/lib/recipe-types";

// Keeps logged-out users out of the apps and account settings: pages redirect
// to home (which offers to log in and come back), API routes answer 401.
// The pages, routes and actions behind it check the session again themselves.
export async function proxy(request: NextRequest) {
  // A recipe photo that is too large (with the form around it) is refused before it is read.
  if (
    /^\/api\/recipes\/[^/]+\/photos$/.test(request.nextUrl.pathname) &&
    Number(request.headers.get("content-length")) > photoMaxBytes + 64 * 1024
  )
    return Response.json({ error: photoTooBig }, { status: 413 });
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
    "/calendar/:path*",
    "/tasks/:path*",
    "/couples/:path*",
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
