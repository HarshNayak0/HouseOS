"use client";

import { useEffect, useRef, useState } from "react";
import type { RoomId, RoomLabel } from "@/scene/config";
import { PLACEHOLDERS } from "@/panels/placeholders";
import { RoomContent, hasRealContent } from "@/panels/RoomContent";
import { useHousehold } from "@/lib/household";

/**
 * The 2D panel for a room. Desktop: right-hand panel. Mobile (≤720 px): bottom sheet at ~58% height.
 * Matches the prototype: cream paper, brass border, kasavu band.
 */
export function RoomPanel({ room, onClose, labels }: { room: RoomId | null; onClose: () => void; labels: Record<RoomId, RoomLabel> }) {
  // Keep showing the last room while the panel slides closed.
  const [shown, setShown] = useState<RoomId | null>(room);
  if (room && room !== shown) setShown(room);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (room) headingRef.current?.focus({ preventScroll: true });
  }, [room]);

  const label = shown ? labels[shown] : null;
  const { data } = useHousehold();
  const real = !!shown && !!data?.me && hasRealContent(shown);
  const ph = shown ? PLACEHOLDERS[shown] : null;

  return (
    <aside
      aria-label={label ? `${label.name} panel` : undefined}
      aria-hidden={!room}
      inert={!room}
      data-open={!!room}
      className="fixed z-20 flex flex-col overflow-hidden rounded-[10px] border border-brass bg-paper shadow-[0_12px_40px_rgba(59,36,24,0.28)] transition-transform duration-[220ms] ease-[cubic-bezier(.2,.8,.2,1)]
        inset-x-2 bottom-2 h-[58dvh] translate-y-[112%] data-[open=true]:translate-y-0
        min-[721px]:inset-x-auto min-[721px]:right-4 min-[721px]:top-[74px] min-[721px]:bottom-4 min-[721px]:h-auto min-[721px]:w-[370px] min-[721px]:translate-y-0 min-[721px]:translate-x-[430px] min-[721px]:data-[open=true]:translate-x-0"
    >
      <div className="kasavu" />
      {label && ph && (
        <>
          <div className="flex flex-none items-start justify-between px-4 pt-3.5 pb-1">
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
