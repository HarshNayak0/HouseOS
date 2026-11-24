import type { Metadata } from "next";
import Link from "next/link";
import { authEnabled } from "@/lib/supabase/config";
import { AccountSettings, Section } from "./AccountSettings";
import { EveningSetting, MotionSetting, ViewSetting } from "./SettingsView";
import { UsageSettings } from "./UsageSettings";

export const metadata: Metadata = { title: "Settings · Veedu" };

export default function SettingsPage() {
  return (
    <main className="mx-auto min-h-dvh max-w-xl px-4 pt-[max(16px,env(safe-area-inset-top))] pb-10">
      <Link href="/" className="inline-flex min-h-11 items-center text-sm font-bold text-teak">
        ← Back to the house
      </Link>
      <section className="mt-2 overflow-hidden rounded-[10px] border border-brass bg-paper shadow-[0_12px_40px_rgba(59,36,24,0.12)]">
        <div className="kasavu" />
        <div className="p-4">
          <h1 className="m-0 font-serif text-[26px] font-semibold">Settings</h1>
          {authEnabled ? <AccountSettings /> : <p className="mt-3 text-sm text-ink-2">Sign-in isn&apos;t set up yet, so only this device&apos;s settings are shown.</p>}
          <Section title="This device">
            <ViewSetting />
            <div className="mt-4">
              <MotionSetting />
            </div>
            <div className="mt-4">
              <EveningSetting />
            </div>
          </Section>
          {authEnabled && <UsageSettings />}
          <p className="mt-6 text-xs text-ink-2">Version {process.env.NEXT_PUBLIC_BUILD}</p>
        </div>
      </section>
    </main>
  );
}
