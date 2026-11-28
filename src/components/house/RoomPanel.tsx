"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomId, RoomLabel } from "@/scene/config";
import { RoomContent, prefetchRooms } from "@/panels/RoomContent";
import { useHousehold } from "@/lib/household";
import { authEnabled } from "@/lib/supabase/config";

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
  const drag = useRef<{ y0: number; h0: number; moved: boolean; onGrab: boolean } | null>(null);
  const justDragged = useRef(false);
  if (!room && expanded) setExpanded(false); // a closed sheet reopens at half height

  const fullH = () => (window.visualViewport?.height ?? window.innerHeight) - 16;
  const halfH = () => window.innerHeight * 0.58;
  const onDown = (e: React.PointerEvent) => {
    if (!isPhone() || (e.target as HTMLElement).closest("button:not([data-grab])")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const onGrab = !!(e.target as HTMLElement).closest("[data-grab]");
    drag.current = { y0: e.clientY, h0: asideRef.current?.getBoundingClientRect().height ?? halfH(), moved: false, onGrab };
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
    // Pointer capture retargets the click, so a tap on the grab bar is handled here
    // (the button's own onClick stays for keyboard users).
    justDragged.current = true;
    setTimeout(() => (justDragged.current = false), 300);
    if (!d?.moved || dragH === null) {
      setDragH(null);
      if (d?.onGrab) setExpanded((v) => !v);
      return;
    }
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
  const signedIn = !!data?.me;
  // once signed in and the house has settled, fetch the rooms' code in the background
  useEffect(() => {
    if (!signedIn) return;
    const t = setTimeout(prefetchRooms, 4000);
    return () => clearTimeout(t);
  }, [signedIn]);

  return (
    <aside
      ref={asideRef}
      aria-label={label ? `${label.name} panel` : undefined}
      aria-hidden={!room}
      inert={!room}
      data-open={!!room}
      data-expanded={expanded}
      style={dragH !== null ? { height: dragH, transition: "none" } : undefined}
      className="look-panel fixed z-20 flex flex-col overflow-hidden rounded-[10px] border border-brass bg-paper shadow-[0_12px_40px_rgba(59,36,24,0.28)] transition-[transform,height] duration-[220ms] ease-[cubic-bezier(.2,.8,.2,1)]
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
          <span className="block h-[5px] w-10 rounded-full bg-track" aria-hidden="true" />
        </button>
        {label && (
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
              className="flex h-11 w-11 flex-none items-center justify-center rounded-full border border-line-strong bg-card text-lg text-ink-2"
            >
              ✕
            </button>
          </div>
        )}
      </div>
      {label && shown && (
        <div className="flex-1 overflow-auto px-4 pt-1 pb-5">
          {signedIn ? (
            <RoomContent room={shown} />
          ) : (
            <p className="mt-4 text-sm text-ink-2">
              {authEnabled ? "Sign in to use this room." : "Sign-in isn't set up here, so this is a preview of the house."}
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
