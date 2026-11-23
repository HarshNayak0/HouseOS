import type { Metadata } from "next";
import { createClient } from "@supabase/supabase-js";
import { GoogleButton } from "@/components/GoogleButton";
import { Brand, PageShell, PaperCard } from "@/components/ui/Card";
import { inviteTokenSchema } from "@/lib/schemas";
import { SUPABASE_ANON_KEY, SUPABASE_URL, authEnabled } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "You're invited · Veedu", robots: { index: false } };

async function lookup(token: string) {
  if (!authEnabled || !inviteTokenSchema.safeParse(token).success) return null;
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data } = await sb.rpc("invite_info", { p_token: token });
  return (data as { inviter_name: string; household_name: string }[] | null)?.[0] ?? null;
}

export default async function InvitePage({ params }: PageProps<"/invite/[token]">) {
  const { token } = await params;
  const info = await lookup(token);
  return (
    <PageShell>
      <Brand />
      <PaperCard>
        {info ? (
          <>
            <h1 className="m-0 font-serif text-2xl font-semibold">{info.inviter_name} invited you home</h1>
            <p className="mt-2 mb-5 text-sm text-ink-2">
              Veedu is a shared home for the two of you: shopping, chores, calendars, date ideas and trips, all in one Kerala
              house. Sign in with Google to move in.
            </p>
            <GoogleButton next={`/onboarding?invite=${token}`} label="Accept with Google" />
            <p className="mt-3 text-xs text-ink-2">This link works once and expires 48 hours after it was made.</p>
          </>
        ) : (
          <>
            <h1 className="m-0 font-serif text-2xl font-semibold">This invite has expired</h1>
            <p className="mt-2 text-sm text-ink-2">
              Invite links work once and only for 48 hours. Ask for a new one from Settings → Household.
            </p>
          </>
        )}
      </PaperCard>
    </PageShell>
  );
}
