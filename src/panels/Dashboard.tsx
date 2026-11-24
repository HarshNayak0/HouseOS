"use client";

import { useMemo, useState } from "react";
import { milestoneLabel, nextOccurrence, useCalendarItems, type CalItem, type Milestone } from "@/lib/calendar";
import { buildUrgent, type UrgentTone } from "@/lib/dashboard";
import { useHousehold } from "@/lib/household";
import { dueLabel, dueState } from "@/lib/lists/dates";
import { live, useRows } from "@/lib/lists/rows";
import { useNow } from "@/lib/lists/useNow";
import { goToRoom } from "@/lib/nav";
import { useUsage, usageWarnings } from "@/lib/usage";
import Link from "next/link";
import { formatToronto, torontoDayKey } from "@/lib/time";
import type { Chore } from "./Chores";
import type { Task } from "./Tasks";
import { daysBetween, packedPct } from "@/lib/trips";
import type { PackingItem, Trip } from "./Trips";
import type { VaultItemRow } from "@/lib/vault";
import { Sec, WhoChip, linkBtn, usePeople } from "./ui";

const TONE: Record<UrgentTone, string> = {
  overdue: "border-[#e7b2a8] bg-[#fdf0ec] text-urgent",
  soon: "border-[#e6d9c2] bg-white text-ink",
  milestone: "border-[#e9d4a4] bg-[#fff8e6] text-[#7d5a1a]",
  trip: "border-[#c9dcc0] bg-[#f1f7ec] text-leaf",
  renewal: "border-[#e9d4a4] bg-[#fff8e6] text-[#7d5a1a]",
};

const addDays = (key: string, n: number) => {
  const d = new Date(key + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dayLabel = (key: string, o: Intl.DateTimeFormatOptions) => new Date(key + "T12:00:00Z").toLocaleDateString("en-CA", { timeZone: "UTC", ...o });

export function Dashboard() {
  const nowMs = useNow();
  const now = new Date(nowMs);
  const today = torontoDayKey(now);
  const { data: tasks } = useRows<Task>("tasks");
  const { data: chores } = useRows<Chore>("chores");
  const { data: milestones } = useRows<Milestone>("milestones");
  const { data: trips } = useRows<Trip>("trips");
  const { data: packing } = useRows<PackingItem>("packing_items");
  const { data: vault } = useRows<VaultItemRow>("vault_items");
  const { items } = useCalendarItems();
  const { data: usage } = useUsage();
  const warnings = usageWarnings(usage);

  const urgent = buildUrgent({
    now,
    today,
    tasks: live(tasks),
    chores: live(chores),
    milestones: live(milestones).map((m) => {
      const n = nextOccurrence(m.base_date, today);
      return { id: m.id, title: m.title, date: n.date, daysAway: n.daysAway, label: milestoneLabel(m.kind, n.years) };
    }),
    trips: live(trips)
      .filter((t) => t.ends_on >= today)
      .map((t) => ({ id: t.id, title: t.title, starts_on: t.starts_on, daysAway: Math.max(0, daysBetween(today, t.starts_on)), packedPct: packedPct(packing ?? [], t.id) })),
    renewals: live(vault)
      .filter((v) => v.renewal_date && v.renewal_date >= today)
      .map((v) => ({ id: v.id, title: v.label, date: v.renewal_date!, daysAway: daysBetween(today, v.renewal_date!) })),
    dayKey: (s) => torontoDayKey(s),
    label: (s, t) => dueLabel(s, t, now),
  });

  const byDay = useMemo(() => {
    const m = new Map<string, CalItem[]>();
    for (const i of items) m.set(i.day, [...(m.get(i.day) ?? []), i]);
    return m;
  }, [items]);
  const [picked, setPicked] = useState<string | null>(null);
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i));

  const pendingTasks = live(tasks)
    .filter((t) => !t.completed_at)
    .sort((a, b) => (a.due_at ?? "9999") < (b.due_at ?? "9999") ? -1 : 1)
    .slice(0, 5);
  const pendingChores = live(chores)
    .filter((c) => !c.paused && ["overdue", "today", "soon"].includes(dueState(c.next_due_at, now)))
    .sort((a, b) => (a.next_due_at < b.next_due_at ? -1 : 1));

  return (
    <>
      {warnings.length > 0 && (
        <div role="alert" className="mb-3 rounded-lg border border-[#e7b2a8] bg-[#fdf0ec] p-2.5 text-sm text-urgent">
          ⚠️ Veedu is using {warnings.map((w) => `${Math.round(w.share * 100)}% of its free ${w.what}`).join(" and ")}.{" "}
          <Link href="/settings" className="font-bold underline">
            See usage
          </Link>
        </div>
      )}
      <Sec title="Time-sensitive">
        {urgent.length === 0 ? (
          <p className="m-0 text-sm text-ink-2">Nothing pressing. Enjoy the quiet 🌿</p>
        ) : (
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="list">
            {urgent.map((u) => (
              <button
                key={u.key}
                type="button"
                role="listitem"
                onClick={() => goToRoom(u.room)}
                className={`min-h-11 flex-none rounded-lg border px-2.5 py-1.5 text-left text-xs font-bold ${TONE[u.tone]}`}
              >
                {u.title}
                <span className="block font-normal opacity-80">{u.detail}</span>
              </button>
            ))}
          </div>
        )}
      </Sec>

      <Sec title={`Today · ${formatToronto(now, { weekday: "long", month: "short", day: "numeric" })}`}>
        <DayItems list={byDay.get(today) ?? []} empty="Nothing on the calendar today." />
      </Sec>

      <Sec title="Next 7 days">
        <div className="grid grid-cols-7 gap-1">
          {week.map((d) => {
            const list = byDay.get(d) ?? [];
            const colors = [...new Set(list.map((i) => i.color))].slice(0, 4);
            const sel = (picked ?? today) === d;
            return (
              <button
                key={d}
                type="button"
                aria-pressed={sel}
                onClick={() => setPicked(d)}
                className={`flex min-h-14 flex-col items-center rounded-lg border px-0.5 py-1.5 text-[11px] text-ink-2 ${d === today ? "border-red-oxide bg-[#fdf3ef]" : sel ? "border-teak bg-[#f3ead9]" : "border-[#e6d9c2] bg-white"}`}
              >
                <span aria-hidden="true">{dayLabel(d, { weekday: "short" })}</span>
                <b className="text-[15px] text-ink" aria-hidden="true">
                  {Number(d.slice(8))}
                </b>
                <span className="sr-only">
                  {dayLabel(d, { weekday: "long", month: "long", day: "numeric" })}, {list.length} item{list.length === 1 ? "" : "s"}
                </span>
                <span className="mt-1 flex min-h-[6px] justify-center gap-[3px]">
                  {colors.map((c) => (
                    <i key={c} className="block h-[6px] w-[6px] rounded-full" style={{ background: c }} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        {picked && picked !== today && (
          <div className="mt-2">
            <div className="text-xs font-bold text-ink-2">{dayLabel(picked, { weekday: "long", month: "short", day: "numeric" })}</div>
            <DayItems list={byDay.get(picked) ?? []} empty="Nothing planned." />
          </div>
        )}
      </Sec>

      <Sec title="Pending" right={<button type="button" className={`${linkBtn} normal-case tracking-normal`} onClick={() => goToRoom("office")}>All tasks</button>}>
        {pendingTasks.length === 0 && pendingChores.length === 0 && <p className="m-0 text-sm text-ink-2">All clear.</p>}
        {pendingChores.map((c) => (
          <PendingRow key={c.id} title={c.title} sub={`Chore · ${dueLabel(c.next_due_at, false, now)}`} overdue={dueState(c.next_due_at, now) === "overdue"} who={c.assignee_id} onOpen={() => goToRoom("wash")} />
        ))}
        {pendingTasks.map((t) => (
          <PendingRow
            key={t.id}
            title={t.title}
            sub={t.due_at ? `Task · ${dueLabel(t.due_at, t.due_has_time, now)}` : "Task"}
            overdue={dueState(t.due_at, now) === "overdue"}
            who={t.assignee_id}
            onOpen={() => goToRoom("office")}
          />
        ))}
      </Sec>
    </>
  );
}

function DayItems({ list, empty }: { list: CalItem[]; empty: string }) {
  if (!list.length) return <p className="m-0 text-sm text-ink-2">{empty}</p>;
  return (
    <>
      {list.map((i) => (
        <div key={i.key} className="flex min-h-10 items-center gap-2 border-b border-dashed border-[#e6d9c2] py-1 text-sm last:border-b-0">
          <span className="h-7 w-1 flex-none rounded-full" style={{ background: i.color }} aria-hidden="true" />
          <span className="min-w-0 grow">
            {i.kind === "milestone" && "🎉 "}
            {i.title}
            <span className="block text-xs text-ink-2">
              {i.allDay ? (i.sub ?? "All day") : formatToronto(i.start, { hour: "numeric", minute: "2-digit" })}
              {!i.allDay && i.end > i.start ? ` – ${formatToronto(i.end, { hour: "numeric", minute: "2-digit" })}` : ""}
            </span>
          </span>
          {i.kind !== "milestone" && <WhoChip memberId={i.who} small />}
        </div>
      ))}
    </>
  );
}

function PendingRow({ title, sub, overdue, who, onOpen }: { title: string; sub: string; overdue: boolean; who: string | null; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="flex min-h-11 w-full items-center gap-2 border-b border-dashed border-[#e6d9c2] py-1 text-left text-sm last:border-b-0">
      <span className="grow">
        {title}
        <span className={`block text-xs ${overdue ? "font-bold text-urgent" : "text-ink-2"}`}>{sub}</span>
      </span>
      <WhoChip memberId={who} small />
    </button>
  );
}

/** "Together for N days" (since the relationship anniversary). */
export function TogetherCounter() {
  const { data } = useHousehold();
  const nowMs = useNow(3_600_000);
  const since = data?.togetherSince;
  if (!since) return null;
  const days = Math.floor((Date.parse(torontoDayKey(new Date(nowMs)) + "T12:00:00Z") - Date.parse(since + "T12:00:00Z")) / 86_400_000);
  if (days < 0) return null;
  return (
    <Sec title="Together">
      <div className="rounded-lg border border-[#e6d9c2] bg-white p-3 text-center">
        <div className="font-serif text-[28px] font-semibold">{days.toLocaleString("en-CA")}</div>
        <div className="text-[12.5px] text-ink-2">days together · since {dayLabel(since, { month: "short", day: "numeric", year: "numeric" })}</div>
      </div>
    </Sec>
  );
}

interface Activity {
  id: string;
  actor_id: string | null;
  verb: string;
  summary: string | null;
  created_at: string;
  deleted_at: string | null;
}

/** The last 20 things either of you did (pruned after 90 days by the database). */
export function ActivityFeed() {
  const { data } = useRows<Activity>("activity_log");
  const { byId } = usePeople();
  const nowMs = useNow();
  const rows = live(data).slice(0, 20);
  if (!rows.length) return null;
  const ago = (iso: string) => {
    const m = Math.round((nowMs - Date.parse(iso)) / 60_000);
    if (m < 1) return "just now";
    if (m < 60) return `${m} min ago`;
    if (m < 24 * 60) return `${Math.round(m / 60)} h ago`;
    return formatToronto(iso, { month: "short", day: "numeric" });
  };
  return (
    <Sec title="Recent activity">
      {rows.map((a) => (
        <p key={a.id} className="m-0 border-b border-dashed border-[#e6d9c2] py-1.5 text-sm last:border-b-0">
          <b>{byId(a.actor_id)?.display_name ?? "Someone"}</b> {a.summary}
          <span className="text-xs text-ink-2"> · {ago(a.created_at)}</span>
        </p>
      ))}
    </Sec>
  );
}
