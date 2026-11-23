import type { Metadata } from "next";
import Link from "next/link";
import { ViewSetting } from "./SettingsView";

export const metadata: Metadata = { title: "Settings · Veedu" };

const LATER = [
  ["Names and person colours", 2],
  ["Invite Prerna / leave the household", 2],
  ["Notifications and quiet hours", 2],
  ["Room label text", 2],
  ["Connected Google calendars", 4],
  ["Milestones", 4],
  ["Evening mode: automatic at Toronto sunset", 8],
  ["Export all data (JSON)", 2],
  ["Sign out", 2],
] as const;

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
          <div className="mt-4">
            <ViewSetting />
          </div>
          <h2 className="mt-6 mb-1.5 text-[11.5px] font-bold tracking-[0.09em] text-ink-2 uppercase">Coming later</h2>
          <ul className="m-0 list-none p-0">
            {LATER.map(([label, phase]) => (
              <li key={label} className="flex justify-between gap-3 border-b border-dashed border-[#e6d9c2] py-2 text-sm last:border-b-0">
                <span>{label}</span>
                <span className="flex-none text-ink-2">phase {phase}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
