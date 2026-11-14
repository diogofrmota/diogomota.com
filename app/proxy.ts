import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { homeWithNext } from "@/lib/next-path";

// Keeps logged-out users out of the apps and account settings: pages redirect
// to home (which offers to log in and come back), API routes answer 401.
// The pages, routes and actions behind it check the session again themselves.
export async function proxy(request: NextRequest) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (session) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL(homeWithNext(`${pathname}${search}`), request.nextUrl));
}

export const config = {
  matcher: ["/shared/:path*", "/shows/:path*", "/account/:path*", "/api/shared/:path*", "/api/shows/:path*"],
};
