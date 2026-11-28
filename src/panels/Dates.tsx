"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { callCalendar, type CachedEvent, type CalendarSource } from "@/lib/calendar";
import { busyFromEvents, findFreeSlots } from "@/lib/freeTime";
import type { Trip } from "./Trips";
import { dueLabel } from "@/lib/lists/dates";
import { insertOrUpdate, live, rowsKey, trashed, useRowMutation, useRows, type BaseRow } from "@/lib/lists/rows";
import { toast } from "@/lib/lists/toast";
import { FILES_BUCKET, uploadHouseholdFile, useSignedUrl } from "@/lib/files";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { addDays, formatDay, formatToronto, torontoDayKey, torontoToUtc } from "@/lib/time";
import { EmptyState, Sec, Stars, Tabs, Trash, addBtn, inputCls, linkBtn, smallSelect, usePeople } from "./ui";

export interface DateIdea extends BaseRow {
  title: string;
  notes: string | null;
  link: string | null;
  location: string | null;
  tags: string[];
  cost: number;
  duration: "quick" | "evening" | "half-day" | "full-day" | "weekend";
  status: "wishlist" | "planned" | "done";
  planned_for: string | null;
  calendar_source_id: string | null;
  calendar_event_id: string | null;
}
interface Memory extends BaseRow {
  date_idea_id: string | null;
  title: string;
  happened_on: string;
  photo_path: string | null;
  memory_note: string | null;
}
interface DateRating {
  household_id: string;
  memory_id: string;
  member_id: string;
  rating: number;
  deleted_at: string | null;
  id?: string;
}

const COST = ["Free", "$", "$$", "$$$", "$$$$"];
const DURATION: Record<DateIdea["duration"], string> = { quick: "An hour or so", evening: "An evening", "half-day": "Half a day", "full-day": "A full day", weekend: "A weekend" };
type Tab = "wishlist" | "planned" | "memories";
/** How long each kind of date takes, for the calendar event and for finding a free slot. */
const HOURS: Record<DateIdea["duration"], number> = { quick: 1, evening: 3, "half-day": 4, "full-day": 8, weekend: 24 };

export function DateIdeas() {
  const { data: rows, isLoading } = useRows<DateIdea>("date_ideas");
  const m = useRowMutation<DateIdea>("date_ideas");
  const [tab, setTab] = useState<Tab>("wishlist");
  const [maxCost, setMaxCost] = useState(4);
  const [duration, setDuration] = useState<string>("any");
  const [picked, setPicked] = useState<string | null>(null);
  const [spinning, setSpinning] = useState<string | null>(null);
  const [schedule, setSchedule] = useState<DateIdea | null>(null);
  const [memoryFor, setMemoryFor] = useState<DateIdea | null>(null);
  const ideas = live(rows);
  const matches = (d: DateIdea) => d.cost <= maxCost && (duration === "any" || d.duration === duration);
  const wishlist = ideas.filter((d) => d.status === "wishlist" && matches(d));
  const planned = ideas.filter((d) => d.status === "planned").sort((a, b) => (a.planned_for ?? "") < (b.planned_for ?? "") ? -1 : 1);
  const spin = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => void (spin.current && clearInterval(spin.current)), []);

  const surprise = () => {
    if (!wishlist.length) return toast("No wishlist ideas match those filters");
    setPicked(null);
    setTab("wishlist");
    if (spin.current) clearInterval(spin.current);
    const final = wishlist[Math.floor(Math.random() * wishlist.length)];
    const until = Date.now() + 1200; // ends on time even if the phone is busy rendering
    spin.current = setInterval(() => {
      if (Date.now() >= until) {
        clearInterval(spin.current!);
        setSpinning(null);
        setPicked(final.id);
        return;
      }
      setSpinning(wishlist[Math.floor(Math.random() * wishlist.length)].id);
    }, 110);
  };

  return (
    <>
      <Sec
        title="Our dates"
        right={
          <button type="button" onClick={surprise} className="min-h-9 rounded-full border border-brass bg-card px-3 text-xs font-bold tracking-normal text-teak normal-case">
            🌼 Surprise me
          </button>
        }
      >
        <Tabs
          label="Date ideas"
          value={tab}
          onChange={setTab}
          tabs={[
            ["wishlist", `Wishlist (${ideas.filter((d) => d.status === "wishlist").length})`],
            ["planned", `Planned (${planned.length})`],
            ["memories", "Memories"],
          ]}
        />

        {picked && tab === "wishlist" && (() => {
          const d = ideas.find((x) => x.id === picked);
          if (!d) return null;
          return (
            <div className="mb-3 rotate-[-1deg] rounded-md border border-callout-line bg-callout p-3 shadow-md" role="status">
              <p className="m-0 text-[11px] font-bold tracking-wider text-callout-ink uppercase">From the uruli 🌼</p>
              <p className="m-0 mt-1 font-serif text-lg font-semibold">{d.title}</p>
              <p className="m-0 text-xs text-ink-2">{[COST[d.cost], DURATION[d.duration], d.location].filter(Boolean).join(" · ")}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" className={addBtn} onClick={() => setSchedule(d)}>
                  Plan it
                </button>
                <button type="button" className={linkBtn} onClick={surprise}>
                  Draw again
                </button>
              </div>
            </div>
          );
        })()}

        {tab === "wishlist" && (
          <>
            <div className="mb-2 flex flex-wrap gap-1.5">
              <select aria-label="Budget" className={smallSelect} value={maxCost} onChange={(e) => setMaxCost(Number(e.target.value))}>
                <option value={4}>Any budget</option>
                {COST.slice(0, 4).map((c, i) => (
                  <option key={c} value={i}>
                    Up to {c}
                  </option>
                ))}
              </select>
              <select aria-label="Time needed" className={smallSelect} value={duration} onChange={(e) => setDuration(e.target.value)}>
                <option value="any">Any length</option>
                {Object.entries(DURATION).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <AddIdea />
            {!isLoading && ideas.length === 0 && (
              <EmptyState
                title="Start a wishlist"
                hint="Jot down dates you'd like to go on. “Surprise me” draws one from the brass uruli when you can't decide."
                example={
                  <div className="rounded-lg border border-line bg-card p-2.5">
                    <IdeaCardView d={{ title: "Sunset walk at the Bluffs", cost: 0, duration: "evening", tags: ["Outdoors"], location: "Scarborough Bluffs" }} />
                  </div>
                }
              />
            )}
            {wishlist.map((d) => (
              <IdeaCard key={d.id} d={d} highlight={spinning === d.id || picked === d.id} onPlan={() => setSchedule(d)} onDone={() => setMemoryFor(d)} onDelete={() => m.remove(d.id, `Removed “${d.title}”`)} />
            ))}
            <Trash rows={trashed(rows)} label={(r) => r.title} onRestore={m.restore} />
          </>
        )}
        {tab === "planned" &&
          (planned.length ? (
            planned.map((d) => (
              <IdeaCard key={d.id} d={d} onPlan={() => setSchedule(d)} onDone={() => setMemoryFor(d)} onUnplan={() => unplan(d)} onDelete={() => m.remove(d.id, `Removed “${d.title}”`)} />
            ))
          ) : (
            <p className="text-sm text-ink-2">Nothing planned yet. Pick something from the wishlist, or let the uruli choose.</p>
          ))}
        {tab === "memories" && <Memories />}
      </Sec>
      {schedule && <ScheduleSheet d={schedule} onClose={() => setSchedule(null)} />}
      {memoryFor && <MemoryForm d={memoryFor} onClose={() => setMemoryFor(null)} onSaved={() => (setMemoryFor(null), setTab("memories"))} />}
    </>
  );

  async function unplan(d: DateIdea) {
    if (d.calendar_event_id && d.calendar_source_id) {
      await callCalendar("event", { op: "delete", source_id: d.calendar_source_id, event_id: d.calendar_event_id }).catch(() => {});
    }
    m.update(d.id, { status: "wishlist", planned_for: null, calendar_event_id: null, calendar_source_id: null });
  }
}

function AddIdea() {
  const { me } = usePeople();
  const m = useRowMutation<DateIdea>("date_ideas");
  const [title, setTitle] = useState("");
  const [more, setMore] = useState(false);
  const [cost, setCost] = useState(1);
  const [duration, setDuration] = useState<DateIdea["duration"]>("evening");
  const [location, setLocation] = useState("");
  const [link, setLink] = useState("");
  const [tags, setTags] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !me) return;
    m.insert({
      household_id: me.household_id,
      title: title.trim().slice(0, 120),
      cost,
      duration,
      location: location.trim().slice(0, 200) || null,
      link: /^https?:\/\//.test(link.trim()) ? link.trim() : null,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 8),
    });
    setTitle("");
    setLocation("");
    setLink("");
    setTags("");
  };
  return (
    <form onSubmit={submit} className="mb-2">
      <div className="flex gap-1.5">
        <input className={inputCls} placeholder="Add a date idea…" aria-label="New date idea" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit" className={addBtn} disabled={!title.trim()}>
          Add
        </button>
      </div>
      <button type="button" className={linkBtn} onClick={() => setMore((v) => !v)} aria-expanded={more}>
        {more ? "Fewer details" : "Cost, time, place…"}
      </button>
      {more && (
        <div className="grid grid-cols-2 gap-1.5">
          <select aria-label="Cost" className={smallSelect} value={cost} onChange={(e) => setCost(Number(e.target.value))}>
            {COST.map((c, i) => (
              <option key={c} value={i}>
                {c}
              </option>
            ))}
          </select>
          <select aria-label="Time needed" className={smallSelect} value={duration} onChange={(e) => setDuration(e.target.value as DateIdea["duration"])}>
            {Object.entries(DURATION).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input className={`${inputCls} col-span-2`} placeholder="Where (optional)" aria-label="Location" value={location} onChange={(e) => setLocation(e.target.value)} />
          <input className={`${inputCls} col-span-2`} placeholder="Link (optional)" aria-label="Link" value={link} onChange={(e) => setLink(e.target.value)} />
          <input className={`${inputCls} col-span-2`} placeholder="Tags, e.g. Outdoors, Rainy day" aria-label="Tags" value={tags} onChange={(e) => setTags(e.target.value)} />
        </div>
      )}
    </form>
  );
}

function IdeaCardView({ d }: { d: Pick<DateIdea, "title" | "cost" | "duration" | "tags" | "location"> & { link?: string | null } }) {
  return (
    <>
      <b className="text-sm">{d.title}</b>
      <div className="mt-0.5">
        {[COST[d.cost], DURATION[d.duration], ...d.tags].map((t) => (
          <span key={t} className="mr-1 inline-block rounded-full bg-sunken px-2 py-px text-[10.5px] font-bold text-teak">
            {t}
          </span>
        ))}
      </div>
      {d.location && <p className="m-0 mt-0.5 text-xs text-ink-2">📍 {d.location}</p>}
    </>
  );
}

function IdeaCard({
  d,
  highlight,
  onPlan,
  onDone,
  onUnplan,
  onDelete,
}: {
  d: DateIdea;
  highlight?: boolean;
  onPlan: () => void;
  onDone: () => void;
  onUnplan?: () => void;
  onDelete: () => void;
}) {
  const { byUser } = usePeople();
  return (
    <div className={`mb-2 rounded-lg border bg-card p-2.5 transition-[transform,box-shadow] duration-200 ${highlight ? "scale-[1.02] border-brass shadow-[0_0_0_2px_#B8893B]" : "border-line"}`}>
      <IdeaCardView d={d} />
      {d.planned_for && <p className="m-0 mt-1 text-xs font-bold text-red-oxide">🗓 {dueLabel(d.planned_for, true)}</p>}
      {d.link && (
        <a href={d.link} target="_blank" rel="noopener noreferrer" className="text-xs underline">
          Link
        </a>
      )}
      <p className="m-0 text-[10.5px] text-ink-2">added by {byUser(d.created_by)?.display_name ?? "?"}</p>
      <div className="mt-1 flex flex-wrap gap-3">
        <button type="button" className={linkBtn} onClick={onPlan}>
          {d.status === "planned" ? "Reschedule" : "Schedule"}
        </button>
        <button type="button" className={linkBtn} onClick={onDone}>
          We did it ✓
        </button>
        {onUnplan && (
          <button type="button" className={linkBtn} onClick={onUnplan}>
            Back to wishlist
          </button>
        )}
        <button type="button" className={`${linkBtn} text-urgent`} onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}

/** Pick a date and time; adds an event to the Us calendar (or yours) when one is connected. */
function ScheduleSheet({ d, onClose }: { d: DateIdea; onClose: () => void }) {
  const qc = useQueryClient();
  const { me } = usePeople();
  const { data: sources } = useRows<CalendarSource>("calendar_sources");
  const m = useRowMutation<DateIdea>("date_ideas");
  const writable = live(sources).filter((s) => s.visible && ["owner", "writer"].includes(s.access_role));
  const preferred = writable.find((s) => s.is_us_calendar) ?? writable.find((s) => s.member_id === me?.id && s.is_primary) ?? null;
  const [day, setDay] = useState(() => torontoDayKey(new Date(Date.now() + 2 * 86_400_000)));
  const [time, setTime] = useState("19:00");
  const [toCal, setToCal] = useState(!!preferred);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    const [y, mo, dd] = day.split("-").map(Number);
    const [h, mi] = time.split(":").map(Number);
    const start = torontoToUtc(y, mo, dd, h, mi);
    const hours = HOURS[d.duration];
    setBusy(true);
    let eventId: string | null = null;
    if (toCal && preferred) {
      if (d.calendar_event_id && d.calendar_source_id) await callCalendar("event", { op: "delete", source_id: d.calendar_source_id, event_id: d.calendar_event_id }).catch(() => {});
      try {
        const r = await callCalendar<{ event_id: string }>("event", {
          op: "create",
          source_id: preferred.id,
          event: { summary: `💛 ${d.title}`, location: d.location, all_day: false, start: start.toISOString(), end: new Date(start.getTime() + hours * 3_600_000).toISOString() },
        });
        eventId = r.event_id;
        qc.invalidateQueries({ queryKey: rowsKey("calendar_event_cache") });
      } catch (e) {
        toast(`Saved, but couldn't add it to the calendar: ${(e as Error).message}`, { tone: "error" });
      }
    }
    m.update(d.id, { status: "planned", planned_for: start.toISOString(), calendar_event_id: eventId, calendar_source_id: eventId ? preferred!.id : null });
    toast(`Planned for ${formatToronto(start, { weekday: "long", hour: "numeric", minute: "2-digit" })}`);
    setBusy(false);
    onClose();
  };
  return (
    <div role="dialog" aria-label={`Schedule ${d.title}`} className="mt-3 rounded-lg border border-brass bg-card-warm p-3 text-sm">
      <p className="m-0 font-bold">When is “{d.title}”?</p>
      <div className="mt-2 flex gap-1.5">
        <input type="date" aria-label="Date" className={smallSelect} value={day} min={torontoDayKey(new Date())} onChange={(e) => setDay(e.target.value)} />
        <input type="time" aria-label="Time" className={smallSelect} value={time} onChange={(e) => setTime(e.target.value)} />
      </div>
      <BothFree
        d={d}
        picked={`${day}T${time}`}
        onPick={(start) => {
          setDay(torontoDayKey(start));
          setTime(formatToronto(start, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" }));
        }}
      />
      {preferred && (
        <label className="mt-1 flex min-h-11 items-center gap-2">
          <input type="checkbox" checked={toCal} onChange={(e) => setToCal(e.target.checked)} className="h-[18px] w-[18px] accent-red-oxide" />
          Add to {preferred.is_us_calendar ? "the Us calendar" : "my Google Calendar"}
        </label>
      )}
      <div className="mt-2 flex gap-2">
        <button type="button" className={addBtn} onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Plan it"}
        </button>
        <button type="button" className={linkBtn} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

const rate = (householdId: string, memoryId: string, memberId: string, rating: number) =>
  insertOrUpdate("date_ratings", { household_id: householdId, memory_id: memoryId, member_id: memberId, rating }, { memory_id: memoryId, member_id: memberId }, ["rating"]);

function MemoryForm({ d, onClose, onSaved }: { d: DateIdea; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const { me } = usePeople();
  const ideas = useRowMutation<DateIdea>("date_ideas");
  const [day, setDay] = useState(() => {
    const today = torontoDayKey(new Date());
    const planned = d.planned_for ? torontoDayKey(d.planned_for) : today;
    return planned < today ? planned : today;
  });
  const [note, setNote] = useState("");
  const [stars, setStars] = useState<number | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!me) return;
    setBusy(true);
    try {
      const photo_path = photo ? await uploadHouseholdFile(me.household_id, "memories", photo) : null;
      const id = crypto.randomUUID();
      const { error } = (await supabaseBrowser()?.from("date_memories").insert({ id, household_id: me.household_id, date_idea_id: d.id, title: d.title, happened_on: day, photo_path, memory_note: note.trim() || null })) ?? {};
      if (error) throw error;
      if (stars) await rate(me.household_id, id, me.id, stars);
      ideas.update(d.id, { status: "done" });
      qc.invalidateQueries({ queryKey: rowsKey("date_memories") });
      qc.invalidateQueries({ queryKey: rowsKey("date_ratings") });
      toast("Saved to your memories 💛");
      onSaved();
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    }
    setBusy(false);
  };
  return (
    <div role="dialog" aria-label={`Remember ${d.title}`} className="mt-3 space-y-2 rounded-lg border border-brass bg-card-warm p-3 text-sm">
      <p className="m-0 font-bold">How was “{d.title}”?</p>
      <input type="date" aria-label="When" className={smallSelect} value={day} max={torontoDayKey(new Date())} onChange={(e) => setDay(e.target.value)} />
      <div>
        <Stars value={stars} onChange={setStars} label="Your rating" />
      </div>
      <textarea rows={3} maxLength={2000} className="w-full rounded-lg border border-line-strong bg-card p-2" placeholder="A memory to keep…" aria-label="Memory note" value={note} onChange={(e) => setNote(e.target.value)} />
      <label className="flex min-h-11 items-center gap-2 text-xs">
        <span className="font-bold text-ink-2">Photo</span>
        <input type="file" accept="image/*" aria-label="Memory photo" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
      </label>
      <div className="flex gap-2">
        <button type="button" className={addBtn} onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save memory"}
        </button>
        <button type="button" className={linkBtn} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function Memories() {
  const { data: rows } = useRows<Memory>("date_memories");
  const list = live(rows);
  if (!list.length) return <p className="text-sm text-ink-2">Mark a date as done and it lands here, with a photo and both your ratings.</p>;
  return (
    <ol className="relative m-0 list-none border-l-2 border-callout-line p-0 pl-4">
      {list.map((mem) => (
        <MemoryItem key={mem.id} mem={mem} />
      ))}
    </ol>
  );
}

function MemoryItem({ mem }: { mem: Memory }) {
  const qc = useQueryClient();
  const { me, partner } = usePeople();
  const { data: ratings } = useRows<DateRating>("date_ratings");
  const { data: url } = useSignedUrl(FILES_BUCKET, mem.photo_path);
  const mine = (ratings ?? []).find((r) => r.memory_id === mem.id && r.member_id === me?.id);
  const theirs = (ratings ?? []).find((r) => r.memory_id === mem.id && r.member_id === partner?.id);
  return (
    <li className="relative mb-4">
      <span className="absolute top-1 -left-[23px] h-3 w-3 rounded-full border-2 border-paper bg-brass" aria-hidden="true" />
      <p className="m-0 text-[11px] font-bold text-ink-2">{formatDay(mem.happened_on, { month: "long", day: "numeric", year: "numeric" })}</p>
      <p className="m-0 font-serif text-base font-semibold">{mem.title}</p>
      {/* eslint-disable-next-line @next/next/no-img-element -- signed URL to a private photo */}
      {url && <img src={url} alt="" className="mt-1 max-h-48 w-full rounded-lg object-cover" />}
      {mem.memory_note && <p className="m-0 mt-1 text-sm">{mem.memory_note}</p>}
      <div className="mt-1 flex flex-wrap items-center gap-x-4 text-xs">
        <span className="flex items-center gap-1">
          <b>You</b>
          <Stars
            value={mine?.rating ?? null}
            label="Your rating"
            onChange={async (n) => {
              if (!me) return;
              await rate(me.household_id, mem.id, me.id, n).catch((e) => toast(e.message, { tone: "error" }));
              qc.invalidateQueries({ queryKey: rowsKey("date_ratings") });
            }}
          />
        </span>
        {partner && (
          <span className="flex items-center gap-1">
            <b>{partner.display_name}</b>
            <Stars value={theirs?.rating ?? null} label={`${partner.display_name}'s rating`} />
          </span>
        )}
      </div>
    </li>
  );
}

/** "You're both free": the next openings in both calendars that fit this date (two weeks ahead). */
function BothFree({ d, picked, onPick }: { d: DateIdea; picked: string; onPick: (start: Date) => void }) {
  const { me, partner } = usePeople();
  const { data: sources } = useRows<CalendarSource>("calendar_sources");
  const { data: events } = useRows<CachedEvent>("calendar_event_cache");
  const { data: dates } = useRows<DateIdea>("date_ideas");
  const { data: trips } = useRows<Trip>("trips");
  const [now] = useState(() => Date.now());
  const ours = live(sources).filter((s) => s.visible);
  const connected = new Set(ours.map((s) => s.member_id));
  if (!ours.length) return <p className="m-0 mt-2 text-xs text-ink-2">Connect your calendars in Settings and Veedu will suggest times you&apos;re both free.</p>;
  const busy = busyFromEvents(live(events), new Set(ours.map((s) => s.id)));
  // other planned dates count as busy too
  for (const x of live(dates)) if (x.id !== d.id && x.status === "planned" && x.planned_for) busy.push([Date.parse(x.planned_for), Date.parse(x.planned_for) + HOURS[x.duration] * 3_600_000]);
  const blocked = new Set<string>();
  for (const t of live(trips)) for (let day = t.starts_on; day <= t.ends_on; day = addDays(day, 1)) blocked.add(day);
  const slots = findFreeSlots({ busy, blockedDays: blocked, from: now + 60 * 60_000, durationHours: HOURS[d.duration] });
  const missing = [me, partner].filter((p) => p && !connected.has(p.id)).map((p) => (p!.id === me?.id ? "your" : `${p!.display_name}'s`));
  return (
    <div className="mt-2" aria-label="Times you're both free">
      <p className="m-0 mb-1 text-xs font-bold text-leaf">{missing.length ? "Free in the connected calendars" : "You're both free"}</p>
      {slots.length === 0 ? (
        <p className="m-0 text-xs text-ink-2">No opening that fits in the next two weeks. Pick a time yourself.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {slots.map((s) => {
            const key = `${s.day}T${formatToronto(s.start, { hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}`;
            return (
              <button
                key={s.day}
                type="button"
                aria-pressed={picked === key}
                onClick={() => onPick(s.start)}
                className={`min-h-9 rounded-full border px-3 text-xs font-bold ${picked === key ? "border-leaf bg-leaf text-white" : "border-ok-line bg-card text-leaf"}`}
              >
                {formatToronto(s.start, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </button>
            );
          })}
        </div>
      )}
      {missing.length > 0 && <p className="m-0 mt-1 text-[11px] text-ink-2">({missing.join(" and ")} calendar isn&apos;t connected, so it isn&apos;t checked.)</p>}
    </div>
  );
}
