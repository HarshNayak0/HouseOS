"use client";

import { useState } from "react";
import { milestoneLabel, nextOccurrence, useCalendarItems, type GiftIdea, type Milestone } from "@/lib/calendar";
import { live, useRowMutation, useRows } from "@/lib/lists/rows";
import { useNow } from "@/lib/lists/useNow";
import { formatDay, torontoDayKey } from "@/lib/time";
import { IconButton, Sec, TrashIcon, addBtn, inputCls, linkBtn, usePeople } from "./ui";

const fmtDay = formatDay;
const countdown = (d: number) => (d === 0 ? "Today 🎉" : d === 1 ? "Tomorrow" : `${d} days`);
const STATUS: GiftIdea["status"][] = ["idea", "bought", "given"];

export function Milestones() {
  const nowMs = useNow();
  const today = torontoDayKey(new Date(nowMs));
  const { data: rows } = useRows<Milestone>("milestones");
  const [planner, setPlanner] = useState(false);
  const list = live(rows)
    .map((m) => ({ m, n: nextOccurrence(m.base_date, today) }))
    .sort((a, b) => a.n.daysAway - b.n.daysAway);
  return (
    <Sec
      title="Milestones"
      right={
        <button type="button" className={`${linkBtn} normal-case tracking-normal`} onClick={() => setPlanner((v) => !v)} aria-expanded={planner}>
          {planner ? "Back to list" : "September planner"}
        </button>
      }
    >
      {planner ? (
        <SeptemberPlanner today={today} />
      ) : (
        list.map(({ m, n }) => <MilestoneRow key={m.id} m={m} n={n} />)
      )}
    </Sec>
  );
}

function MilestoneRow({ m, n }: { m: Milestone; n: ReturnType<typeof nextOccurrence> }) {
  const [open, setOpen] = useState(false);
  const label = milestoneLabel(m.kind, n.years);
  return (
    <div className="border-b border-dashed border-[#e6d9c2] last:border-b-0">
      <button type="button" className="flex min-h-11 w-full items-center gap-2 py-1.5 text-left text-sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="grow">
          {m.title}
          <span className="block text-xs text-ink-2">
            {fmtDay(n.date, { weekday: "short", month: "short", day: "numeric" })}
            {label ? ` · ${label}` : ""}
          </span>
        </span>
        <span className={`flex-none rounded-lg border px-2 py-1 text-xs font-bold ${n.daysAway <= 14 ? "border-[#e9d4a4] bg-[#fff8e6] text-[#7d5a1a]" : "border-[#e6d9c2] bg-white text-ink-2"}`}>
          {countdown(n.daysAway)}
        </span>
      </button>
      {open && <Gifts milestone={m} />}
    </div>
  );
}

/** Gift ideas for a milestone. Ideas for you are hidden from you by the database. */
function Gifts({ milestone }: { milestone: Milestone }) {
  const { me, partner } = usePeople();
  const { data: rows } = useRows<GiftIdea>("gift_ideas");
  const m = useRowMutation<GiftIdea>("gift_ideas");
  const [title, setTitle] = useState("");
  const [link, setLink] = useState("");
  const ideas = live(rows).filter((g) => g.milestone_id === milestone.id);
  const forMe = milestone.kind === "birthday" && milestone.person_id === me?.id;
  if (forMe)
    return <p className="mt-0 mb-2 ml-2 text-xs text-ink-2">It&apos;s your birthday: any gift ideas {partner?.display_name ?? "your partner"} adds stay hidden from you 🤫</p>;
  return (
    <div className="mb-2 ml-2 rounded-lg bg-[#fffdf8] p-2 text-sm">
      <p className="m-0 mb-1 text-[11px] text-ink-2">Gift ideas (hidden from {partner?.display_name ?? "your partner"})</p>
      {ideas.map((g) => (
        <div key={g.id} className="flex min-h-11 items-center gap-2">
          <span className="grow">
            {g.link ? (
              <a href={g.link} target="_blank" rel="noopener noreferrer" className="underline">
                {g.title}
              </a>
            ) : (
              g.title
            )}
          </span>
          <button
            type="button"
            className="min-h-9 rounded-full border border-[#e0d2b8] bg-white px-2.5 text-[11px] font-bold capitalize"
            onClick={() => m.update(g.id, { status: STATUS[(STATUS.indexOf(g.status) + 1) % 3] })}
            aria-label={`Status: ${g.status}. Tap to change`}
          >
            {g.status === "idea" ? "💡 idea" : g.status === "bought" ? "🛍 bought" : "🎁 given"}
          </button>
          <IconButton label={`Delete ${g.title}`} onClick={() => m.remove(g.id, "Idea removed")}>
            <TrashIcon />
          </IconButton>
        </div>
      ))}
      <form
        className="mt-1 flex flex-wrap gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim() || !me) return;
          const url = link.trim();
          m.insert({ household_id: me.household_id, milestone_id: milestone.id, title: title.trim().slice(0, 120), link: /^https?:\/\//.test(url) ? url : null });
          setTitle("");
          setLink("");
        }}
      >
        <input className={inputCls} placeholder="Gift idea…" aria-label="Gift idea" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit" className={addBtn} disabled={!title.trim()}>
          Add
        </button>
        <input className={`${inputCls} w-full`} placeholder="Link (optional)" aria-label="Gift link" value={link} onChange={(e) => setLink(e.target.value)} />
      </form>
    </div>
  );
}

/** September → mid-October at a glance: three milestones in two weeks, plus everything else booked. */
function SeptemberPlanner({ today }: { today: string }) {
  const { items } = useCalendarItems();
  const { data: gifts } = useRows<GiftIdea>("gift_ideas");
  const year = Number(today.slice(5, 7)) > 10 || (today.slice(5, 7) === "10" && Number(today.slice(8)) > 18) ? Number(today.slice(0, 4)) + 1 : Number(today.slice(0, 4));
  const from = `${year}-09-01`,
    to = `${year}-10-18`;
  const inRange = items.filter((i) => i.day >= from && i.day <= to);
  const days = [...new Set(inRange.map((i) => i.day))].sort();
  const giftCount = (title: string) => {
    const ms = inRange.find((i) => i.kind === "milestone" && i.title === title);
    const id = ms?.key.split(":")[1];
    const g = live(gifts).filter((x) => x.milestone_id === id);
    return g.length ? `${g.filter((x) => x.status !== "idea").length}/${g.length} gifts sorted` : "";
  };
  return (
    <div>
      <p className="mt-0 mb-2 text-xs text-ink-2">
        {fmtDay(from, { month: "long", day: "numeric" })} – {fmtDay(to, { month: "long", day: "numeric", year: "numeric" })}: the busiest stretch of your year.
      </p>
      {days.length === 0 && <p className="text-sm text-ink-2">Nothing booked yet.</p>}
      {days.map((d) => (
        <div key={d} className="border-b border-dashed border-[#e6d9c2] py-1.5 last:border-b-0">
          <div className="text-xs font-bold text-ink-2">{fmtDay(d, { weekday: "short", month: "short", day: "numeric" })}</div>
          {inRange
            .filter((i) => i.day === d)
            .map((i) => (
              <div key={i.key} className="flex items-center gap-2 py-0.5 text-sm">
                <span className="h-4 w-1 flex-none rounded-full" style={{ background: i.color }} aria-hidden="true" />
                <span className={i.kind === "milestone" ? "font-bold" : ""}>
                  {i.kind === "milestone" ? "🎉 " : ""}
                  {i.title}
                </span>
                {i.kind === "milestone" && <span className="text-xs text-ink-2">{[i.sub, giftCount(i.title)].filter(Boolean).join(" · ")}</span>}
              </div>
            ))}
        </div>
      ))}
    </div>
  );
}
