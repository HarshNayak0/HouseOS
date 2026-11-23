// Phase 0 holding page. Phase 1 replaces this with the 3D house.
export default function Home() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <section
        aria-labelledby="title"
        className="w-full max-w-sm overflow-hidden rounded-[10px] border border-brass bg-paper shadow-[0_12px_40px_rgba(59,36,24,0.18)]"
      >
        <div className="kasavu" />
        <div className="p-5">
          <h1 id="title" className="font-serif text-3xl font-semibold">
            Veedu <span className="font-ml text-xl font-normal text-ink-2">വീട്</span>
          </h1>
          <p className="mt-2 text-ink-2">
            Harsh and Prerna&apos;s home is being built. The 3D house arrives in phase 1.
          </p>
          <p className="mt-4 text-sm font-bold uppercase tracking-wide text-teak">
            Phase 0 · setup
          </p>
        </div>
      </section>
    </main>
  );
}
