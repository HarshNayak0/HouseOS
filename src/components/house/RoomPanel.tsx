"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomId, RoomLabel } from "@/scene/config";
import { PLACEHOLDERS } from "@/panels/placeholders";
import { RoomContent, hasRealContent } from "@/panels/RoomContent";
import { useHousehold } from "@/lib/household";

/**
 * The 2D panel for a room. Desktop: right-hand panel. Mobile (≤720 px): bottom sheet at ~58% height
 * that can be dragged up to full screen (or down to close) by its top bar; tapping the grab bar toggles.
 * Matches the prototype: cream paper, brass border, kasavu band.
 */
const isPhone = () => typeof window !== "undefined" && window.innerWidth <= 720;
export function RoomPanel({ room, onClose, labels }: { room: RoomId | null; onClose: () => void; labels: Record<RoomId, RoomLabel> }) {
  // Keep showing the last room while the panel slides closed.
  const [shown, setShown] = useState<RoomId | null>(room);
  if (room && room !== shown) setShown(room);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [dragH, setDragH] = useState<number | null>(null);
  const drag = useRef<{ y0: number; h0: number; moved: boolean } | null>(null);
  const justDragged = useRef(false);
  if (!room && expanded) setExpanded(false); // a closed sheet reopens at half height

  const fullH = () => (window.visualViewport?.height ?? window.innerHeight) - 16;
  const halfH = () => window.innerHeight * 0.58;
  const onDown = (e: React.PointerEvent) => {
    if (!isPhone() || (e.target as HTMLElement).closest("button:not([data-grab])")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { y0: e.clientY, h0: asideRef.current?.getBoundingClientRect().height ?? halfH(), moved: false };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y0;
    if (Math.abs(dy) > 6) d.moved = true;
    if (d.moved) setDragH(Math.max(80, Math.min(fullH(), d.h0 - dy)));
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved || dragH === null) return setDragH(null);
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 0);
    const h = dragH;
    setDragH(null);
    if (h < halfH() * 0.55) onClose();
    else setExpanded(h > (halfH() + fullH()) / 2);
  };

  useEffect(() => {
    if (room) headingRef.current?.focus({ preventScroll: true });
  }, [room]);

  const label = shown ? labels[shown] : null;
  const { data } = useHousehold();
  const real = !!shown && !!data?.me && hasRealContent(shown);
  const ph = shown ? PLACEHOLDERS[shown] : null;

  return (
    <aside
      ref={asideRef}
      aria-label={label ? `${label.name} panel` : undefined}
      aria-hidden={!room}
      inert={!room}
      data-open={!!room}
      data-expanded={expanded}
      style={dragH !== null ? { height: dragH, transition: "none" } : undefined}
      className="fixed z-20 flex flex-col overflow-hidden rounded-[10px] border border-brass bg-paper shadow-[0_12px_40px_rgba(59,36,24,0.28)] transition-[transform,height] duration-[220ms] ease-[cubic-bezier(.2,.8,.2,1)]
        inset-x-2 bottom-2 h-[58dvh] translate-y-[112%] data-[open=true]:translate-y-0 data-[expanded=true]:h-[calc(100dvh-16px)]
        min-[721px]:inset-x-auto min-[721px]:right-4 min-[721px]:top-[74px] min-[721px]:bottom-4 min-[721px]:h-auto min-[721px]:w-[370px] min-[721px]:translate-y-0 min-[721px]:translate-x-[430px] min-[721px]:data-[open=true]:translate-x-0"
    >
      <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} className="flex-none max-[720px]:touch-none">
        <div className="kasavu" />
        <button
          type="button"
          data-grab
          aria-label={expanded ? "Make the panel smaller" : "Expand the panel to full screen"}
          aria-expanded={expanded}
          onClick={() => !justDragged.current && setExpanded((v) => !v)}
          className="flex h-6 w-full cursor-grab items-center justify-center min-[721px]:hidden"
        >
          <span className="block h-[5px] w-10 rounded-full bg-[#d8c6a6]" aria-hidden="true" />
        </button>
        {label && ph && (
          <div className="flex items-start justify-between px-4 pt-1 pb-1 min-[721px]:pt-3.5">
            <div>
              <h2 ref={headingRef} tabIndex={-1} className="m-0 font-serif text-[23px] leading-tight font-semibold outline-none focus-visible:outline-none">
                {label.name}
              </h2>
              {label.ml && <div lang="ml" className="mt-0.5 font-ml text-sm text-ink-2">{label.ml}</div>}
              <div className="mt-1 text-xs font-bold tracking-wider text-teak uppercase">{label.feature}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close panel"
              className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-[#e0d2b8] bg-white text-lg text-ink-2"
            >
              ✕
            </button>
          </div>
        )}
      </div>
      {label && ph && (
        <>
          <div className="flex-1 overflow-auto px-4 pt-1 pb-5">
            {real && shown ? (
              <RoomContent room={shown} />
            ) : (
              <>
                <div className="mt-4">
                  <h3 className="mb-1.5 text-[11.5px] font-bold tracking-[0.09em] text-ink-2 uppercase">Coming in phase {ph.phase}</h3>
                  <ul className="m-0 list-none p-0">
                    {ph.items.map((it) => (
                      <li key={it} className="border-b border-dashed border-[#e6d9c2] py-2 text-sm last:border-b-0">
                        {it}
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="mt-4 border-t border-[#eadfcb] pt-2.5 text-[11.5px] text-ink-2 italic">
                  This room is a placeholder. Nothing here is saved yet.
                </p>
              </>
            )}
          </div>
        </>
      )}
    </aside>
  );
}
