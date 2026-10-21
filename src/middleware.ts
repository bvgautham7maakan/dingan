import { NextResponse, type NextRequest } from "next/server";
import { PUBLIC_PATHS, SESSION_COOKIE, SESSION_MAX_AGE_S } from "@/lib/auth/constants";

// Cheap edge gate: only checks that a session cookie exists and refreshes its max-age
// (sliding 90 days). Real validation (revoked / expired / inactive) runs on the server
// for every page and API call.
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!token && !isPublic) {
    if (pathname.startsWith("/api/"))
      return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const res = NextResponse.next();
  if (token) {
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
      path: "/",
      maxAge: SESSION_MAX_AGE_S,
    });
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons/|logo.png|robots.txt).*)"],
};
