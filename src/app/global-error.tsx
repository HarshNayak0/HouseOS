"use client";

/** Last-resort error page (when even the root layout fails). Plain HTML, no app styles. */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#F6F1E7", color: "#3B2418", padding: 24 }}>
        <h1 style={{ fontSize: 22 }}>Veedu couldn&apos;t load</h1>
        <p>Reload the page. If it keeps happening, send a screenshot of this.</p>
        <pre style={{ whiteSpace: "pre-wrap", background: "#f3ead9", padding: 12, borderRadius: 8, fontSize: 12 }}>
          {error.name}: {error.message}
          {error.digest ? `\ndigest ${error.digest}` : ""}
          {`\nversion ${process.env.NEXT_PUBLIC_BUILD}`}
        </pre>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- full reload on purpose */}
        <a href="/">Home</a>
      </body>
    </html>
  );
}
