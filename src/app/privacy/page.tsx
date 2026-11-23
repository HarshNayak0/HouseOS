import type { Metadata } from "next";
import { LegalPage } from "@/components/ui/LegalPage";

export const metadata: Metadata = { title: "Privacy · Veedu" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy" updated="23 November 2026">
      <p>
        Veedu is a private household app used by two people. It is not offered to the public, has no ads and never sells or
        shares your data.
      </p>
      <h2>What we collect</h2>
      <ul>
        <li>From Google sign-in: your name, email address and Google account ID. Nothing else from your Google account.</li>
        <li>What you add to the app: names, colours, lists, notes, settings and similar household information.</li>
        <li>If you turn on notifications: a push address for your device, so the app can send you reminders.</li>
      </ul>
      <h2>Where it is stored</h2>
      <p>
        Data is stored with Supabase (database and sign-in) and the app is hosted on Vercel. Only the two members of a
        household can see that household&apos;s data; this is enforced by the database itself.
      </p>
      <h2>Google user data</h2>
      <p>
        Information received from Google is used only to sign you in and show your name in the app. It is not used for
        advertising, not sold, and not transferred to anyone else. If calendar access is added later, calendar data will only
        be shown to the two household members and will never be sent to an AI provider.
      </p>
      <h2>AI features</h2>
      <p>
        Only recipe content you choose to import (a recipe caption, video or web page) may be sent to an AI service to turn
        it into a recipe card. Notes, calendar data and the home info vault are never sent to an AI provider.
      </p>
      <h2>Your choices</h2>
      <ul>
        <li>Download everything: Settings → Your data → Export.</li>
        <li>Delete your membership: Settings → Household → Leave. If you are the last member, the household and its data are deleted.</li>
        <li>Turn notifications off at any time in Settings.</li>
      </ul>
      <h2>Contact</h2>
      <p>Questions about this policy can go to the household member who invited you.</p>
    </LegalPage>
  );
}
