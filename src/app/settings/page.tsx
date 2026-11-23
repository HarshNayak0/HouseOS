import type { Metadata } from "next";
import Link from "next/link";
import { authEnabled } from "@/lib/supabase/config";
import { AccountSettings, Section } from "./AccountSettings";
import { MotionSetting, ViewSetting } from "./SettingsView";

export const metadata: Metadata = { title: "Settings · Veedu" };

const LATER = [["Evening mode: automatic at Toronto sunset", 8]] as const;

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
          </Section>
          <Section title="Coming later">
            <ul className="m-0 list-none p-0">
              {LATER.map(([label, phase]) => (
                <li key={label} className="flex justify-between gap-3 border-b border-dashed border-[#e6d9c2] py-2 text-sm last:border-b-0">
                  <span>{label}</span>
                  <span className="flex-none text-ink-2">phase {phase}</span>
                </li>
              ))}
            </ul>
          </Section>
          <p className="mt-6 text-xs text-ink-2">Version {process.env.NEXT_PUBLIC_BUILD}</p>
        </div>
      </section>
    </main>
  );
}
