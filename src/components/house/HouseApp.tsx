"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { HouseController } from "@/scene/camera/controller";
import { ROOM_IDS, isRoomId, roomPath, type RoomId } from "@/scene/config";
import { useHousehold, useRoomLabels } from "@/lib/household";
import { authEnabled } from "@/lib/supabase/config";
import { useIndicatorState } from "@/lib/lists/indicators";
import { useNow } from "@/lib/lists/useNow";
import { isEvening } from "@/lib/sun";
import { lookOverride } from "@/lib/look";
import {
  chooseView,
  effectiveReducedMotion,
  hasWebGL,
  readViewPref,
  writeViewPref,
  type ViewPref,
  readEveningPref,
  resolveEvening,
  type EveningPref,
} from "@/lib/view-pref";
import { FloorPlan } from "./FloorPlan";
import { PhotoViewer } from "./PhotoViewer";
import { AmbienceController } from "./Ambience";
import { jasmineWords, useHomeyState } from "@/lib/homey";
import { QuickAdd } from "./QuickAdd";
import { RoomPanel } from "./RoomPanel";

const HouseCanvas = dynamic(() => import("@/scene/HouseCanvas"), { ssr: false });

const SLOW_FPS = 28;

function roomFromPath(pathname: string | null): RoomId | null {
  const seg = pathname?.split("/").filter(Boolean)[0];
  return isRoomId(seg) ? seg : null;
}

export function HouseApp() {
  const pathname = usePathname();
  const router = useRouter();
  const room = roomFromPath(pathname);
  const labels = useRoomLabels();
  const household = useHousehold();

  // Signed in but not in a household yet → onboarding.
  useEffect(() => {
    if (authEnabled && household.data && !household.data.me) router.replace("/onboarding");
  }, [household.data, router]);

  const [view, setView] = useState<ViewPref | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 1, label: "Loading the 3D engine…" });
  const [ctrl, setCtrl] = useState<HouseController | null>(null);
  const [mode, setMode] = useState<"outside" | "inside">(room ? "inside" : "outside");
  const [moved, setMoved] = useState(false);
  const [closeUp, setCloseUp] = useState(false);
  const [eveningPref, setEveningPref] = useState<EveningPref>("auto");
  const [eveningOverride, setEveningOverride] = useState<{ value: boolean; auto: boolean } | null>(null);
  const nowMs = useNow();
  const autoEvening = isEvening(new Date(nowMs));
  const evening = resolveEvening(eveningPref, autoEvening, eveningOverride);
  const [slowPrompt, setSlowPrompt] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [initialRoom] = useState(room);

  // Pick 3D or 2D once on the client (needs window).
  useEffect(() => {
    const rm = effectiveReducedMotion();
    const { view: v } = chooseView({ pref: readViewPref(), webgl: hasWebGL(), reducedMotion: rm });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time client-only detection
    setReducedMotion(rm);
    setView(v);
    setEveningPref(readEveningPref());
  }, []);

  // Room changes use the History API directly: the camera starts flying immediately and no
  // server round trip is needed (Next.js keeps usePathname in sync with pushState).
  const goRoom = useCallback(
    (id: RoomId) => {
      ctrl?.select(id);
      if (window.location.pathname !== roomPath(id)) window.history.pushState(null, "", roomPath(id));
    },
    [ctrl],
  );
  const closePanel = useCallback(() => {
    ctrl?.clearSelection();
    if (window.location.pathname !== "/") window.history.pushState(null, "", "/");
  }, [ctrl]);
  const onRoomLink = (id: RoomId) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; // let "open in new tab" work
    e.preventDefault();
    goRoom(id);
  };

  // Nameplate, chappals, wall photos, festivals and the jasmine.
  const homey = useHomeyState();
  const homeyKey = JSON.stringify(homey);
  useEffect(() => {
    if (ctrl && homey) ctrl.setHomey(homey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the values change
  }, [ctrl, homeyKey]);
  // a chore or task done: a shimmer through the jasmine
  useEffect(() => {
    if (!ctrl) return;
    const on = (e: Event) => {
      const k = (e as CustomEvent).detail;
      if (k === "chore" || k === "task") ctrl.model.homey.shimmer();
    };
    window.addEventListener("veedu:moment", on);
    return () => window.removeEventListener("veedu:moment", on);
  }, [ctrl]);
  const shownPhotos = (homey?.photos ?? []).filter((u): u is string => !!u);
  const [viewing, setViewing] = useState<number | null>(null);
  const photosRef = useRef(homey?.photos ?? []);
  useEffect(() => {
    photosRef.current = homey?.photos ?? [];
  });

  // Controller callbacks
  useEffect(() => {
    if (!ctrl) return;
    ctrl.setHandlers({
      onTapRoom: goRoom,
      onTapOutside: () => ctrl.goInside(),
      onModeChange: setMode,
      onMovedChange: setMoved,
      onCloseUpChange: setCloseUp,
      // a framed photo: open it (an empty frame opens the living room, where photos are chosen)
      onTapPhoto: (i) => {
        const list = photosRef.current;
        if (!list[i]) return goRoom("living");
        setViewing(list.slice(0, i).filter(Boolean).length);
      },
    });
  }, [ctrl, goRoom]);

  // In-scene indicators follow the real lists (fridge badge, laundry heap, nilavilakku).
  const indicators = useIndicatorState();
  const indicatorKey = JSON.stringify(indicators);
  useEffect(() => {
    ctrl?.setIndicators(indicators);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the values change
  }, [ctrl, indicatorKey]);

  // The URL is the source of truth for the selected room.
  useEffect(() => {
    if (!ctrl) return;
    if (room) ctrl.select(room);
    else ctrl.clearSelection();
  }, [ctrl, room]);

  useEffect(() => {
    ctrl?.setEvening(evening);
  }, [ctrl, evening]);
  // the panels' look follows the header button too (and lets go when the override lapses)
  const lookOv = eveningOverride && (eveningPref !== "auto" || eveningOverride.auto === autoEvening) ? eveningOverride.value : null;
  useEffect(() => {
    lookOverride.set(lookOv);
  }, [lookOv]);
  useEffect(() => () => lookOverride.set(null), []);

  // Re-aim the camera when the window is resized or the phone rotates.
  useEffect(() => {
    if (!ctrl) return;
    let t: ReturnType<typeof setTimeout>;
    const onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => ctrl.reframe(), 200);
    };
    window.addEventListener("resize", onResize);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, [ctrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && room) closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [room, closePanel]);

  const toggleMode = () => {
    if (!ctrl) return;
    if (mode === "outside") ctrl.goInside();
    else {
      ctrl.goOutside();
      if (room) closePanel();
    }
  };

  const switchView = (v: ViewPref) => {
    writeViewPref(v);
    setSlowPrompt(false);
    setCtrl(null);
    setView(v);
  };

  const ready = view === "2d" || !!ctrl;
  const inside = view === "2d" || mode === "inside";
  const hint = !ready || room || moved || closeUp ? null : inside ? "Tap a room to open it" : "Drag to turn · two fingers to move and zoom · tap the house to step inside";

  return (
    <div className="fixed inset-0 overflow-hidden bg-backdrop">
      {view === "3d" && !loadError && (
        <HouseCanvas
          initialRoom={initialRoom}
          reducedMotion={reducedMotion}
          onProgress={(done, total, label) => setProgress({ done, total, label })}
          onReady={(c) => {
            setCtrl(c);
            setMode(c.mode);
          }}
          onFps={(fps) => {
            if (fps < SLOW_FPS && !readViewPref()) setSlowPrompt(true);
          }}
          onError={() => {
            setLoadError(true);
            setView("2d");
          }}
        />
      )}
      {view === "2d" && <FloorPlan selected={room} onRoomLink={onRoomLink} labels={labels} />}

      {/* Floating room labels (3D, inside view). Positions are written by the controller each frame. */}
      {view === "3d" && ctrl && (
        <div className="pointer-events-none fixed inset-0 z-[3]" aria-hidden={mode !== "inside" || !!room}>
          {ROOM_IDS.map((id) => {
            const l = labels[id];
            return (
              <Link
                key={id}
                href={roomPath(id)}
                scroll={false}
                ref={(el) => ctrl.registerLabel(id, el)}
                onClick={onRoomLink(id)}
                style={{ opacity: 0 }}
                className="absolute top-0 left-0 cursor-pointer rounded-full border border-brass bg-paper/95 px-[11px] pt-1 pb-[3px] text-center text-[12.5px] leading-[1.15] font-bold whitespace-nowrap text-ink shadow-[0_2px_8px_rgba(59,36,24,0.15)] transition-opacity duration-300 hover:bg-card-warm"
              >
                {l.name}
                {l.ml && (
                  <small lang="ml" className="block font-ml text-[11px] font-normal text-ink-2">
                    {l.ml}
                  </small>
                )}
              </Link>
            );
          })}
        </div>
      )}

      {/* The jasmine: a small marker on the verandah outside; tap it for a close look */}
      {view === "3d" && ctrl && (
        <div className="pointer-events-none fixed inset-0 z-[3]">
          <button
            type="button"
            ref={(el) => ctrl.registerJasmineLabel(el)}
            onClick={() => ctrl.viewJasmine()}
            style={{ opacity: 0 }}
            aria-label="Look at the jasmine up close"
            title="The jasmine"
            className="absolute top-0 left-0 flex h-11 w-11 items-center justify-center transition-opacity duration-300"
          >
            <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center rounded-full border border-brass bg-paper/85 text-[13px] leading-none shadow-[0_1px_5px_rgba(59,36,24,0.2)]">
              🌼
            </span>
          </button>
        </div>
      )}
      {closeUp && homey && (
        <section
          aria-label="The jasmine on the verandah"
          className="fixed inset-x-3 bottom-[max(20px,calc(env(safe-area-inset-bottom)+12px))] z-20 mx-auto max-w-sm rounded-[10px] min-[721px]:right-6 min-[721px]:left-auto min-[721px]:w-[360px] border border-brass bg-paper p-3.5 shadow-[0_8px_30px_rgba(59,36,24,0.25)]"
        >
          <h2 className="m-0 font-serif text-lg font-semibold">🌼 The jasmine on the verandah</h2>
          <p className="m-0 mt-1 text-sm">
            It&apos;s {jasmineWords(homey.jasmine).stage}, and {jasmineWords(homey.jasmine).flowers}.
          </p>
          <p className="m-0 mt-1 text-xs text-ink-2">
            {homey.jasmine.thisWeek} {homey.jasmine.thisWeek === 1 ? "thing" : "things"} done together this week · {homey.jasmine.total} in all. Chores, tasks and dates help it grow, and
            a busy week covers it in flowers. It never wilts.
          </p>
          <div className="mt-2.5 flex gap-2">
            <button type="button" className="min-h-11 rounded-lg bg-red-oxide px-3 text-sm font-bold text-white" onClick={() => ctrl?.recentre()}>
              Back to the house
            </button>
            <button type="button" className="min-h-11 px-2 text-sm font-bold text-teak underline" onClick={() => ctrl?.endCloseUp()}>
              Keep looking
            </button>
          </div>
        </section>
      )}

      {/* Rooms list for keyboard and screen-reader users in 3D mode */}
      {view === "3d" && (
        <nav aria-label="Rooms" className="sr-only focus-within:not-sr-only focus-within:fixed focus-within:bottom-16 focus-within:left-1/2 focus-within:z-30 focus-within:-translate-x-1/2 focus-within:rounded-lg focus-within:border focus-within:border-brass focus-within:bg-paper focus-within:p-2">
          <ul className="flex flex-wrap gap-2">
            {ROOM_IDS.map((id) => (
              <li key={id}>
                <Link href={roomPath(id)} scroll={false} onClick={onRoomLink(id)} className="block rounded-full px-3 py-2 text-sm font-bold">
                  {labels[id].name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <header className="pointer-events-none fixed inset-x-0 top-0 z-10 flex flex-wrap items-center justify-between gap-2 px-3.5 pt-[max(12px,env(safe-area-inset-top))] pb-3">
        <Link
          href="/"
          scroll={false}
          className="pointer-events-auto flex items-baseline gap-2 rounded-[10px] border border-brass bg-paper px-3 pt-[5px] pb-1.5 shadow-[0_2px_10px_rgba(59,36,24,0.12)]"
        >
          <b className="font-serif text-xl font-semibold">Veedu</b>
          <span lang="ml" className="font-ml text-[15px] text-ink-2">
            വീട്
          </span>
        </Link>
        <div className="pointer-events-auto flex gap-2">
          {view === "3d" && (
            <>
              {mode === "outside" && moved && (
                <HeaderButton onClick={() => ctrl?.recentre()} disabled={!ctrl}>
                  Recentre
                </HeaderButton>
              )}
              <HeaderButton primary={mode === "outside"} onClick={toggleMode} disabled={!ctrl}>
                {mode === "outside" ? "Step inside" : "View outside"}
              </HeaderButton>
              <HeaderButton onClick={() => setEveningOverride({ value: !evening, auto: autoEvening })} disabled={!ctrl} aria-pressed={evening}>
                {evening ? "Daytime" : "Evening"}
              </HeaderButton>
            </>
          )}
          <Link
            href="/settings"
            aria-label="Settings"
            className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-line-strong bg-paper text-ink shadow-[0_2px_8px_rgba(59,36,24,0.1)]"
          >
            <GearIcon />
          </Link>
        </div>
      </header>

      {hint && (
        <div
          role="status"
          className="pointer-events-none fixed bottom-5 left-1/2 z-[4] -translate-x-1/2 rounded-full bg-[rgba(59,36,24,0.84)] px-4 py-2 text-[13px] whitespace-nowrap text-[#fbf8f2] max-[720px]:bottom-[max(24px,calc(env(safe-area-inset-bottom)+16px))] max-[720px]:left-3 max-[720px]:max-w-[calc(100%-96px)] max-[720px]:translate-x-0 max-[720px]:rounded-2xl max-[720px]:whitespace-normal"
        >
          {hint}
        </div>
      )}

      {slowPrompt && (
        <div role="alertdialog" aria-labelledby="slow-title" className="fixed inset-x-3 bottom-16 z-30 mx-auto max-w-sm rounded-[10px] border border-brass bg-paper p-4 shadow-lg">
          <p id="slow-title" className="m-0 text-sm">
            The 3D house is running slowly on this device. Switch to the 2D map? You can change this any time.
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="min-h-11 rounded-lg px-3 text-sm font-bold text-ink-2" onClick={() => { writeViewPref("3d"); setSlowPrompt(false); }}>
              Keep 3D
            </button>
            <button type="button" className="min-h-11 rounded-lg bg-red-oxide px-3 text-sm font-bold text-white" onClick={() => switchView("2d")}>
              Use 2D map
            </button>
          </div>
        </div>
      )}

      <AmbienceController />
      <RoomPanel room={room} onClose={closePanel} labels={labels} />
      {viewing !== null && shownPhotos.length > 0 && <PhotoViewer urls={shownPhotos} start={viewing} onClose={() => setViewing(null)} />}
      {household.data?.me && !room && <QuickAdd />}

      {view !== "2d" && !ctrl && !loadError && <LoadingScreen {...progress} />}
    </div>
  );
}

function LoadingScreen({ done, total, label }: { done: number; total: number; label: string }) {
  const pct = Math.round((done / total) * 100);
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-backdrop px-6">
      <p className="m-0 font-serif text-xl text-teak">Building the tharavad…</p>
      <div
        role="progressbar"
        aria-label="Loading the house"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-2 w-64 max-w-full overflow-hidden rounded-full bg-track"
      >
        <div className="h-full bg-brass transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
      <p className="m-0 text-sm text-ink-2" aria-live="polite">
        {label} {pct}%
      </p>
    </div>
  );
}

function HeaderButton({
  primary,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={`min-h-[38px] cursor-pointer rounded-full border px-[13px] py-2 text-[13.5px] font-bold shadow-[0_2px_8px_rgba(59,36,24,0.1)] active:translate-y-px disabled:opacity-60 ${
        primary ? "border-red-oxide bg-red-oxide text-white" : "border-line-strong bg-paper text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}
