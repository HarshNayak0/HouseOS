"use client";

import { useEffect } from "react";

/** Shown when a page crashes. Includes the error text so problems can be reported precisely. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4">
      <section className="overflow-hidden rounded-[10px] border border-brass bg-paper">
        <div className="kasavu" />
        <div className="p-5">
          <h1 className="m-0 font-serif text-2xl font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-ink-2">Try again. If it keeps happening, send a screenshot of this box.</p>
          <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-[#f3ead9] p-3 text-xs break-words whitespace-pre-wrap">
            {error.name}: {error.message}
            {error.digest ? `\ndigest ${error.digest}` : ""}
            {`\nversion ${process.env.NEXT_PUBLIC_BUILD} · ${typeof location !== "undefined" ? location.pathname : ""}`}
          </pre>
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={reset} className="min-h-11 rounded-full bg-red-oxide px-5 text-sm font-bold text-white">
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full reload on purpose */}
            <a href="/" className="inline-flex min-h-11 items-center rounded-full border border-[#d8c6a6] px-5 text-sm font-bold">
              Home
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
