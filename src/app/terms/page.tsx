import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/ui/LegalPage";

export const metadata: Metadata = { title: "Terms · Veedu" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service" updated="23 November 2026">
      <p>
        Veedu is a personal, non-commercial app for one household of two people. By signing in you agree to these terms.
      </p>
      <h2>Use</h2>
      <ul>
        <li>Access is by invitation only. Please don&apos;t share your invite link or account.</li>
        <li>You&apos;re responsible for what you add, and for keeping your Google account secure.</li>
      </ul>
      <h2>No warranty</h2>
      <p>
        The app is provided as is, without any guarantee that it will always be available or error-free. Keep important
        information (for example in the home info vault) backed up somewhere else too.
      </p>
      <h2>Ending</h2>
      <p>You can leave the household and stop using the app at any time from Settings. The app may be shut down at any time.</p>
      <p>
        See also the <Link href="/privacy" className="font-bold text-teak underline">privacy policy</Link>.
      </p>
    </LegalPage>
  );
}
