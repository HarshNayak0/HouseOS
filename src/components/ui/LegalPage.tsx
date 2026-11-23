import Link from "next/link";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto min-h-dvh max-w-xl px-4 pt-[max(16px,env(safe-area-inset-top))] pb-10">
      <Link href="/" className="inline-flex min-h-11 items-center text-sm font-bold text-teak">
        ← Veedu
      </Link>
      <article className="mt-2 overflow-hidden rounded-[10px] border border-brass bg-paper">
        <div className="kasavu" />
        <div className="p-5 text-[15px] leading-relaxed [&_h2]:mt-6 [&_h2]:mb-1 [&_h2]:font-serif [&_h2]:text-lg [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-2 [&_ul]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
          <h1 className="m-0 font-serif text-[26px] font-semibold">{title}</h1>
          <p className="text-sm text-ink-2">Last updated {updated}</p>
          {children}
        </div>
      </article>
    </main>
  );
}
