"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { callCalendar, useCalendarItems, type CalItem, type CalendarSource } from "@/lib/calendar";
import { rowsKey } from "@/lib/lists/rows";
import { toast } from "@/lib/lists/toast";
import { useNow } from "@/lib/lists/useNow";
import { formatToronto, torontoDayKey, torontoToUtc } from "@/lib/time";
import { Sec, WhoChip, addBtn, inputCls, linkBtn, smallSelect, usePeople } from "./ui";

type View = "day" | "week" | "month";
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const addDays = (key: string, n: number) => {
  const d = new Date(key + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dowMon = (key: string) => (new Date(key + "T12:00:00Z").getUTCDay() + 6) % 7;
const label = (key: string, o: Intl.DateTimeFormatOptions) => new Date(key + "T12:00:00Z").toLocaleDateString("en-CA", { timeZone: "UTC", ...o });

function timeRange(i: CalItem) {
  if (i.allDay) return "All day";
  const t = (d: Date) => formatToronto(d, { hour: "numeric", minute: "2-digit" });
  return i.end.getTime() > i.start.getTime() ? `${t(i.start)} – ${t(i.end)}` : t(i.start);
}

export function CalendarView() {
  const { items, sources, loading } = useCalendarItems();
  const nowMs = useNow();
  const today = torontoDayKey(new Date(nowMs));
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState(today);
  const [selected, setSelected] = useState(today);
  const [adding, setAdding] = useState(false);
  const byDay = useMemo(() => {
    const m = new Map<string, CalItem[]>();
    for (const i of items) {
      // multi-day all-day events appear on each day they cover
      const last = i.allDay && i.kind === "event" ? addDays(torontoDayKey(new Date(i.end.getTime() - 1)), 0) : i.day;
      for (let d = i.day, n = 0; d <= last && n < 60; d = addDays(d, 1), n++) m.set(d, [...(m.get(d) ?? []), i]);
    }
    return m;
  }, [items]);

  const connected = sources.length > 0;
  const step = (dir: number) => {
    const n = view === "day" ? addDays(cursor, dir) : view === "week" ? addDays(cursor, 7 * dir) : (() => {
      const d = new Date(cursor.slice(0, 7) + "-01T12:00:00Z");
      d.setUTCMonth(d.getUTCMonth() + dir);
      return d.toISOString().slice(0, 10);
    })();
    setCursor(n);
    setSelected(n);
  };
  const weekStart = addDays(cursor, -dowMon(cursor));
  const title =
    view === "month"
      ? label(cursor, { month: "long", year: "numeric" })
      : view === "week"
        ? `${label(weekStart, { month: "short", day: "numeric" })} – ${label(addDays(weekStart, 6), { month: "short", day: "numeric" })}`
        : label(cursor, { weekday: "long", month: "short", day: "numeric" });

  return (
    <Sec
      title="Calendar"
      right={
        <button type="button" className={`${linkBtn} normal-case tracking-normal`} onClick={() => setAdding((v) => !v)} disabled={!connected}>
          {adding ? "Close" : "+ Event"}
        </button>
      }
    >
      {!connected && !loading && (
        <div className="mb-2 rounded-lg border border-dashed border-[#e0d2b8] bg-[#fffdf8] p-3 text-sm">
          <p className="m-0 font-bold">Connect Google Calendar</p>
          <p className="mt-1 mb-2 text-ink-2">See both your calendars here, colour-coded, and add events from the house.</p>
          <Link href="/settings#calendars" className={`${addBtn} inline-flex items-center`}>
            Connect in Settings
          </Link>
        </div>
      )}
      {adding && <AddEvent sources={sources} defaultDay={selected} onDone={() => setAdding(false)} />}

      <div className="mb-2 flex items-center gap-1">
        <button type="button" aria-label="Previous" className="h-11 w-9 rounded-lg text-lg" onClick={() => step(-1)}>
          ‹
        </button>
        <button type="button" className="min-h-9 rounded-full border border-[#e0d2b8] bg-white px-2.5 text-xs font-bold" onClick={() => (setCursor(today), setSelected(today))}>
          Today
        </button>
        <button type="button" aria-label="Next" className="h-11 w-9 rounded-lg text-lg" onClick={() => step(1)}>
          ›
        </button>
        <span className="grow text-sm font-bold">{title}</span>
        <div className="flex rounded-full border border-[#e0d2b8] bg-white p-0.5" role="group" aria-label="Calendar view">
          {(["day", "week", "month"] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={`min-h-8 rounded-full px-2 text-[11px] font-bold capitalize ${view === v ? "bg-teak text-white" : "text-ink-2"}`}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === "month" && (
        <>
          <MonthGrid cursor={cursor} today={today} selected={selected} byDay={byDay} onPick={setSelected} />
          <DayList day={selected} items={byDay.get(selected) ?? []} today={today} />
        </>
      )}
      {view === "week" &&
        Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => <DayList key={d} day={d} items={byDay.get(d) ?? []} today={today} compact />)}
      {view === "day" && <DayList day={cursor} items={byDay.get(cursor) ?? []} today={today} />}
    </Sec>
  );
}

function MonthGrid({
  cursor,
  today,
  selected,
  byDay,
  onPick,
}: {
  cursor: string;
  today: string;
  selected: string;
  byDay: Map<string, CalItem[]>;
  onPick: (d: string) => void;
}) {
  const first = cursor.slice(0, 7) + "-01";
  const start = addDays(first, -dowMon(first));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const weeks = days[35].slice(0, 7) === cursor.slice(0, 7) ? 6 : 5;
  return (
    <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Month">
      {DOW.map((d) => (
        <div key={d} className="text-center text-[10px] font-bold text-ink-2" role="columnheader">
          {d.slice(0, 2)}
        </div>
      ))}
      {days.slice(0, weeks * 7).map((d) => {
        const list = byDay.get(d) ?? [];
        const inMonth = d.slice(0, 7) === cursor.slice(0, 7);
        return (
          <button
            key={d}
            type="button"
            role="gridcell"
            aria-selected={d === selected}
            aria-label={`${label(d, { weekday: "long", month: "long", day: "numeric" })}, ${list.length} item${list.length === 1 ? "" : "s"}`}
            onClick={() => onPick(d)}
            className={`flex min-h-11 flex-col items-center rounded-lg border pt-1 text-[12px] ${d === selected ? "border-teak bg-[#f3ead9]" : d === today ? "border-red-oxide bg-[#fdf3ef]" : "border-[#eee3cf] bg-white"} ${inMonth ? "" : "opacity-40"}`}
          >
            <b className={d === today ? "text-red-oxide" : ""}>{Number(d.slice(8))}</b>
            <span className="mt-0.5 flex min-h-[6px] flex-wrap justify-center gap-[2px] px-0.5">
              {list.slice(0, 4).map((i) => (
                <i key={i.key} className="block h-[6px] w-[6px] rounded-full" style={{ background: i.color }} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function DayList({ day, items, today, compact }: { day: string; items: CalItem[]; today: string; compact?: boolean }) {
  return (
    <div className={compact ? "border-b border-dashed border-[#e6d9c2] py-1.5 last:border-b-0" : "mt-3"}>
      <div className={`text-xs font-bold ${day === today ? "text-red-oxide" : "text-ink-2"}`}>
        {day === today ? "Today · " : ""}
        {label(day, { weekday: "long", month: "short", day: "numeric" })}
      </div>
      {items.length === 0 ? (
        !compact && <p className="m-0 py-2 text-sm text-ink-2">Nothing planned.</p>
      ) : (
        items.map((i) => <ItemRow key={i.key} i={i} />)
      )}
    </div>
  );
}

function ItemRow({ i }: { i: CalItem }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { byId } = usePeople();
  const calName = (src: CalendarSource) =>
    src.is_us_calendar ? "Us" : src.is_primary ? `${byId(src.member_id)?.display_name ?? "Their"}'s calendar` : src.summary;
  const canEdit = i.kind === "event" && i.source && ["owner", "writer"].includes(i.source.access_role);
  const del = async () => {
    if (!i.event || !i.source) return;
    try {
      await callCalendar("event", { op: "delete", source_id: i.source.id, event_id: i.event.google_event_id });
      toast("Event deleted");
      qc.invalidateQueries({ queryKey: rowsKey("calendar_event_cache") });
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    }
  };
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-h-11 w-full items-center gap-2 py-1 text-left text-sm">
        <span className="h-8 w-1 flex-none rounded-full" style={{ background: i.color }} aria-hidden="true" />
        <span className="w-[74px] flex-none text-xs text-ink-2">{timeRange(i)}</span>
        <span className="min-w-0 grow">
          {i.kind === "milestone" && "🎉 "}
          {i.title}
          {(i.sub || i.source) && (
            <span className="block truncate text-[11px] text-ink-2">{i.sub || (i.source ? calName(i.source) : "")}</span>
          )}
        </span>
        {i.kind !== "milestone" && <WhoChip memberId={i.who} small />}
      </button>
      {open && i.event && (
        <div className="mb-2 ml-3 rounded-lg bg-[#fffdf8] p-2 text-sm">
          {i.event.location && <p className="m-0">📍 {i.event.location}</p>}
          {i.event.description && <p className="m-0 mt-1 line-clamp-3 text-ink-2">{i.event.description}</p>}
          <div className="mt-1 flex flex-wrap gap-3">
            {i.event.html_link && (
              <a href={i.event.html_link} target="_blank" rel="noopener noreferrer" className={linkBtn}>
                Open in Google Calendar
              </a>
            )}
            {canEdit && (
              <button type="button" className={`${linkBtn} text-urgent`} onClick={del}>
                Delete event
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function sourceName(s: CalendarSource, me: { id: string; display_name: string } | null, partner: { id: string; display_name: string } | null) {
  if (s.is_us_calendar) return "Us (shared)";
  const owner = s.member_id === me?.id ? "My" : `${partner?.display_name ?? "Partner"}'s`;
  return s.is_primary ? `${owner} calendar` : `${owner}: ${s.summary}`;
}

function AddEvent({ sources, defaultDay, onDone }: { sources: CalendarSource[]; defaultDay: string; onDone: () => void }) {
  const { me, partner } = usePeople();
  const qc = useQueryClient();
  const writable = sources
    .filter((s) => s.visible && ["owner", "writer"].includes(s.access_role))
    .filter((s, idx, arr) => !s.is_us_calendar || arr.findIndex((x) => x.is_us_calendar) === idx)
    .sort((a, b) => Number(b.is_us_calendar) - Number(a.is_us_calendar) || Number(b.member_id === me?.id) - Number(a.member_id === me?.id));
  const [title, setTitle] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [date, setDate] = useState(defaultDay);
  const [start, setStart] = useState("18:00");
  const [end, setEnd] = useState("19:00");
  const [endDate, setEndDate] = useState(defaultDay);
  const [target, setTarget] = useState(writable[0]?.id ?? "");
  const [location, setLocation] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !target) return;
    const [y, m, d] = date.split("-").map(Number);
    let event;
    if (allDay) event = { summary: title, location, all_day: true, start: date, end: addDays(endDate < date ? date : endDate, 1) };
    else {
      const [sh, sm] = start.split(":").map(Number);
      const [eh, em] = end.split(":").map(Number);
      const s = torontoToUtc(y, m, d, sh, sm);
      let t = torontoToUtc(y, m, d, eh, em);
      if (t <= s) t = new Date(s.getTime() + 3_600_000);
      event = { summary: title, location, all_day: false, start: s.toISOString(), end: t.toISOString() };
    }
    setBusy(true);
    try {
      await callCalendar("event", { op: "create", source_id: target, event });
      toast("Event added to Google Calendar");
      qc.invalidateQueries({ queryKey: rowsKey("calendar_event_cache") });
      onDone();
    } catch (err) {
      toast((err as Error).message, { tone: "error" });
    }
    setBusy(false);
  };
  if (!writable.length) return <p className="text-sm text-ink-2">None of the shown calendars can be written to.</p>;
  return (
    <form onSubmit={submit} className="mb-3 space-y-1.5 rounded-lg bg-[#fffdf8] p-2">
      <input className={`${inputCls} w-full`} placeholder="Event title" aria-label="Event title" value={title} maxLength={300} onChange={(e) => setTitle(e.target.value)} autoFocus />
      <div className="flex flex-wrap gap-1.5">
        <input type="date" aria-label="Date" className={smallSelect} value={date} onChange={(e) => (setDate(e.target.value), endDate < e.target.value && setEndDate(e.target.value))} />
        {allDay ? (
          <input type="date" aria-label="Last day" className={smallSelect} value={endDate} min={date} onChange={(e) => setEndDate(e.target.value)} />
        ) : (
          <>
            <input type="time" aria-label="Starts" className={smallSelect} value={start} onChange={(e) => setStart(e.target.value)} />
            <input type="time" aria-label="Ends" className={smallSelect} value={end} onChange={(e) => setEnd(e.target.value)} />
          </>
        )}
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="h-[18px] w-[18px] accent-red-oxide" />
        All day
      </label>
      <select aria-label="Calendar" className={`${smallSelect} w-full`} value={target} onChange={(e) => setTarget(e.target.value)}>
        {writable.map((s) => (
          <option key={s.id} value={s.id}>
            {sourceName(s, me, partner)}
          </option>
        ))}
      </select>
      <input className={`${inputCls} w-full`} placeholder="Location (optional)" aria-label="Location" value={location} maxLength={300} onChange={(e) => setLocation(e.target.value)} />
      <button type="submit" className={`${addBtn} w-full`} disabled={busy || !title.trim()}>
        {busy ? "Adding…" : "Add event"}
      </button>
    </form>
  );
}
