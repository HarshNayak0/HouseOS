import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** Google → Supabase → here: swap the one-time code for a session cookie, then continue. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const nextParam = searchParams.get("next") ?? "/";
  const next = nextParam.startsWith("/") && !nextParam.startsWith("//") ? nextParam : "/";
  const sb = await supabaseServer();
  if (code && sb) {
    const { error } = await sb.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
  }
  return NextResponse.redirect(`${origin}/signin?error=1`);
}
