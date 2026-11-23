import type { Metadata } from "next";
import Link from "next/link";
import { GoogleButton } from "@/components/GoogleButton";
import { Brand, PageShell, PaperCard } from "@/components/ui/Card";
import { authEnabled } from "@/lib/supabase/config";

export const metadata: Metadata = { title: "Sign in · Veedu" };

const safeNext = (n: string | undefined) => (n && n.startsWith("/") && !n.startsWith("//") ? n : "/");

export default async function SignInPage({ searchParams }: PageProps<"/signin">) {
  const { next, error } = await searchParams;
  return (
    <PageShell>
      <Brand />
      <PaperCard>
        <h1 className="m-0 font-serif text-2xl font-semibold">Welcome home</h1>
        <p className="mt-2 mb-5 text-sm text-ink-2">Sign in with your Google account to open the house.</p>
        {error && (
          <p role="alert" className="mb-3 text-sm text-urgent">
            Sign-in didn&apos;t complete. Please try again.
          </p>
        )}
        {authEnabled ? (
          <GoogleButton next={safeNext(typeof next === "string" ? next : undefined)} />
        ) : (
          <p className="text-sm text-ink-2">Sign-in isn&apos;t set up yet.</p>
        )}
      </PaperCard>
      <p className="mt-4 text-center text-xs text-ink-2">
        <Link href="/privacy" className="underline">Privacy</Link> · <Link href="/terms" className="underline">Terms</Link>
      </p>
    </PageShell>
  );
}
