"use client";

import { useState } from "react";
import { live, trashed, useRowMutation, useRows, type BaseRow } from "@/lib/lists/rows";
import { toast } from "@/lib/lists/toast";
import { FILES_BUCKET, uploadHouseholdFile, useSignedUrl } from "@/lib/files";
import { formatDay, formatToronto, torontoDayKey, torontoToUtc } from "@/lib/time";
import { addDays, daysBetween, packedPct, parseAmount } from "@/lib/trips";
import { Check, EmptyState, IconButton, Sec, Tabs, Trash, TrashIcon, WhoChip, addBtn, inputCls, linkBtn, smallSelect, usePeople } from "./ui";

export interface Trip extends BaseRow {
  title: string;
  destination: string | null;
  starts_on: string;
  ends_on: string;
  cover_path: string | null;
  budget_planned: number | null;
  currency: string;
  notes: string | null;
}
interface TripDay extends BaseRow {
  trip_id: string;
  day_date: string;
  at_time: string | null;
  title: string;
  notes: string | null;
}
type BookingKind = "flight" | "train" | "bus" | "hotel" | "car" | "activity" | "other";
interface Booking extends BaseRow {
  trip_id: string;
  kind: BookingKind;
  title: string;
  confirmation_no: string | null;
  starts_at: string | null;
  cost: number | null;
  attachment_path: string | null;
  attachment_name: string | null;
  notes: string | null;
}
interface Expense extends BaseRow {
  trip_id: string;
  title: string;
  amount: number;
  paid_by: string | null;
  spent_on: string | null;
}
export interface PackingItem extends BaseRow {
  trip_id: string;
  owner_id: string | null;
  title: string;
  packed: boolean;
}
interface PackingTemplate extends BaseRow {
  title: string;
  items: string[];
}

const KIND_ICON: Record<BookingKind, string> = { flight: "✈️", train: "🚆", bus: "🚌", hotel: "🏨", car: "🚗", activity: "🎟️", other: "📎" };
const STARTER_TEMPLATE = ["Passports / ID", "Phone chargers", "Toiletries", "Medication", "Sunscreen", "Rain jacket", "Comfortable shoes"];

const dayLabel = (day: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) => formatDay(day, opts);
const money = (n: number, cur: string) => new Intl.NumberFormat("en-CA", { style: "currency", currency: cur, maximumFractionDigits: n % 1 ? 2 : 0 }).format(n);
const num = parseAmount;

export function TripsRoom() {
  const { data: rows, isLoading } = useRows<Trip>("trips");
  const m = useRowMutation<Trip>("trips");
  const [open, setOpen] = useState<string | null>(null);
  const today = torontoDayKey(new Date());
  const trips = live(rows);
  const current = trips.find((t) => t.id === open);
  if (current) return <TripPage trip={current} onBack={() => setOpen(null)} />;
  const upcoming = trips.filter((t) => t.ends_on >= today);
  const past = trips.filter((t) => t.ends_on < today).reverse();
  return (
    <Sec title="Trips">
      <NewTrip onCreated={setOpen} />
      {!isLoading && trips.length === 0 && (
        <EmptyState
          title="Plan your first trip"
          hint="Each trip gets its own page: a day-by-day plan, bookings with confirmation numbers, a shared packing list and a budget. The boat lantern lights up when one is a month away."
          example={
            <div className="rounded-lg border border-[#e6d9c2] bg-white p-2.5">
              <TripCardView t={{ title: "Montréal long weekend", destination: "Montréal", starts_on: addDays(today, 21), ends_on: addDays(today, 24) }} today={today} />
            </div>
          }
        />
      )}
      {upcoming.map((t) => (
        <TripCard key={t.id} t={t} today={today} onOpen={() => setOpen(t.id)} />
      ))}
      {past.length > 0 && (
        <details className="mt-3">
          <summary className="min-h-11 cursor-pointer text-xs font-bold text-ink-2">Past trips ({past.length})</summary>
          {past.map((t) => (
            <TripCard key={t.id} t={t} today={today} onOpen={() => setOpen(t.id)} />
          ))}
        </details>
      )}
      <Trash rows={trashed(rows)} label={(r) => r.title} onRestore={m.restore} />
    </Sec>
  );
}

function TripCardView({ t, today, pct }: { t: Pick<Trip, "title" | "destination" | "starts_on" | "ends_on">; today: string; pct?: number | null }) {
  const away = daysBetween(today, t.starts_on);
  const when = away > 1 ? `in ${away} days` : away === 1 ? "tomorrow" : t.ends_on >= today ? "happening now 🌴" : "";
  return (
    <>
      <b className="font-serif text-base">{t.title}</b>
      <p className="m-0 text-xs text-ink-2">
        {[t.destination, `${dayLabel(t.starts_on, { month: "short", day: "numeric" })} – ${dayLabel(t.ends_on, { month: "short", day: "numeric", year: "numeric" })}`, when].filter(Boolean).join(" · ")}
      </p>
      {pct != null && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#efe4cf]" role="img" aria-label={`${Math.round(pct)}% packed`}>
          <div className="h-full bg-leaf" style={{ width: `${pct}%` }} />
        </div>
      )}
    </>
  );
}

function TripCard({ t, today, onOpen }: { t: Trip; today: string; onOpen: () => void }) {
  const { data: packing } = useRows<PackingItem>("packing_items");
  const { data: cover } = useSignedUrl(FILES_BUCKET, t.cover_path);
  return (
    <button type="button" onClick={onOpen} className="mb-2 block w-full overflow-hidden rounded-lg border border-[#e6d9c2] bg-white text-left">
      {/* eslint-disable-next-line @next/next/no-img-element -- signed URL to a private photo */}
      {cover && <img src={cover} alt="" className="h-24 w-full object-cover" />}
      <div className="p-2.5">
        <TripCardView t={t} today={today} pct={packedPct(packing ?? [], t.id)} />
      </div>
    </button>
  );
}

function NewTrip({ onCreated }: { onCreated: (id: string) => void }) {
  const { me } = usePeople();
  const m = useRowMutation<Trip>("trips");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [dest, setDest] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [budget, setBudget] = useState("");
  if (!open)
    return (
      <button type="button" className={`${addBtn} mb-2 w-full`} onClick={() => setOpen(true)}>
        + New trip
      </button>
    );
  const valid = title.trim() && from && to && to >= from;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !me) return;
    const id = m.insert({ household_id: me.household_id, title: title.trim().slice(0, 120), destination: dest.trim().slice(0, 120) || null, starts_on: from, ends_on: to, budget_planned: num(budget), currency: "CAD" });
    setOpen(false);
    onCreated(id);
  };
  return (
    <form onSubmit={submit} className="mb-3 grid grid-cols-2 gap-1.5 rounded-lg border border-brass bg-[#fffdf8] p-2.5">
      <input className={`${inputCls} col-span-2`} placeholder="Trip name, e.g. Kerala in March" aria-label="Trip name" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
      <input className={`${inputCls} col-span-2`} placeholder="Where (optional)" aria-label="Destination" maxLength={120} value={dest} onChange={(e) => setDest(e.target.value)} />
      <label className="text-[11px] font-bold text-ink-2">
        From
        <input type="date" className={`${smallSelect} w-full`} value={from} onChange={(e) => (setFrom(e.target.value), !to && setTo(e.target.value))} />
      </label>
      <label className="text-[11px] font-bold text-ink-2">
        To
        <input type="date" className={`${smallSelect} w-full`} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
      </label>
      <input className={`${inputCls} col-span-2`} inputMode="decimal" placeholder="Budget in CAD (optional)" aria-label="Budget" value={budget} onChange={(e) => setBudget(e.target.value)} />
      <div className="col-span-2 flex gap-2">
        <button type="submit" className={addBtn} disabled={!valid}>
          Create trip
        </button>
        <button type="button" className={linkBtn} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

type TripTab = "plan" | "bookings" | "packing" | "budget";

/** Rename a trip or change its dates. Moving the start date can carry the day-by-day plan along with it. */
function EditTrip({ trip, onDone }: { trip: Trip; onDone: () => void }) {
  const m = useRowMutation<Trip>("trips");
  const days = useRowMutation<TripDay>("trip_days");
  const { data: dayRows } = useRows<TripDay>("trip_days");
  const [title, setTitle] = useState(trip.title);
  const [dest, setDest] = useState(trip.destination ?? "");
  const [from, setFrom] = useState(trip.starts_on);
  const [to, setTo] = useState(trip.ends_on);
  const [shift, setShift] = useState(true);
  const plan = live(dayRows).filter((d) => d.trip_id === trip.id);
  const delta = from ? daysBetween(trip.starts_on, from) : 0;
  const valid = title.trim() && from && to && to >= from;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    m.update(trip.id, { title: title.trim().slice(0, 120), destination: dest.trim().slice(0, 120) || null, starts_on: from, ends_on: to });
    if (delta && shift) for (const d of plan) days.update(d.id, { day_date: addDays(d.day_date, delta) });
    toast("Trip updated");
    onDone();
  };
  // keep the same trip length when only the start moves
  const moveStart = (v: string) => {
    if (v && from && to) setTo(addDays(v, daysBetween(from, to)));
    setFrom(v);
  };
  return (
    <form onSubmit={submit} className="mb-1 grid grid-cols-2 gap-1.5">
      <input className={`${inputCls} col-span-2`} aria-label="Trip name" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
      <input className={`${inputCls} col-span-2`} placeholder="Where (optional)" aria-label="Destination" maxLength={120} value={dest} onChange={(e) => setDest(e.target.value)} />
      <label className="text-[11px] font-bold text-ink-2">
        From
        <input type="date" className={`${smallSelect} w-full`} value={from} onChange={(e) => moveStart(e.target.value)} />
      </label>
      <label className="text-[11px] font-bold text-ink-2">
        To
        <input type="date" className={`${smallSelect} w-full`} value={to} min={from} onChange={(e) => setTo(e.target.value)} />
      </label>
      {delta !== 0 && plan.length > 0 && (
        <label className="col-span-2 flex min-h-11 items-center gap-2 text-xs">
          <input type="checkbox" checked={shift} onChange={(e) => setShift(e.target.checked)} className="h-[18px] w-[18px] accent-red-oxide" />
          Move the day-by-day plan {Math.abs(delta)} day{Math.abs(delta) > 1 ? "s" : ""} {delta > 0 ? "later" : "earlier"} too
        </label>
      )}
      <div className="col-span-2 flex gap-2">
        <button type="submit" className={addBtn} disabled={!valid}>
          Save
        </button>
        <button type="button" className={linkBtn} onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function TripPage({ trip, onBack }: { trip: Trip; onBack: () => void }) {
  const { me } = usePeople();
  const m = useRowMutation<Trip>("trips");
  const { data: cover } = useSignedUrl(FILES_BUCKET, trip.cover_path);
  const [tab, setTab] = useState<TripTab>("plan");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const today = torontoDayKey(new Date());
  const setCover = async (f: File | undefined) => {
    if (!f || !me) return;
    setBusy(true);
    try {
      m.update(trip.id, { cover_path: await uploadHouseholdFile(me.household_id, "trips", f) });
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    }
    setBusy(false);
  };
  return (
    <>
      <button type="button" className={linkBtn} onClick={onBack}>
        ← All trips
      </button>
      <div className="relative mb-2 overflow-hidden rounded-lg border border-[#e6d9c2] bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed URL to a private photo */}
        {cover && <img src={cover} alt="" className="h-32 w-full object-cover" />}
        <div className="p-2.5">
          {editing ? <EditTrip trip={trip} onDone={() => setEditing(false)} /> : <TripCardView t={trip} today={today} />}
          <div className="flex flex-wrap gap-3">
            {!editing && (
              <button type="button" className={linkBtn} onClick={() => setEditing(true)}>
                Edit name and dates
              </button>
            )}
            <label className={`${linkBtn} flex cursor-pointer items-center`}>
              {busy ? "Uploading…" : cover ? "Change cover photo" : "Add a cover photo"}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => setCover(e.target.files?.[0])} />
            </label>
            <button type="button" className={`${linkBtn} text-urgent`} onClick={() => (m.remove(trip.id, `Removed “${trip.title}”`), onBack())}>
              Delete trip
            </button>
          </div>
        </div>
      </div>
      <Tabs
        label="Trip sections"
        value={tab}
        onChange={setTab}
        tabs={[
          ["plan", "Plan"],
          ["bookings", "Bookings"],
          ["packing", "Packing"],
          ["budget", "Budget"],
        ]}
      />
      {tab === "plan" && <Itinerary trip={trip} />}
      {tab === "bookings" && <Bookings trip={trip} />}
      {tab === "packing" && <Packing trip={trip} />}
      {tab === "budget" && <Budget trip={trip} />}
    </>
  );
}

function Itinerary({ trip }: { trip: Trip }) {
  const { data: rows } = useRows<TripDay>("trip_days");
  const m = useRowMutation<TripDay>("trip_days");
  const items = live(rows).filter((d) => d.trip_id === trip.id);
  const n = Math.min(daysBetween(trip.starts_on, trip.ends_on), 60);
  const days = Array.from({ length: n + 1 }, (_, i) => addDays(trip.starts_on, i));
  const outside = items.filter((x) => x.day_date < trip.starts_on || x.day_date > days[days.length - 1]);
  return (
    <Sec title="Day by day">
      {days.map((day, i) => {
        const list = items.filter((x) => x.day_date === day).sort((a, b) => (a.at_time ?? "99") < (b.at_time ?? "99") ? -1 : 1);
        return (
          <div key={day} className="mb-3">
            <p className="m-0 text-xs font-bold text-teak">
              Day {i + 1} · {dayLabel(day)}
            </p>
            {list.map((x) => (
              <div key={x.id} className="flex items-center gap-2 border-b border-dashed border-[#e6d9c2] py-1 text-sm">
                <span className="w-12 flex-none text-xs text-ink-2">{x.at_time ? x.at_time.slice(0, 5) : ""}</span>
                <span className="flex-1">{x.title}</span>
                <IconButton label={`Delete ${x.title}`} onClick={() => m.remove(x.id, `Removed “${x.title}”`)}>
                  <TrashIcon />
                </IconButton>
              </div>
            ))}
            <AddPlanItem trip={trip} day={day} />
          </div>
        );
      })}
      {outside.length > 0 && (
        <div className="mb-3 rounded-lg border border-dashed border-[#e7b2a8] bg-[#fdf0ec] p-2">
          <p className="m-0 text-xs font-bold text-urgent">Not on the trip&apos;s dates any more</p>
          {outside.map((x) => (
            <div key={x.id} className="flex items-center gap-2 py-1 text-sm">
              <span className="flex-1">
                {x.title} <span className="text-[11px] text-ink-2">· was {dayLabel(x.day_date)}</span>
              </span>
              <select aria-label={`Move ${x.title} to a day`} className={smallSelect} value="" onChange={(e) => e.target.value && m.update(x.id, { day_date: e.target.value })}>
                <option value="">Move to…</option>
                {days.map((d, i) => (
                  <option key={d} value={d}>
                    Day {i + 1} · {dayLabel(d)}
                  </option>
                ))}
              </select>
              <IconButton label={`Delete ${x.title}`} onClick={() => m.remove(x.id, `Removed “${x.title}”`)}>
                <TrashIcon />
              </IconButton>
            </div>
          ))}
        </div>
      )}
      <Trash rows={trashed(rows).filter((d) => d.trip_id === trip.id)} label={(r) => r.title} onRestore={m.restore} />
    </Sec>
  );
}

function AddPlanItem({ trip, day }: { trip: Trip; day: string }) {
  const m = useRowMutation<TripDay>("trip_days");
  const [title, setTitle] = useState("");
  const [time, setTime] = useState("");
  return (
    <form
      className="mt-1 flex gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        m.insert({ household_id: trip.household_id, trip_id: trip.id, day_date: day, at_time: time || null, title: title.trim().slice(0, 160) });
        setTitle("");
        setTime("");
      }}
    >
      <input type="time" aria-label={`Time on ${dayLabel(day)}`} className={`${smallSelect} w-24 flex-none`} value={time} onChange={(e) => setTime(e.target.value)} />
      <input className={inputCls} placeholder="Add to this day…" aria-label={`Plan for ${dayLabel(day)}`} maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} />
    </form>
  );
}

function Bookings({ trip }: { trip: Trip }) {
  const { data: rows } = useRows<Booking>("trip_bookings");
  const m = useRowMutation<Booking>("trip_bookings");
  const list = live(rows)
    .filter((b) => b.trip_id === trip.id)
    .sort((a, b) => (a.starts_at ?? "~") < (b.starts_at ?? "~") ? -1 : 1);
  return (
    <Sec title="Bookings">
      <AddBooking trip={trip} />
      {list.length === 0 && <p className="text-sm text-ink-2">Flights, hotels, tickets. Keep the confirmation number and the PDF here so neither of you has to dig through email.</p>}
      {list.map((b) => (
        <BookingCard key={b.id} b={b} trip={trip} onDelete={() => m.remove(b.id, `Removed “${b.title}”`)} />
      ))}
      <Trash rows={trashed(rows).filter((b) => b.trip_id === trip.id)} label={(r) => r.title} onRestore={m.restore} />
    </Sec>
  );
}

function BookingCard({ b, trip, onDelete }: { b: Booking; trip: Trip; onDelete: () => void }) {
  const { data: url } = useSignedUrl(FILES_BUCKET, b.attachment_path);
  return (
    <div className="mb-2 rounded-lg border border-[#e6d9c2] bg-white p-2.5 text-sm">
      <div className="flex items-start gap-2">
        <span aria-hidden="true">{KIND_ICON[b.kind]}</span>
        <div className="min-w-0 flex-1">
          <b>{b.title}</b>
          {b.starts_at && <p className="m-0 text-xs text-ink-2">{formatToronto(b.starts_at, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p>}
          {b.confirmation_no && (
            <p className="m-0 mt-0.5 flex items-center gap-2 text-xs">
              Confirmation <code className="rounded bg-[#f3ead9] px-1.5 py-0.5 font-bold tracking-wider">{b.confirmation_no}</code>
              <button
                type="button"
                className={linkBtn}
                onClick={() => navigator.clipboard?.writeText(b.confirmation_no!).then(() => toast("Copied"), () => toast("Couldn't copy", { tone: "error" }))}
              >
                Copy
              </button>
            </p>
          )}
          {b.cost != null && <p className="m-0 text-xs text-ink-2">{money(b.cost, trip.currency)}</p>}
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold underline">
              📄 {b.attachment_name ?? "Attachment"}
            </a>
          )}
        </div>
        <IconButton label={`Delete ${b.title}`} onClick={onDelete}>
          <TrashIcon />
        </IconButton>
      </div>
    </div>
  );
}

function AddBooking({ trip }: { trip: Trip }) {
  const m = useRowMutation<Booking>("trip_bookings");
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<BookingKind>("flight");
  const [title, setTitle] = useState("");
  const [conf, setConf] = useState("");
  const [day, setDay] = useState(trip.starts_on);
  const [time, setTime] = useState("");
  const [cost, setCost] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  if (!open)
    return (
      <button type="button" className={`${addBtn} mb-2`} onClick={() => setOpen(true)}>
        + Add a booking
      </button>
    );
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      const attachment_path = file ? await uploadHouseholdFile(trip.household_id, "bookings", file) : null;
      let starts_at: string | null = null;
      if (day) {
        const [y, mo, d] = day.split("-").map(Number);
        const [h, mi] = (time || "12:00").split(":").map(Number);
        starts_at = torontoToUtc(y, mo, d, h, mi).toISOString();
      }
      m.insert({
        household_id: trip.household_id,
        trip_id: trip.id,
        kind,
        title: title.trim().slice(0, 160),
        confirmation_no: conf.trim().slice(0, 60) || null,
        starts_at,
        cost: num(cost),
        attachment_path,
        attachment_name: file ? file.name.slice(0, 160) : null,
      });
      setOpen(false);
      setTitle("");
      setConf("");
      setCost("");
      setFile(null);
    } catch (err) {
      toast((err as Error).message, { tone: "error" });
    }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="mb-3 grid grid-cols-2 gap-1.5 rounded-lg border border-brass bg-[#fffdf8] p-2.5">
      <select aria-label="Type" className={smallSelect} value={kind} onChange={(e) => setKind(e.target.value as BookingKind)}>
        {Object.entries(KIND_ICON).map(([k, icon]) => (
          <option key={k} value={k}>
            {icon} {k[0].toUpperCase() + k.slice(1)}
          </option>
        ))}
      </select>
      <input className={inputCls} inputMode="decimal" placeholder="Cost" aria-label="Cost" value={cost} onChange={(e) => setCost(e.target.value)} />
      <input className={`${inputCls} col-span-2`} placeholder="e.g. AC 870 to Kochi" aria-label="Booking" maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} />
      <input className={`${inputCls} col-span-2`} placeholder="Confirmation number" aria-label="Confirmation number" maxLength={60} autoCapitalize="characters" value={conf} onChange={(e) => setConf(e.target.value)} />
      <input type="date" aria-label="Date" className={smallSelect} value={day} onChange={(e) => setDay(e.target.value)} />
      <input type="time" aria-label="Time" className={smallSelect} value={time} onChange={(e) => setTime(e.target.value)} />
      <label className="col-span-2 flex min-h-11 items-center gap-2 text-xs">
        <span className="font-bold text-ink-2">Ticket / PDF</span>
        <input type="file" accept="application/pdf,image/*" aria-label="Attachment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      <div className="col-span-2 flex gap-2">
        <button type="submit" className={addBtn} disabled={!title.trim() || busy}>
          {busy ? "Saving…" : "Save booking"}
        </button>
        <button type="button" className={linkBtn} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function Packing({ trip }: { trip: Trip }) {
  const { me, partner, members } = usePeople();
  const { data: rows } = useRows<PackingItem>("packing_items");
  const { data: tplRows } = useRows<PackingTemplate>("packing_templates");
  const m = useRowMutation<PackingItem>("packing_items");
  const tpl = useRowMutation<PackingTemplate>("packing_templates");
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState<string>("shared");
  const items = live(rows).filter((p) => p.trip_id === trip.id);
  const templates = live(tplRows);
  const pct = packedPct(items, trip.id);
  const groups: [string, string | null][] = [["Shared", null], ...[me, partner].filter(Boolean).map((p) => [p!.id === me?.id ? "Mine" : p!.display_name, p!.id] as [string, string])];
  const applyTemplate = (items_: string[]) => {
    const have = new Set(items.filter((p) => p.owner_id === null).map((p) => p.title.toLowerCase()));
    let n = 0;
    for (const t of items_) {
      if (have.has(t.toLowerCase())) continue;
      m.insert({ household_id: trip.household_id, trip_id: trip.id, owner_id: null, title: t, packed: false });
      n++;
    }
    toast(n ? `Added ${n} item${n > 1 ? "s" : ""}` : "Everything's already on the list");
  };
  return (
    <Sec title={pct === null ? "Packing" : `Packing · ${Math.round(pct)}% packed`}>
      {pct !== null && (
        <div className="mb-2 h-2 overflow-hidden rounded-full bg-[#efe4cf]" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Packed">
          <div className="h-full bg-leaf transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      )}
      <form
        className="mb-2 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          m.insert({ household_id: trip.household_id, trip_id: trip.id, owner_id: owner === "shared" ? null : owner, title: title.trim().slice(0, 120), packed: false });
          setTitle("");
        }}
      >
        <input className={inputCls} placeholder="Add something to pack…" aria-label="Packing item" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
        <select aria-label="Whose" className={`${smallSelect} flex-none`} value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="shared">Shared</option>
          {members.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id === me?.id ? "Mine" : p.display_name}
            </option>
          ))}
        </select>
      </form>
      {groups.map(([label, id]) => {
        const list = items.filter((p) => p.owner_id === id);
        if (!list.length) return null;
        return (
          <div key={label} className="mb-2">
            <p className="m-0 flex items-center gap-1 text-[11px] font-bold tracking-wider text-ink-2 uppercase">
              {label} {id && <WhoChip memberId={id} small />}
            </p>
            {list.map((p) => (
              <div key={p.id} className="flex items-center gap-1 border-b border-dashed border-[#e6d9c2]">
                <Check checked={p.packed} onChange={(v) => m.update(p.id, { packed: v })} label={p.title} />
                <span className={`flex-1 text-sm ${p.packed ? "text-ink-2 line-through" : ""}`}>{p.title}</span>
                <IconButton label={`Delete ${p.title}`} onClick={() => m.remove(p.id, `Removed “${p.title}”`)}>
                  <TrashIcon />
                </IconButton>
              </div>
            ))}
          </div>
        );
      })}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <select
          aria-label="Use a packing template"
          className={smallSelect}
          value=""
          onChange={(e) => {
            const v = e.target.value;
            if (v === "starter") applyTemplate(STARTER_TEMPLATE);
            else {
              const t = templates.find((x) => x.id === v);
              if (t) applyTemplate(t.items);
            }
          }}
        >
          <option value="">Use a template…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title} ({t.items.length})
            </option>
          ))}
          <option value="starter">Starter list</option>
        </select>
        {items.some((p) => p.owner_id === null) && (
          <button
            type="button"
            className={linkBtn}
            onClick={() => {
              const name = window.prompt("Name this template", trip.destination ? `${trip.destination} trip` : "Weekend away");
              if (!name?.trim()) return;
              tpl.insert({ household_id: trip.household_id, title: name.trim().slice(0, 80), items: [...new Set(items.filter((p) => p.owner_id === null).map((p) => p.title))].slice(0, 200) });
              toast("Saved as a template");
            }}
          >
            Save shared list as a template
          </button>
        )}
        {items.some((p) => p.packed) && (
          <button type="button" className={linkBtn} onClick={() => items.filter((p) => p.packed).forEach((p) => m.update(p.id, { packed: false }))}>
            Unpack all
          </button>
        )}
      </div>
      {templates.length > 0 && (
        <details className="mt-1">
          <summary className="min-h-11 cursor-pointer text-xs font-bold text-ink-2">Manage templates</summary>
          {templates.map((t) => (
            <div key={t.id} className="flex items-center justify-between text-sm">
              {t.title}
              <IconButton label={`Delete template ${t.title}`} onClick={() => tpl.remove(t.id, `Removed template “${t.title}”`)}>
                <TrashIcon />
              </IconButton>
            </div>
          ))}
        </details>
      )}
    </Sec>
  );
}

function Budget({ trip }: { trip: Trip }) {
  const { me, members, byId } = usePeople();
  const tm = useRowMutation<Trip>("trips");
  const { data: rows } = useRows<Expense>("trip_expenses");
  const { data: bookings } = useRows<Booking>("trip_bookings");
  const m = useRowMutation<Expense>("trip_expenses");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [paidBy, setPaidBy] = useState("");
  const [planned, setPlanned] = useState(trip.budget_planned?.toString() ?? "");
  const expenses = live(rows).filter((x) => x.trip_id === trip.id);
  const booked = live(bookings).filter((b) => b.trip_id === trip.id && b.cost != null);
  const bookedSum = booked.reduce((s, b) => s + Number(b.cost), 0);
  const spentSum = expenses.reduce((s, x) => s + Number(x.amount), 0);
  const total = bookedSum + spentSum;
  const plan = trip.budget_planned != null ? Number(trip.budget_planned) : null;
  const over = plan != null && total > plan;
  const cur = trip.currency;
  return (
    <Sec title="Budget">
      <div className="mb-2 rounded-lg border border-[#e6d9c2] bg-white p-2.5 text-sm">
        <div className="flex justify-between">
          <span>Bookings</span>
          <b>{money(bookedSum, cur)}</b>
        </div>
        <div className="flex justify-between">
          <span>Spent there</span>
          <b>{money(spentSum, cur)}</b>
        </div>
        <div className="mt-1 flex justify-between border-t border-[#e6d9c2] pt-1">
          <span>Total {plan != null && <>of {money(plan, cur)} planned</>}</span>
          <b className={over ? "text-urgent" : ""}>{money(total, cur)}</b>
        </div>
        {plan != null && plan > 0 && (
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-[#efe4cf]" role="img" aria-label={`${Math.round((100 * total) / plan)}% of budget used`}>
            <div className={`h-full ${over ? "bg-urgent" : "bg-brass"}`} style={{ width: `${Math.min(100, (100 * total) / plan)}%` }} />
          </div>
        )}
        <form
          className="mt-2 flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            tm.update(trip.id, { budget_planned: num(planned) });
            toast("Budget updated");
          }}
        >
          <input className={inputCls} inputMode="decimal" aria-label={`Planned budget in ${cur}`} placeholder={`Planned budget (${cur})`} value={planned} onChange={(e) => setPlanned(e.target.value)} />
          <button type="submit" className={addBtn}>
            Set
          </button>
        </form>
      </div>
      <form
        className="mb-2 grid grid-cols-[1fr_auto_auto] gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const a = num(amount);
          if (!title.trim() || a === null) return;
          m.insert({ household_id: trip.household_id, trip_id: trip.id, title: title.trim().slice(0, 120), amount: a, paid_by: paidBy || me?.id || null, spent_on: torontoDayKey(new Date()) });
          setTitle("");
          setAmount("");
        }}
      >
        <input className={`${inputCls} col-span-3`} placeholder="Add an expense, e.g. Dinner in the Old Port" aria-label="Expense" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className={`${inputCls} w-full`} inputMode="decimal" placeholder="Amount" aria-label="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <select aria-label="Paid by" className={smallSelect} value={paidBy || me?.id || ""} onChange={(e) => setPaidBy(e.target.value)}>
          {members.map((p) => (
            <option key={p.id} value={p.id}>
              {p.id === me?.id ? "I paid" : `${p.display_name} paid`}
            </option>
          ))}
        </select>
        <button type="submit" className={addBtn} disabled={!title.trim() || num(amount) === null}>
          Add
        </button>
      </form>
      {[...booked.map((b) => ({ key: `b:${b.id}`, title: `${KIND_ICON[b.kind]} ${b.title}`, amount: Number(b.cost), who: null as string | null, del: null as null | (() => void) })), ...expenses.map((x) => ({ key: x.id, title: x.title, amount: Number(x.amount), who: x.paid_by, del: () => m.remove(x.id, `Removed “${x.title}”`) }))].map((r) => (
        <div key={r.key} className="flex items-center gap-2 border-b border-dashed border-[#e6d9c2] py-1 text-sm">
          <span className="flex-1">
            {r.title}
            {r.who && <span className="ml-1 text-[11px] text-ink-2">· {byId(r.who)?.display_name}</span>}
          </span>
          <b>{money(r.amount, cur)}</b>
          {r.del ? (
            <IconButton label={`Delete ${r.title}`} onClick={r.del}>
              <TrashIcon />
            </IconButton>
          ) : (
            <span className="w-11" />
          )}
        </div>
      ))}
      <Trash rows={trashed(rows).filter((x) => x.trip_id === trip.id)} label={(r) => r.title} onRestore={m.restore} />
    </Sec>
  );
}
