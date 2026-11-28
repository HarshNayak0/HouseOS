"use client";

import { useEffect, useState } from "react";
import { disablePush, enablePush, getPushStatus, type PushStatus } from "@/lib/push";
import { btnPrimary, btnSecondary } from "@/components/ui/Card";

const GUIDE_KEY = "veedu.iosGuideSeen";

/** Enable notifications on this device, with the iPhone "Add to Home Screen" guide. */
export function PushSetup({ householdId, memberId, showTest = false }: { householdId: string; memberId: string; showTest?: boolean }) {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    getPushStatus().then(setStatus);
  }, []);

  const enable = async () => {
    setBusy(true);
    setMsg(null);
    try {
      setStatus(await enablePush(householdId, memberId));
    } catch (e) {
      const text =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e && "message" in e
            ? String((e as { message: unknown }).message)
            : "Couldn't turn on notifications";
      const brave = typeof navigator !== "undefined" && "brave" in navigator;
      setMsg(
        brave && /push service/i.test(text)
          ? "Brave blocks notifications by default. Open brave://settings/privacy, turn on “Use Google services for push messaging”, relaunch Brave, then try again."
          : text,
      );
    }
    setBusy(false);
  };
  const disable = async () => {
    setBusy(true);
    setStatus(await disablePush());
    setBusy(false);
  };
  const test = async () => {
    setMsg(null);
    const res = await fetch("/api/push/test", { method: "POST" });
    setMsg(res.ok ? "Sent. It should arrive in a few seconds." : ((await res.json().catch(() => null))?.error ?? "Couldn't send"));
  };

  if (!status) return <p className="text-sm text-ink-2">Checking this device…</p>;
  if (status === "ios-needs-home-screen") return <IOSGuide />;
  return (
    <div>
      {status === "unsupported" && <p className="text-sm text-ink-2">This browser can&apos;t show notifications.</p>}
      {status === "not-configured" && <p className="text-sm text-ink-2">Notifications aren&apos;t set up on the server yet.</p>}
      {status === "denied" && (
        <p className="text-sm text-ink-2">
          Notifications are blocked for this site. Allow them in your browser&apos;s site settings, then come back.
        </p>
      )}
      {status === "off" && (
        <button type="button" className={btnPrimary} onClick={enable} disabled={busy}>
          {busy ? "Turning on…" : "Turn on notifications"}
        </button>
      )}
      {status === "on" && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-leaf">On for this device ✓</span>
          {showTest && (
            <button type="button" className={btnSecondary} onClick={test}>
              Send a test
            </button>
          )}
          <button type="button" className={btnSecondary} onClick={disable} disabled={busy}>
            Turn off
          </button>
        </div>
      )}
      {msg && (
        <p role="status" className="mt-2 text-sm text-ink-2">
          {msg}
        </p>
      )}
    </div>
  );
}

function IOSGuide() {
  const [seen, setSeen] = useState(true);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- per-device flag read after mount
      setSeen(localStorage.getItem(GUIDE_KEY) === "1");
    } catch {
      setSeen(false);
    }
  }, []);
  const done = () => {
    try {
      localStorage.setItem(GUIDE_KEY, "1");
    } catch {}
    setSeen(true);
  };
  if (seen)
    return (
      <p className="text-sm text-ink-2">
        On iPhone, notifications work once Veedu is on your Home Screen.{" "}
        <button type="button" className="font-bold text-teak underline" onClick={() => setSeen(false)}>
          Show me how
        </button>
      </p>
    );
  return (
    <div className="rounded-lg border border-callout-line bg-callout p-3 text-sm">
      <p className="m-0 font-bold">Add Veedu to your Home Screen</p>
      <p className="mt-1 mb-2 text-ink-2">iPhone only sends notifications to apps on the Home Screen (iOS 16.4 or later).</p>
      <ol className="m-0 list-decimal space-y-1 pl-5">
        <li>
          Tap the <b>Share</b> button <span aria-hidden="true">(□↑)</span> in Safari&apos;s toolbar.
        </li>
        <li>
          Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.
        </li>
        <li>
          Open <b>Veedu</b> from your Home Screen and come back here to turn notifications on.
        </li>
      </ol>
      <button type="button" className={`${btnSecondary} mt-3`} onClick={done}>
        Got it
      </button>
    </div>
  );
}
