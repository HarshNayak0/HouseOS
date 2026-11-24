import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const sb = await supabaseServer();
  await sb?.auth.signOut();
  // optional ?next=/closet so "sign in again" (vault set-up) comes back to the same room
  const next = request.nextUrl.searchParams.get("next");
  const to = new URL("/signin", request.url);
  if (next && /^\/[a-z]*$/.test(next)) to.searchParams.set("next", next);
  return NextResponse.redirect(to, { status: 303 });
}
