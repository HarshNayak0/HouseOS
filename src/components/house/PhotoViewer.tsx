"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Full-screen photo viewer: pinch or double-tap to zoom, drag to look around when zoomed,
 * swipe (or the arrows / arrow keys) for the other photos, Esc or ✕ to close.
 */
export function PhotoViewer({ urls, start, onClose }: { urls: string[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(Math.min(start, urls.length - 1));
  const [z, setZ] = useState({ s: 1, x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const pts = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ d0: number; s0: number; x0: number; y0: number; px: number; py: number; swipe: number } | null>(null);
  const lastTap = useRef(0);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const n = urls.length;
  const go = (d: number) => {
    setI((v) => (v + d + n) % n);
    setZ({ s: 1, x: 0, y: 0 });
  };

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      prev?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- set up once
  }, []);

  const centre = () => {
    const p = [...pts.current.values()];
    return { x: p.reduce((a, q) => a + q.x, 0) / p.length, y: p.reduce((a, q) => a + q.y, 0) / p.length };
  };
  const dist = () => {
    const [a, b] = [...pts.current.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  };
  const begin = () => {
    const c = centre();
    gesture.current = { d0: dist(), s0: z.s, x0: z.x, y0: z.y, px: c.x, py: c.y, swipe: 0 };
  };
  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setDragging(true);
    begin();
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId) || !gesture.current) return;
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const c = centre();
    if (pts.current.size >= 2 && g.d0 > 0) {
      const s = Math.min(5, Math.max(1, (g.s0 * dist()) / g.d0));
      setZ({ s, x: g.x0 + c.x - g.px, y: g.y0 + c.y - g.py });
    } else if (z.s > 1) setZ({ s: z.s, x: g.x0 + c.x - g.px, y: g.y0 + c.y - g.py });
    else g.swipe = c.x - g.px;
  };
  const onUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    pts.current.delete(e.pointerId);
    if (pts.current.size) return begin();
    gesture.current = null;
    setDragging(false);
    if (z.s <= 1.02) setZ({ s: 1, x: 0, y: 0 });
    if (g && z.s <= 1.02 && Math.abs(g.swipe) > 60 && n > 1) return go(g.swipe < 0 ? 1 : -1);
    // double tap: zoom in where you tapped, or back out
    const now = performance.now();
    if (g && Math.abs(g.swipe) < 8 && now - lastTap.current < 300) {
      lastTap.current = 0;
      if (z.s > 1) setZ({ s: 1, x: 0, y: 0 });
      else {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2),
          dy = e.clientY - (r.top + r.height / 2);
        setZ({ s: 2.5, x: -dx * 1.5, y: -dy * 1.5 });
      }
    } else lastTap.current = now;
  };

  // rendered at the top of the page: the room panel's transform would otherwise trap a fixed overlay
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`Photo ${i + 1} of ${n}`} className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,13,9,0.94)]">
      <div
        className="absolute inset-0 flex touch-none items-center justify-center overflow-hidden select-none"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- signed URL to a private photo */}
        <img
          src={urls[i]}
          alt={`Photo ${i + 1} on the living-room wall`}
          draggable={false}
          className="max-h-[88dvh] max-w-[94vw] rounded-md object-contain shadow-[0_10px_40px_rgba(0,0,0,0.5)]"
          style={{ transform: `translate(${z.x}px, ${z.y}px) scale(${z.s})`, transition: dragging ? "none" : "transform 180ms ease-out" }}
        />
      </div>
      <button
        ref={closeBtn}
        type="button"
        onClick={onClose}
        aria-label="Close photo"
        className="absolute top-[max(12px,env(safe-area-inset-top))] right-3 flex h-11 w-11 items-center justify-center rounded-full bg-[rgba(251,248,242,0.92)] text-xl text-[#3b2418]"
      >
        ✕
      </button>
      {n > 1 && (
        <>
          <button type="button" onClick={() => go(-1)} aria-label="Previous photo" className="absolute left-2 flex h-11 w-11 items-center justify-center rounded-full bg-[rgba(251,248,242,0.85)] text-xl text-[#3b2418]">
            ‹
          </button>
          <button type="button" onClick={() => go(1)} aria-label="Next photo" className="absolute right-2 flex h-11 w-11 items-center justify-center rounded-full bg-[rgba(251,248,242,0.85)] text-xl text-[#3b2418]">
            ›
          </button>
          <p className="absolute bottom-[max(14px,env(safe-area-inset-bottom))] m-0 text-sm text-[#fbf8f2]" aria-hidden="true">
            {i + 1} / {n}
          </p>
        </>
      )}
    </div>,
    document.body,
  );
}
