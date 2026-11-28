"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { btnPrimary, btnSecondary, input } from "@/components/ui/Card";
import { callCalendar, type CalendarAccount, type CalendarSource, type Milestone } from "@/lib/calendar";
import { useHousehold } from "@/lib/household";
import { live, rowsKey, useRowMutation, useRows } from "@/lib/lists/rows";
import { toast } from "@/lib/lists/toast";
import { Section } from "./AccountSettings";

export function CalendarSettings() {
  const qc = useQueryClient();
  const { data } = useHousehold();
  const me = data?.me,
    partner = data?.partner;
  const { data: accounts } = useRows<CalendarAccount>("calendar_accounts");
  const { data: sources } = useRows<CalendarSource>("calendar_sources");
  const [busy, setBusy] = useState<string | null>(null);
  const mine = live(accounts).find((a) => a.member_id === me?.id);
  const theirs = live(accounts).find((a) => a.member_id === partner?.id);
  const mySources = live(sources).filter((s) => s.member_id === me?.id);
  const hasUs = live(sources).some((s) => s.is_us_calendar);

  // result of returning from Google
  useEffect(() => {
    const r = new URLSearchParams(location.search).get("calendar");
    if (!r) return;
    toast(r === "connected" ? "Google Calendar connected" : r === "cancelled" ? "Calendar connection cancelled" : "Couldn't connect the calendar. Try again.", {
      tone: r === "error" ? "error" : "info",
    });
    history.replaceState(null, "", location.pathname + "#calendars");
  }, []);

  const run = async (label: string, path: string, after?: (r: unknown) => void) => {
    setBusy(label);
    try {
      const r = await callCalendar(path, path === "start" ? { to: "/settings" } : {});
      after?.(r);
      qc.invalidateQueries({ queryKey: rowsKey("calendar_sources") });
      qc.invalidateQueries({ queryKey: rowsKey("calendar_accounts") });
      qc.invalidateQueries({ queryKey: rowsKey("calendar_event_cache") });
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    }
    setBusy(null);
  };
  const toggle = async (s: CalendarSource, visible: boolean) => {
    const { error } = (await (await import("@/lib/supabase/browser")).supabaseBrowser()?.from("calendar_sources").update({ visible }).eq("id", s.id)) ?? {};
    if (error) return toast(error.message, { tone: "error" });
    qc.invalidateQueries({ queryKey: rowsKey("calendar_sources") });
    if (visible) run("sync", "sync");
  };

  return (
    <Section title="Calendars">
      <div id="calendars" className="scroll-mt-4" />
      {!mine ? (
        <>
          <p className="mt-0 mb-2 text-sm text-ink-2">
            Connect your Google Calendar to see both of your days in the house and add events from here. Google will ask for calendar access and may say the app
            isn&apos;t verified: choose <b>Advanced → Go to Veedu</b>.
          </p>
          <button type="button" className={btnPrimary} disabled={!!busy} onClick={() => run("connect", "start", (r) => (location.href = (r as { url: string }).url))}>
            {busy === "connect" ? "Opening Google…" : "Connect Google Calendar"}
          </button>
        </>
      ) : (
        <>
          <p className="mt-0 mb-1 text-sm">
            Connected as <b>{mine.google_email}</b>
            {mine.status !== "ok" && <span className="text-urgent"> · needs reconnecting</span>}
          </p>
          {mine.status !== "ok" && (
            <button type="button" className={`${btnPrimary} mb-2`} onClick={() => run("connect", "start", (r) => (location.href = (r as { url: string }).url))}>
              Reconnect
            </button>
          )}
          <p className="mt-2 mb-1 text-sm font-bold">Show in the house</p>
          {mySources
            .filter((s) => !s.is_us_calendar)
            .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.summary.localeCompare(b.summary))
            .map((s) => (
              <label key={s.id} className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" checked={s.visible} onChange={(e) => toggle(s, e.target.checked)} className="h-[18px] w-[18px] accent-red-oxide" />
                <span className="h-3 w-3 rounded-full" style={{ background: s.color ?? "#ccc" }} aria-hidden="true" />
                {s.summary}
                {s.is_primary ? " (main)" : ""}
              </label>
            ))}
          <p className="mt-3 mb-1 text-sm font-bold">Shared “Us” calendar</p>
          {hasUs ? (
            <p className="m-0 text-sm text-ink-2">✓ Set up. Events on it show for both of you{theirs ? "" : `; it'll appear for ${partner?.display_name ?? "your partner"} once they connect`}.</p>
          ) : (
            <>
              <p className="mt-0 mb-2 text-sm text-ink-2">Creates a calendar called “Us” in your Google account and shares it with {partner?.display_name ?? "your partner"}.</p>
              <button type="button" className={btnSecondary} disabled={!!busy || !partner} onClick={() => run("us", "us", () => toast("Us calendar created and shared"))}>
                {busy === "us" ? "Creating…" : "Create the Us calendar"}
              </button>
            </>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" className={btnSecondary} disabled={!!busy} onClick={() => run("sync", "sync", () => toast("Calendars synced"))}>
              {busy === "sync" ? "Syncing…" : "Sync now"}
            </button>
            <button type="button" className={`${btnSecondary} text-urgent`} disabled={!!busy} onClick={() => run("disconnect", "disconnect", () => toast("Calendar disconnected"))}>
              Disconnect
            </button>
          </div>
        </>
      )}
      {partner && (
        <p className="mt-3 mb-0 text-xs text-ink-2">
          {partner.display_name}: {theirs ? `connected (${theirs.google_email})` : "not connected yet"}
        </p>
      )}
    </Section>
  );
}

export function MilestoneSettings() {
  const { data } = useHousehold();
  const { data: rows } = useRows<Milestone>("milestones");
  const m = useRowMutation<Milestone>("milestones");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<Milestone["kind"]>("anniversary");
  const list = live(rows);
  const people = data?.members ?? [];
  return (
    <Section title="Milestones">
      <p className="mt-0 mb-2 text-xs text-ink-2">Every year. Reminders 14, 7 and 1 days before; birthday reminders go to the other person only.</p>
      {list.map((ms) => (
        <div key={ms.id} className="flex flex-wrap items-center gap-1.5 border-b border-dashed border-line py-1.5 last:border-b-0">
          <input className={`${input} min-w-0 flex-1`} aria-label="Milestone name" defaultValue={ms.title} maxLength={80} onBlur={(e) => e.target.value.trim() && e.target.value !== ms.title && m.update(ms.id, { title: e.target.value.trim() })} />
          <input type="date" className={`${input} w-auto`} aria-label={`${ms.title} date`} defaultValue={ms.base_date} onBlur={(e) => e.target.value && e.target.value !== ms.base_date && m.update(ms.id, { base_date: e.target.value })} />
          {ms.kind === "birthday" && (
            <select className={`${input} w-auto`} aria-label="Whose birthday" value={ms.person_id ?? ""} onChange={(e) => m.update(ms.id, { person_id: e.target.value || null })}>
              <option value="">—</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.display_name}
                </option>
              ))}
            </select>
          )}
          <button type="button" className="min-h-11 px-2 text-xs font-bold text-urgent underline" onClick={() => m.remove(ms.id, `Removed ${ms.title}`)}>
            Remove
          </button>
        </div>
      ))}
      <form
        className="mt-2 flex flex-wrap gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim() || !date || !data?.me) return;
          m.insert({ household_id: data.me.household_id, title: title.trim().slice(0, 80), base_date: date, kind });
          setTitle("");
          setDate("");
        }}
      >
        <input className={`${input} min-w-0 flex-1`} placeholder="New milestone" aria-label="New milestone" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        <input type="date" className={`${input} w-auto`} aria-label="Date" value={date} onChange={(e) => setDate(e.target.value)} />
        <select className={`${input} w-auto`} aria-label="Kind" value={kind} onChange={(e) => setKind(e.target.value as Milestone["kind"])}>
          <option value="anniversary">Anniversary</option>
          <option value="birthday">Birthday</option>
          <option value="other">Other</option>
        </select>
        <button type="submit" className={btnPrimary} disabled={!title.trim() || !date}>
          Add
        </button>
      </form>
    </Section>
  );
}
