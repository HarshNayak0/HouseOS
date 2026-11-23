import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PREFIXES = ["/signin", "/privacy", "/terms", "/auth/", "/invite/", "/api/health", "/manifest.webmanifest", "/sw.js", "/icons/"];

/**
 * Refreshes the Supabase session cookie on each page request and sends signed-out visitors
 * to /signin. Does nothing until Supabase is configured.
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.next();

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // getClaims verifies the JWT locally (no network round trip with asymmetric keys) and refreshes if needed.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  const { pathname, search } = request.nextUrl;
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
  if (!signedIn && !isPublic) {
    const to = request.nextUrl.clone();
    to.pathname = "/signin";
    to.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  // Pages only: skip Next's static files, images and the icon/manifest files.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|icons/|sw.js|manifest.webmanifest|api/health).*)"],
};
