import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { appsWithNext } from "@/lib/next-path";

// Keeps logged-out users out of the apps and account settings: pages redirect to
// /apps (which offers to log in and come back), API routes answer 401.
// This only reads the session cookie; the pages, routes and actions behind it
// check the session again themselves.
export const proxy = auth((request) => {
  if (request.auth) return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL(appsWithNext(`${pathname}${search}`), request.nextUrl));
});

export const config = {
  matcher: [
    "/shared/:path*",
    "/shows/:path*",
    "/account/:path*",
    "/api/shared/:path*",
    "/api/shows/:path*",
  ],
};
