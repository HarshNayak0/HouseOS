/** Cream paper card with the kasavu band, used for the account pages. */
export function PaperCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-[10px] border border-brass bg-paper shadow-[0_12px_40px_rgba(59,36,24,0.12)] ${className}`}>
      <div className="kasavu" />
      <div className="p-5">{children}</div>
    </section>
  );
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-[max(24px,env(safe-area-inset-top))]">
      {children}
    </main>
  );
}

export function Brand() {
  return (
    <p className="m-0 mb-4 text-center">
      <b className="font-serif text-3xl font-semibold">Veedu</b>{" "}
      <span lang="ml" className="font-ml text-xl text-ink-2">
        വീട്
      </span>
    </p>
  );
}

export const btnPrimary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-red-oxide px-5 text-sm font-bold text-white shadow-sm active:translate-y-px disabled:opacity-60";
export const btnSecondary =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#d8c6a6] bg-paper px-5 text-sm font-bold text-ink active:translate-y-px disabled:opacity-60";
export const input =
  "min-h-11 w-full rounded-lg border border-[#dccdb2] bg-white px-3 text-[15px] text-ink";
