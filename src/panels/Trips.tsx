"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { FILES_BUCKET, uploadHouseholdFile, useSignedUrl } from "@/lib/files";
import { INSTANCE } from "@/lib/instance";
import { live, rowsKey, trashed, useRowMutation, useRows, type BaseRow } from "@/lib/lists/rows";
import { toast } from "@/lib/lists/toast";
import {
  EXTRAS,
  LABEL_PRESETS,
  TRANSPORTS,
  VIBES,
  learnFromEdit,
  learnFromTrip,
  planPackingSync,
  seasonGuess,
  suggestPacking,
  tripDays,
  tripLength,
  type Extra,
  type PackingProfile,
  type Transport,
  type Vibe,
  type VibeLearning,
  type Weather,
} from "@/lib/packing";
import { parsePlanText } from "@/lib/planText";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { formatDay, formatToronto, torontoDayKey, torontoToUtc } from "@/lib/time";
import { addDays, daysBetween, packedPct, parseAmount } from "@/lib/trips";
import { fetchForecast, findPlace, weatherIcon } from "@/lib/weather";
import {
  EmptyState,
  IconButton,
  Sec,
  Trash,
  TrashIcon,
  addBtn,
  inputCls,
  linkBtn,
  smallSelect,
  usePeople,
} from "./ui";

export interface Trip extends BaseRow {
  title: string;
  destination: string | null;
  starts_on: string;
  ends_on: string;
  cover_path: string | null;
  budget_planned: number | null;
  currency: string;
  notes: string | null;
  vibe: Vibe | null;
  transport: Transport | null;
  extras: Extra[];
  dest_lat: number | null;
  dest_lng: number | null;
  dest_place: string | null;
  feedback_by: string[];
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
  qty: number;
  packed_count: number;
  rule_key: string | null;
  suggested_qty: number | null;
  edited: boolean;
  reason: string | null;
  category: string | null;
}
interface TripIdea extends BaseRow {
  title: string;
  destination: string | null;
  vibe: Vibe | null;
  notes: string | null;
}
interface ProfileRow extends PackingProfile {
  household_id: string;
  labels: { dressy?: string; casual?: string };
  vibes: Partial<Record<Vibe, VibeLearning>>;
  deleted_at: null;
  id?: string;
}

const KIND_ICON: Record<BookingKind, string> = {
  flight: "✈️",
  train: "🚆",
  bus: "🚌",
  hotel: "🏨",
  car: "🚗",
  activity: "🎟️",
  other: "📎",
};
const dayLabel = (
  day: string,
  opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" },
) => formatDay(day, opts);
const money = (n: number, cur: string) =>
  new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: cur,
    maximumFractionDigits: n % 1 ? 2 : 0,
  }).format(n);
const num = parseAmount;
const chip = (on: boolean) =>
  `min-h-10 rounded-full border px-3 text-sm font-bold ${on ? "border-teak bg-teak text-white" : "border-[#e0d2b8] bg-white text-ink"}`;

// ======================================================================
// The room: trips, ideas, and anything shared into Veedu
// ======================================================================

export function TripsRoom() {
  const { data: rows, isLoading } = useRows<Trip>("trips");
  const m = useRowMutation<Trip>("trips");
  const [open, setOpen] = useState<string | null>(null);
  const [planning, setPlanning] = useState<{ idea?: TripIdea } | null>(null);
  const today = torontoDayKey(new Date());
  const trips = live(rows);
  const current = trips.find((t) => t.id === open);
  if (current) return <TripPage trip={current} onBack={() => setOpen(null)} onOpen={setOpen} />;
  const upcoming = trips.filter((t) => t.ends_on >= today);
  const past = trips.filter((t) => t.ends_on < today).reverse();
  return (
    <>
      <SharedFiles trips={upcoming.length ? upcoming : trips} />
      <Sec title="Trips">
        {planning ? (
          <NewTrip
            idea={planning.idea}
            onCancel={() => setPlanning(null)}
            onCreated={(id) => {
              setPlanning(null);
              setOpen(id);
            }}
          />
        ) : (
          <button type="button" className={`${addBtn} mb-2 w-full`} onClick={() => setPlanning({})}>
            + Plan a trip
          </button>
        )}
        {!isLoading && trips.length === 0 && !planning && (
          <EmptyState
            title="Plan your first trip"
            hint="Pick the dates and the vibe, and Veedu makes the packing list for each of you, checks the weather, and keeps the plan, bookings and budget on one page. The boat lantern lights up when a trip is a month away."
          />
        )}
        {upcoming.map((t) => (
          <TripCard key={t.id} t={t} today={today} onOpen={() => setOpen(t.id)} />
        ))}
        {past.length > 0 && (
          <details className="mt-3">
            <summary className="min-h-11 cursor-pointer text-xs font-bold text-ink-2">
              Past trips ({past.length})
            </summary>
            {past.map((t) => (
              <TripCard key={t.id} t={t} today={today} onOpen={() => setOpen(t.id)} />
            ))}
          </details>
        )}
        <Trash rows={trashed(rows)} label={(r) => r.title} onRestore={m.restore} />
      </Sec>
      <Ideas onPlan={(idea) => setPlanning({ idea })} />
    </>
  );
}

/** "Share → Veedu" a ticket or screenshot: pick the trip it belongs to. */
function SharedFiles({ trips }: { trips: Trip[] }) {
  const m = useRowMutation<Booking>("trip_bookings");
  const [files, setFiles] = useState<{ path: string; name: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const raw = q.get("shared");
    const err = q.get("shared_error");
    if (!raw && !err) return;
    try {
      const parsed = raw ? (JSON.parse(raw) as { path: string; name: string }[]) : [];
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from the share redirect
      setFiles(
        parsed
          .filter(
            (f) =>
              typeof f.path === "string" &&
              /^[0-9a-f-]{36}\/bookings\/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$/.test(f.path),
          )
          .slice(0, 5),
      );
    } catch {
      setFiles([]);
    }
    setError(err);
    history.replaceState(null, "", location.pathname);
  }, []);
  if (!files?.length && !error) return null;
  const today = torontoDayKey(new Date());
  // the trip that's on now, else the next one
  const sorted = [...trips].sort(
    (a, b) =>
      (a.ends_on < today ? 1 : 0) - (b.ends_on < today ? 1 : 0) ||
      (a.starts_on < b.starts_on ? -1 : 1),
  );
  const attach = (t: Trip) => {
    for (const f of files ?? [])
      m.insert({
        household_id: t.household_id,
        trip_id: t.id,
        kind: "other",
        title: f.name.replace(/\.[a-z0-9]+$/i, ""),
        attachment_path: f.path,
        attachment_name: f.name,
      });
    toast(`Attached to “${t.title}”`);
    setFiles(null);
    setError(null);
  };
  return (
    <div role="status" className="mb-3 rounded-lg border border-brass bg-[#fffdf8] p-3 text-sm">
      {error && <p className="m-0 mb-1 text-urgent">{error}</p>}
      {files && files.length > 0 && (
        <>
          <p className="m-0 font-bold">
            📎 {files.length === 1 ? files[0].name : `${files.length} files`} — which trip is it
            for?
          </p>
          {sorted.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sorted.slice(0, 6).map((t) => (
                <button key={t.id} type="button" className={chip(false)} onClick={() => attach(t)}>
                  {t.vibe ? VIBES[t.vibe].icon : "🧳"} {t.title}
                </button>
              ))}
            </div>
          ) : (
            <p className="m-0 mt-1 text-ink-2">Plan the trip first, then share the file again.</p>
          )}
        </>
      )}
      <button type="button" className={linkBtn} onClick={() => (setFiles(null), setError(null))}>
        Dismiss
      </button>
    </div>
  );
}

function TripCardView({
  t,
  today,
  pct,
}: {
  t: Pick<Trip, "title" | "destination" | "starts_on" | "ends_on" | "vibe" | "dest_place">;
  today: string;
  pct?: number | null;
}) {
  const away = daysBetween(today, t.starts_on);
  const when =
    away > 1
      ? `in ${away} days`
      : away === 1
        ? "tomorrow"
        : t.ends_on >= today
          ? "happening now 🌴"
          : "";
  const { nights } = tripLength(t.starts_on, t.ends_on);
  return (
    <>
      <b className="font-serif text-base">
        {t.vibe && <span aria-hidden="true">{VIBES[t.vibe].icon} </span>}
        {t.title}
      </b>
      <p className="m-0 text-xs text-ink-2">
        {[
          t.dest_place ?? t.destination,
          `${dayLabel(t.starts_on, { month: "short", day: "numeric" })} – ${dayLabel(t.ends_on, { month: "short", day: "numeric", year: "numeric" })}`,
          nights ? `${nights} night${nights > 1 ? "s" : ""}` : "day trip",
          when,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      {pct != null && (
        <div
          className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#efe4cf]"
          role="img"
          aria-label={`${Math.round(pct)}% packed`}
        >
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
    <button
      type="button"
      onClick={onOpen}
      className="mb-2 block w-full overflow-hidden rounded-lg border border-[#e6d9c2] bg-white text-left"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- signed URL to a private photo */}
      {cover && <img src={cover} alt="" className="h-24 w-full object-cover" />}
      <div className="p-2.5">
        <TripCardView t={t} today={today} pct={packedPct(packing ?? [], t.id)} />
      </div>
    </button>
  );
}

// ======================================================================
// Planning a trip: one screen
// ======================================================================

function TripOptions({
  vibe,
  setVibe,
  transport,
  setTransport,
  extras,
  setExtras,
}: {
  vibe: Vibe | null;
  setVibe: (v: Vibe) => void;
  transport: Transport | null;
  setTransport: (t: Transport | null) => void;
  extras: Extra[];
  setExtras: (e: Extra[]) => void;
}) {
  return (
    <>
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-1 text-[11px] font-bold tracking-wider text-ink-2 uppercase">
          The vibe
        </legend>
        <div className="grid grid-cols-2 gap-1.5">
          {(Object.keys(VIBES) as Vibe[]).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={vibe === v}
              onClick={() => setVibe(v)}
              className={`rounded-lg border p-2 text-left ${vibe === v ? "border-teak bg-[#f3ead9]" : "border-[#e0d2b8] bg-white"}`}
            >
              <span className="block text-sm font-bold">
                {VIBES[v].icon} {VIBES[v].label}
              </span>
              <span className="block text-[11px] text-ink-2">{VIBES[v].hint}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-1 text-[11px] font-bold tracking-wider text-ink-2 uppercase">
          Getting there
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(TRANSPORTS) as Transport[]).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={transport === t}
              onClick={() => setTransport(transport === t ? null : t)}
              className={chip(transport === t)}
            >
              {TRANSPORTS[t].icon} {TRANSPORTS[t].label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="m-0 border-0 p-0">
        <legend className="mb-1 text-[11px] font-bold tracking-wider text-ink-2 uppercase">
          Any of these? (optional)
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(EXTRAS) as Extra[]).map((e) => {
            const on = extras.includes(e);
            return (
              <button
                key={e}
                type="button"
                aria-pressed={on}
                onClick={() => setExtras(on ? extras.filter((x) => x !== e) : [...extras, e])}
                className={chip(on)}
              >
                {EXTRAS[e].icon} {EXTRAS[e].label}
              </button>
            );
          })}
        </div>
      </fieldset>
    </>
  );
}

/** Look up the destination's coordinates (for the weather) without holding up the save. */
function locate(
  id: string,
  destination: string | null,
  update: (id: string, patch: Partial<Trip>) => void,
) {
  if (!destination?.trim()) return update(id, { dest_lat: null, dest_lng: null, dest_place: null });
  findPlace(destination).then((p) =>
    update(
      id,
      p
        ? { dest_lat: p.lat, dest_lng: p.lng, dest_place: p.label }
        : { dest_lat: null, dest_lng: null, dest_place: null },
    ),
  );
}

function NewTrip({
  idea,
  onCreated,
  onCancel,
}: {
  idea?: TripIdea;
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const { me } = usePeople();
  const m = useRowMutation<Trip>("trips");
  const ideas = useRowMutation<TripIdea>("trip_ideas");
  const [title, setTitle] = useState(idea?.title ?? "");
  const [dest, setDest] = useState(idea?.destination ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [vibe, setVibe] = useState<Vibe | null>(idea?.vibe ?? null);
  const [transport, setTransport] = useState<Transport | null>(null);
  const [extras, setExtras] = useState<Extra[]>([]);
  const valid = !!title.trim() && !!from && !!to && to >= from && !!vibe;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || !me) return;
    const destination = dest.trim().slice(0, 120) || null;
    const id = m.insert({
      household_id: me.household_id,
      title: title.trim().slice(0, 120),
      destination,
      starts_on: from,
      ends_on: to,
      currency: "CAD",
      vibe,
      transport,
      extras,
    });
    locate(id, destination, m.update);
    if (idea) ideas.remove(idea.id, `“${idea.title}” moved to your trips`);
    onCreated(id);
  };
  const { nights } = from && to && to >= from ? tripLength(from, to) : { nights: -1 };
  return (
    <form
      onSubmit={submit}
      className="mb-3 space-y-3 rounded-lg border border-brass bg-[#fffdf8] p-3"
      aria-label="Plan a trip"
    >
      <div className="grid grid-cols-2 gap-1.5">
        <input
          className={`${inputCls} col-span-2`}
          placeholder="Trip name, e.g. Muskoka cottage"
          aria-label="Trip name"
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className={`${inputCls} col-span-2`}
          placeholder="Where? (for the weather)"
          aria-label="Destination"
          maxLength={120}
          value={dest}
          onChange={(e) => setDest(e.target.value)}
        />
        <label className="text-[11px] font-bold text-ink-2">
          From
          <input
            type="date"
            className={`${smallSelect} w-full`}
            value={from}
            min={torontoDayKey(new Date())}
            onChange={(e) => (
              setFrom(e.target.value),
              (!to || to < e.target.value) && setTo(e.target.value)
            )}
          />
        </label>
        <label className="text-[11px] font-bold text-ink-2">
          To
          <input
            type="date"
            className={`${smallSelect} w-full`}
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        {nights >= 0 && (
          <p className="col-span-2 m-0 text-xs text-ink-2">
            {nights ? `${nights + 1} days, ${nights} night${nights > 1 ? "s" : ""}` : "A day trip"}
          </p>
        )}
      </div>
      <TripOptions
        vibe={vibe}
        setVibe={setVibe}
        transport={transport}
        setTransport={setTransport}
        extras={extras}
        setExtras={setExtras}
      />
      <div className="flex items-center gap-2">
        <button type="submit" className={addBtn} disabled={!valid}>
          Plan it
        </button>
        <button type="button" className={linkBtn} onClick={onCancel}>
          Cancel
        </button>
        {!vibe && title && from && (
          <span className="text-xs text-ink-2">Pick a vibe to continue</span>
        )}
      </div>
    </form>
  );
}

/** Change a trip: name, place, dates, vibe, transport, extras. Moving the start can move the plan with it. */
function EditTrip({ trip, onDone }: { trip: Trip; onDone: () => void }) {
  const m = useRowMutation<Trip>("trips");
  const days = useRowMutation<TripDay>("trip_days");
  const { data: dayRows } = useRows<TripDay>("trip_days");
  const [title, setTitle] = useState(trip.title);
  const [dest, setDest] = useState(trip.destination ?? "");
  const [from, setFrom] = useState(trip.starts_on);
  const [to, setTo] = useState(trip.ends_on);
  const [vibe, setVibe] = useState<Vibe | null>(trip.vibe);
  const [transport, setTransport] = useState<Transport | null>(trip.transport);
  const [extras, setExtras] = useState<Extra[]>(trip.extras ?? []);
  const [shift, setShift] = useState(true);
  const plan = live(dayRows).filter((d) => d.trip_id === trip.id);
  const delta = from ? daysBetween(trip.starts_on, from) : 0;
  const valid = title.trim() && from && to && to >= from && vibe;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    const destination = dest.trim().slice(0, 120) || null;
    m.update(trip.id, {
      title: title.trim().slice(0, 120),
      destination,
      starts_on: from,
      ends_on: to,
      vibe,
      transport,
      extras,
    });
    if (destination !== trip.destination) locate(trip.id, destination, m.update);
    if (delta && shift)
      for (const d of plan) days.update(d.id, { day_date: addDays(d.day_date, delta) });
    toast("Trip updated: the packing lists follow");
    onDone();
  };
  const moveStart = (v: string) => {
    if (v && from && to) setTo(addDays(v, daysBetween(from, to)));
    setFrom(v);
  };
  return (
    <form onSubmit={submit} className="mb-1 space-y-3">
      <div className="grid grid-cols-2 gap-1.5">
        <input
          className={`${inputCls} col-span-2`}
          aria-label="Trip name"
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className={`${inputCls} col-span-2`}
          placeholder="Where? (for the weather)"
          aria-label="Destination"
          maxLength={120}
          value={dest}
          onChange={(e) => setDest(e.target.value)}
        />
        <label className="text-[11px] font-bold text-ink-2">
          From
          <input
            type="date"
            className={`${smallSelect} w-full`}
            value={from}
            onChange={(e) => moveStart(e.target.value)}
          />
        </label>
        <label className="text-[11px] font-bold text-ink-2">
          To
          <input
            type="date"
            className={`${smallSelect} w-full`}
            value={to}
            min={from}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        {delta !== 0 && plan.length > 0 && (
          <label className="col-span-2 flex min-h-11 items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={shift}
              onChange={(e) => setShift(e.target.checked)}
              className="h-[18px] w-[18px] accent-red-oxide"
            />
            Move the day-by-day plan {Math.abs(delta)} day{Math.abs(delta) > 1 ? "s" : ""}{" "}
            {delta > 0 ? "later" : "earlier"} too
          </label>
        )}
      </div>
      <TripOptions
        vibe={vibe}
        setVibe={setVibe}
        transport={transport}
        setTransport={setTransport}
        extras={extras}
        setExtras={setExtras}
      />
      <div className="flex gap-2">
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

/** "Do this trip again": same place, vibe, plan and your own packing extras, new dates. */
function DoAgain({
  trip,
  onCreated,
  onCancel,
}: {
  trip: Trip;
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const qc = useQueryClient();
  const { data: dayRows } = useRows<TripDay>("trip_days");
  const { data: packRows } = useRows<PackingItem>("packing_items");
  const length = daysBetween(trip.starts_on, trip.ends_on);
  const [from, setFrom] = useState("");
  const go = async () => {
    if (!from) return;
    const id = crypto.randomUUID();
    const sb = supabaseBrowser()!;
    const { error } = await sb.from("trips").insert({
      id,
      household_id: trip.household_id,
      title: trip.title,
      destination: trip.destination,
      starts_on: from,
      ends_on: addDays(from, length),
      currency: trip.currency,
      budget_planned: trip.budget_planned,
      vibe: trip.vibe,
      transport: trip.transport,
      extras: trip.extras,
      dest_lat: trip.dest_lat,
      dest_lng: trip.dest_lng,
      dest_place: trip.dest_place,
    });
    if (error) return toast(error.message, { tone: "error" });
    const shift = daysBetween(trip.starts_on, from);
    const plan = live(dayRows).filter((d) => d.trip_id === trip.id);
    if (plan.length)
      await sb
        .from("trip_days")
        .insert(
          plan.map((d) => ({
            household_id: trip.household_id,
            trip_id: id,
            day_date: addDays(d.day_date, shift),
            at_time: d.at_time,
            title: d.title,
            notes: d.notes,
          })),
        );
    const own = live(packRows).filter((p) => p.trip_id === trip.id && !p.rule_key && p.qty > 0);
    if (own.length)
      await sb
        .from("packing_items")
        .insert(
          own.map((p) => ({
            household_id: trip.household_id,
            trip_id: id,
            owner_id: p.owner_id,
            title: p.title,
            qty: p.qty,
            category: p.category,
          })),
        );
    await Promise.all(
      (["trips", "trip_days", "packing_items"] as const).map((t) =>
        qc.invalidateQueries({ queryKey: rowsKey(t) }),
      ),
    );
    toast("Copied, with new dates");
    onCreated(id);
  };
  return (
    <div className="mt-2 flex flex-wrap items-end gap-1.5 rounded-lg border border-brass bg-[#fffdf8] p-2.5">
      <label className="text-[11px] font-bold text-ink-2">
        New start date ({length + 1} days, like last time)
        <input
          type="date"
          className={`${smallSelect} block w-full`}
          value={from}
          min={torontoDayKey(new Date())}
          onChange={(e) => setFrom(e.target.value)}
        />
      </label>
      <button type="button" className={addBtn} disabled={!from} onClick={go}>
        Copy the trip
      </button>
      <button type="button" className={linkBtn} onClick={onCancel}>
        Cancel
      </button>
    </div>
  );
}

// ======================================================================
// One trip, one page
// ======================================================================

function useTripWeather(trip: Trip) {
  const today = torontoDayKey(new Date());
  const inRange =
    trip.dest_lat != null &&
    trip.dest_lng != null &&
    daysBetween(today, trip.starts_on) <= 15 &&
    trip.ends_on >= today;
  const q = useQuery({
    queryKey: ["weather", trip.dest_lat, trip.dest_lng, trip.starts_on, trip.ends_on],
    enabled: inRange,
    staleTime: 3 * 3_600_000,
    retry: 1,
    queryFn: () =>
      fetchForecast({ lat: trip.dest_lat!, lng: trip.dest_lng! }, trip.starts_on, trip.ends_on),
  });
  const weather: Weather =
    q.data?.weather ?? seasonGuess(trip.starts_on, trip.dest_lat ?? INSTANCE.lat);
  return { weather, days: q.data?.days ?? [], loading: inRange && q.isLoading };
}

function TripPage({
  trip,
  onBack,
  onOpen,
}: {
  trip: Trip;
  onBack: () => void;
  onOpen: (id: string) => void;
}) {
  const { me } = usePeople();
  const m = useRowMutation<Trip>("trips");
  const { data: cover } = useSignedUrl(FILES_BUCKET, trip.cover_path);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [again, setAgain] = useState(false);
  const today = torontoDayKey(new Date());
  const wx = useTripWeather(trip);
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
  const jump = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <>
      <button type="button" className={linkBtn} onClick={onBack}>
        ← All trips
      </button>
      <div className="relative mb-2 overflow-hidden rounded-lg border border-[#e6d9c2] bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- signed URL to a private photo */}
        {cover && <img src={cover} alt="" className="h-32 w-full object-cover" />}
        <div className="p-2.5">
          {editing ? (
            <EditTrip trip={trip} onDone={() => setEditing(false)} />
          ) : (
            <>
              <TripCardView t={trip} today={today} />
              <p className="m-0 mt-1 flex flex-wrap gap-1">
                {[
                  trip.transport &&
                    `${TRANSPORTS[trip.transport].icon} ${TRANSPORTS[trip.transport].label}`,
                  ...(trip.extras ?? []).map((e) => `${EXTRAS[e].icon} ${EXTRAS[e].label}`),
                ]
                  .filter(Boolean)
                  .map((t) => (
                    <span
                      key={t as string}
                      className="rounded-full bg-[#f3ead9] px-2 py-px text-[11px] font-bold text-teak"
                    >
                      {t}
                    </span>
                  ))}
              </p>
            </>
          )}
          <div className="flex flex-wrap gap-x-3">
            {!editing && (
              <button type="button" className={linkBtn} onClick={() => setEditing(true)}>
                Edit trip
              </button>
            )}
            <label className={`${linkBtn} flex cursor-pointer items-center`}>
              {busy ? "Uploading…" : cover ? "Change cover photo" : "Add a cover photo"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => setCover(e.target.files?.[0])}
              />
            </label>
            <button type="button" className={linkBtn} onClick={() => setAgain((v) => !v)}>
              Do this trip again
            </button>
            <button
              type="button"
              className={`${linkBtn} text-urgent`}
              onClick={() => (m.remove(trip.id, `Removed “${trip.title}”`), onBack())}
            >
              Delete trip
            </button>
          </div>
          {again && (
            <DoAgain
              trip={trip}
              onCancel={() => setAgain(false)}
              onCreated={(id) => (setAgain(false), onOpen(id))}
            />
          )}
        </div>
      </div>

      <nav aria-label="On this page" className="mb-2 flex gap-1.5 overflow-x-auto">
        {[
          ["trip-packing", "Packing"],
          ["trip-plan", "Plan"],
          ["trip-bookings", "Bookings"],
          ["trip-budget", "Budget"],
        ].map(([id, label]) => (
          <button
            key={id}
            type="button"
            className="min-h-9 flex-none rounded-full border border-[#e6d9c2] bg-white px-3 text-xs font-bold"
            onClick={() => jump(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <NextSteps trip={trip} />
      <WeatherRow trip={trip} wx={wx} />
      {trip.vibe && trip.ends_on < today && <AfterTrip trip={trip} />}
      <div id="trip-packing" className="scroll-mt-2">
        {trip.vibe ? (
          <Packing trip={trip} weather={wx.weather} />
        ) : (
          <p className="text-sm text-ink-2">Edit the trip and pick a vibe to get packing lists.</p>
        )}
      </div>
      <div id="trip-plan" className="scroll-mt-2">
        <Itinerary trip={trip} />
      </div>
      <div id="trip-bookings" className="scroll-mt-2">
        <Bookings trip={trip} />
      </div>
      <div id="trip-budget" className="scroll-mt-2">
        <Budget trip={trip} />
      </div>
    </>
  );
}

/** The one or two things worth doing next, so the trip page answers "what's left?". */
function NextSteps({ trip }: { trip: Trip }) {
  const { data: bookings } = useRows<Booking>("trip_bookings");
  const { data: dayRows } = useRows<TripDay>("trip_days");
  const { data: packing } = useRows<PackingItem>("packing_items");
  const today = torontoDayKey(new Date());
  if (trip.ends_on < today) return null;
  const mine = live(bookings).filter((b) => b.trip_id === trip.id);
  const plan = live(dayRows).filter((d) => d.trip_id === trip.id);
  const pct = packedPct(packing ?? [], trip.id) ?? 0;
  const away = daysBetween(today, trip.starts_on);
  const { nights } = tripLength(trip.starts_on, trip.ends_on);
  const steps: string[] = [];
  if (away <= 3 && pct < 100)
    steps.push(
      `🧳 Packing is ${Math.round(pct)}% done, and you leave ${away <= 0 ? "today" : away === 1 ? "tomorrow" : `in ${away} days`}`,
    );
  if (trip.transport === "fly" && !mine.some((b) => b.kind === "flight"))
    steps.push("✈️ Add your flights (with the confirmation number)");
  if (trip.transport === "train" && !mine.some((b) => b.kind === "train"))
    steps.push("🚆 Add the train tickets");
  if (nights > 0 && !mine.some((b) => b.kind === "hotel"))
    steps.push("🏨 Where are you staying? Add the booking");
  if (!plan.length && nights > 0) steps.push("🗓️ Add a few plans: type “Sat 7pm dinner at …”");
  if (trip.budget_planned == null) steps.push("💰 Set a budget");
  return (
    <div className="mb-3 rounded-lg border border-[#cfe0c4] bg-[#f1f7ec] p-2.5 text-sm">
      <p className="m-0 text-[11px] font-bold tracking-wider text-leaf uppercase">Next</p>
      {steps.length ? (
        steps.slice(0, 2).map((s) => (
          <p key={s} className="m-0 mt-1">
            {s}
          </p>
        ))
      ) : (
        <p className="m-0 mt-1">All set ✨ Enjoy it.</p>
      )}
    </div>
  );
}

function WeatherRow({ trip, wx }: { trip: Trip; wx: ReturnType<typeof useTripWeather> }) {
  const today = torontoDayKey(new Date());
  if (trip.ends_on < today) return null;
  const where = trip.dest_place ?? (trip.destination ? null : INSTANCE.city);
  if (wx.days.length)
    return (
      <div className="mb-3" aria-label="Weather forecast">
        <p className="m-0 mb-1 text-[11px] font-bold tracking-wider text-ink-2 uppercase">
          Forecast{where ? ` · ${where}` : ""}
        </p>
        <div className="flex gap-1.5 overflow-x-auto">
          {wx.days.map((d) => (
            <div
              key={d.day}
              className="min-w-[64px] flex-none rounded-lg border border-[#e6d9c2] bg-white px-2 py-1.5 text-center text-xs"
            >
              <b className="block">{dayLabel(d.day, { weekday: "short" })}</b>
              <span className="block text-lg" aria-hidden="true">
                {weatherIcon(d.code)}
              </span>
              {d.maxC}° / {d.minC}°
              {d.rain >= 50 && (
                <span className="block text-[10.5px] font-bold text-teak">{d.rain}% rain</span>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  return (
    <p className="m-0 mb-3 text-xs text-ink-2">
      {wx.loading
        ? "Checking the weather…"
        : trip.destination && trip.dest_lat == null
          ? `Couldn't find “${trip.destination}” for the weather: packing uses the season. Edit the trip to try another name.`
          : `Packing uses the season for now; the forecast appears 16 days before you go${where ? ` (${where})` : ""}.`}
    </p>
  );
}

// ======================================================================
// Packing: one list each, one shared, made from the trip
// ======================================================================

function useMyProfile() {
  const { me } = usePeople();
  const qc = useQueryClient();
  const { data: rows } = useRows<ProfileRow>("packing_profiles");
  const profiles = (rows ?? []) as ProfileRow[];
  const mine = profiles.find((p) => p.member_id === me?.id);
  const save = async (patch: { labels?: ProfileRow["labels"]; vibes?: ProfileRow["vibes"] }) => {
    if (!me) return;
    const sb = supabaseBrowser()!;
    const row = {
      member_id: me.id,
      household_id: me.household_id,
      labels: patch.labels ?? mine?.labels ?? {},
      vibes: patch.vibes ?? mine?.vibes ?? {},
    };
    const { error } = mine
      ? await sb
          .from("packing_profiles")
          .update({ labels: row.labels, vibes: row.vibes })
          .eq("member_id", me.id)
      : await sb.from("packing_profiles").insert(row);
    if (error) toast(error.message, { tone: "error" });
    qc.invalidateQueries({ queryKey: rowsKey("packing_profiles") });
  };
  const learn = (vibe: Vibe, f: (l: VibeLearning) => VibeLearning, msg: string) => {
    save({ vibes: { ...(mine?.vibes ?? {}), [vibe]: f(mine?.vibes?.[vibe] ?? {}) } });
    toast(msg);
  };
  return { profiles, mine, save, learn };
}

/** Keep the trip's suggested items in step with the rules (both phones may do this; the database keeps one of each). */
function usePackingSync(
  trip: Trip,
  items: PackingItem[],
  suggested: ReturnType<typeof suggestPacking>,
  ready: boolean,
) {
  const qc = useQueryClient();
  const running = useRef(false);
  const plan = planPackingSync(suggested, items);
  const signature = JSON.stringify(plan);
  useEffect(() => {
    if (
      !ready ||
      running.current ||
      (!plan.insert.length && !plan.update.length && !plan.remove.length)
    )
      return;
    running.current = true;
    (async () => {
      const sb = supabaseBrowser()!;
      if (plan.insert.length) {
        const rows = plan.insert.map((s) => ({
          household_id: trip.household_id,
          trip_id: trip.id,
          owner_id: s.owner,
          title: s.title,
          qty: s.qty,
          suggested_qty: s.qty,
          rule_key: s.key,
          reason: s.reason,
          category: s.category,
        }));
        const { error } = await sb.from("packing_items").insert(rows);
        // the other phone added some of these at the same moment: add the rest one by one (duplicates are refused)
        if (error?.code === "23505") for (const r of rows) await sb.from("packing_items").insert(r);
      }
      for (const u of plan.update) await sb.from("packing_items").update(u.patch).eq("id", u.id);
      if (plan.remove.length)
        await sb
          .from("packing_items")
          .update({ deleted_at: new Date().toISOString() })
          .in("id", plan.remove);
      await qc.invalidateQueries({ queryKey: rowsKey("packing_items") });
      running.current = false;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the plan's content is the dependency
  }, [signature, ready]);
}

function Packing({ trip, weather }: { trip: Trip; weather: Weather }) {
  const { me, members, byId } = usePeople();
  const { data: rows, isFetched } = useRows<PackingItem>("packing_items");
  const { profiles, mine, save, learn } = useMyProfile();
  const { isFetched: profilesFetched } = useRows<ProfileRow>("packing_profiles");
  const m = useRowMutation<PackingItem>("packing_items");
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState<string>("me");
  const [why, setWhy] = useState<string | null>(null);
  const items = live(rows).filter((p) => p.trip_id === trip.id);
  const vibe = trip.vibe!;
  const vibeName = VIBES[vibe].label.toLowerCase();
  const people = members.map((p) => p.id);
  const suggested = suggestPacking(
    {
      starts_on: trip.starts_on,
      ends_on: trip.ends_on,
      vibe,
      transport: trip.transport,
      extras: trip.extras ?? [],
    },
    people,
    profiles,
    weather,
  );
  usePackingSync(
    trip,
    (rows ?? []).filter((p) => p.trip_id === trip.id),
    suggested,
    isFetched && profilesFetched && people.length > 0,
  );
  const pct = packedPct(items, trip.id);
  const labels = (memberId: string) => ({
    ...LABEL_PRESETS[2],
    ...profiles.find((p) => p.member_id === memberId)?.labels,
  });

  const setPacked = (p: PackingItem, count: number) =>
    m.update(p.id, { packed_count: count, packed: count >= p.qty });
  const changeQty = (p: PackingItem, qty: number) => {
    const next = Math.max(0, Math.min(30, qty));
    m.update(p.id, {
      qty: next,
      edited: true,
      packed_count: Math.min(p.packed_count, next),
      packed: p.packed_count >= next && next > 0,
    });
    if (p.owner_id !== me?.id || !p.rule_key || p.rule_key.startsWith("custom:")) return;
    const isOutfit = p.rule_key === "outfit_dressy" || p.rule_key === "outfit_casual";
    // the other kind of outfit stays as it is on this trip (learning the new mix mustn't change it under you)
    const sibling =
      isOutfit &&
      items.find(
        (x) =>
          x.owner_id === me?.id &&
          x.rule_key === (p.rule_key === "outfit_dressy" ? "outfit_casual" : "outfit_dressy"),
      );
    if (sibling && !sibling.edited) m.update(sibling.id, { edited: true });
    const outfits = isOutfit
      ? {
          dressy:
            p.rule_key === "outfit_dressy"
              ? next
              : (items.find((x) => x.owner_id === me?.id && x.rule_key === "outfit_dressy")?.qty ??
                0),
          casual:
            p.rule_key === "outfit_casual"
              ? next
              : (items.find((x) => x.owner_id === me?.id && x.rule_key === "outfit_casual")?.qty ??
                0),
        }
      : undefined;
    toast(next === 0 ? `Removed ${p.title}` : `${p.title}: ${next}`, {
      action: {
        label:
          next === 0
            ? `Never on ${vibeName} trips`
            : isOutfit
              ? `Remember this mix for ${vibeName} trips`
              : `Remember for ${vibeName} trips`,
        run: () =>
          learn(
            vibe,
            (l) =>
              learnFromEdit(
                l,
                { rule_key: p.rule_key!, qty: next, suggested_qty: p.suggested_qty ?? p.qty },
                outfits,
              ),
            `Got it: ${vibeName} trips will remember that`,
          ),
      },
      ms: 8000,
    });
  };
  const removeItem = (p: PackingItem) => {
    if (p.rule_key)
      changeQty(p, 0); // a suggestion: hide it (so it isn't suggested again on this trip)
    else m.remove(p.id, `Removed ${p.title}`);
  };
  const addItem = (e: React.FormEvent) => {
    e.preventDefault();
    const t = title.trim().slice(0, 120);
    if (!t || !me) return;
    const ownerId = owner === "me" ? me.id : owner === "shared" ? null : owner;
    m.insert({
      household_id: trip.household_id,
      trip_id: trip.id,
      owner_id: ownerId,
      title: t,
      qty: 1,
      packed_count: 0,
      packed: false,
    });
    setTitle("");
    if (ownerId === me.id)
      toast(`Added ${t}`, {
        action: {
          label: `Always on ${vibeName} trips`,
          run: () =>
            learn(
              vibe,
              (l) => ({
                ...l,
                add: [...(l.add ?? []).filter((x) => x.toLowerCase() !== t.toLowerCase()), t],
              }),
              `${t} will be on every ${vibeName} trip`,
            ),
        },
        ms: 8000,
      });
  };

  const groups: { id: string | null; name: string; sub?: string }[] = [
    ...members
      .slice()
      .sort((a, b) => (a.id === me?.id ? -1 : b.id === me?.id ? 1 : 0))
      .map((p) => ({
        id: p.id,
        name: p.id === me?.id ? "Your list" : `${p.display_name}'s list`,
        sub: `${labels(p.id).dressy} & ${labels(p.id).casual}`,
      })),
    { id: null, name: "Shared" },
  ];

  return (
    <Sec title={pct === null ? "Packing" : `Packing · ${Math.round(pct)}% packed`}>
      {pct !== null && (
        <div
          className="mb-2 h-2 overflow-hidden rounded-full bg-[#efe4cf]"
          role="progressbar"
          aria-valuenow={Math.round(pct)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Packed"
        >
          <div className="h-full bg-leaf transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      )}
      {me && !mine?.labels?.dressy && (
        <div className="mb-2 rounded-lg border border-[#e9d4a4] bg-[#fff8e6] p-2.5 text-sm">
          <p className="m-0 font-bold">What should we call your outfits?</p>
          <p className="m-0 text-xs text-ink-2">
            Your list splits day outfits into two kinds; this is just the wording on your list.
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {LABEL_PRESETS.map((l) => (
              <button
                key={l.dressy}
                type="button"
                className={chip(false)}
                onClick={() => save({ labels: l })}
              >
                {l.dressy} &amp; {l.casual}
              </button>
            ))}
          </div>
        </div>
      )}
      <form className="mb-2 flex gap-1.5" onSubmit={addItem}>
        <input
          className={inputCls}
          placeholder="Add something…"
          aria-label="Packing item"
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <select
          aria-label="Whose list"
          className={`${smallSelect} flex-none`}
          value={owner}
          onChange={(e) => setOwner(e.target.value)}
        >
          <option value="me">Mine</option>
          {members
            .filter((p) => p.id !== me?.id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}&apos;s
              </option>
            ))}
          <option value="shared">Shared</option>
        </select>
      </form>
      {groups.map((g) => {
        const list = items.filter((p) => p.owner_id === g.id && p.qty > 0);
        const hidden = items.filter((p) => p.owner_id === g.id && p.qty === 0);
        if (!list.length && !hidden.length) return null;
        const done = list.filter((p) => p.packed_count >= p.qty).length;
        return (
          <details key={g.id ?? "shared"} open={g.id === me?.id || g.id === null} className="mb-2">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-[11px] font-bold tracking-wider text-ink-2 uppercase">
              <span className="flex-1">
                {g.name}{" "}
                {g.sub && (
                  <span className="font-normal tracking-normal normal-case">· {g.sub}</span>
                )}
              </span>
              <span className="font-normal tracking-normal normal-case">
                {done}/{list.length}
              </span>
            </summary>
            {list.map((p) => {
              const full = p.packed_count >= p.qty;
              return (
                <div key={p.id} className="border-b border-dashed border-[#e6d9c2] last:border-b-0">
                  <div className="flex min-h-11 items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPacked(p, full ? 0 : p.qty > 1 ? p.packed_count + 1 : 1)}
                      aria-label={
                        full
                          ? p.qty > 1
                            ? `✓ ${p.title} packed, unpack`
                            : `Unpack ${p.title}`
                          : p.qty > 1
                            ? `${p.packed_count}/${p.qty} ${p.title} packed, pack one more`
                            : `Packed ${p.title}`
                      }
                      className={`flex h-8 min-w-8 flex-none items-center justify-center rounded-md border px-1 text-xs font-bold ${full ? "border-leaf bg-leaf text-white" : p.packed_count ? "border-leaf bg-[#e6f0de] text-leaf" : "border-[#c9b796] bg-white"}`}
                    >
                      {full ? "✓" : p.qty > 1 ? `${p.packed_count}/${p.qty}` : ""}
                    </button>
                    <span
                      className={`min-w-0 flex-1 text-sm ${full ? "text-[#7a6b5d] line-through" : ""}`}
                    >
                      {p.title}
                      {p.qty > 1 && <span className="text-ink-2"> ×{p.qty}</span>}
                    </span>
                    {p.reason && (
                      <button
                        type="button"
                        className="h-9 w-7 flex-none text-ink-2"
                        aria-label={`Why ${p.title}?`}
                        aria-expanded={why === p.id}
                        onClick={() => setWhy(why === p.id ? null : p.id)}
                      >
                        ⓘ
                      </button>
                    )}
                    <span className="flex flex-none items-center">
                      <button
                        type="button"
                        className="h-9 w-8 text-lg text-teak"
                        aria-label={`One fewer ${p.title}`}
                        onClick={() => (p.qty <= 1 ? removeItem(p) : changeQty(p, p.qty - 1))}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        className="h-9 w-8 text-lg text-teak"
                        aria-label={`One more ${p.title}`}
                        onClick={() => changeQty(p, p.qty + 1)}
                      >
                        +
                      </button>
                    </span>
                  </div>
                  {why === p.id && (
                    <p className="m-0 pb-1.5 pl-10 text-xs text-ink-2">{p.reason}</p>
                  )}
                </div>
              );
            })}
            {hidden.length > 0 && (
              <p className="m-0 mt-1 text-[11px] text-ink-2">
                Removed:{" "}
                {hidden.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && ", "}
                    <button
                      type="button"
                      className="underline"
                      onClick={() => m.update(p.id, { qty: p.suggested_qty || 1, edited: false })}
                      aria-label={`Put back ${p.title}`}
                    >
                      {p.title}
                    </button>
                  </span>
                ))}
              </p>
            )}
            {g.id && g.id !== me?.id && (
              <p className="m-0 mt-1 text-[11px] text-ink-2">
                You can tick off {byId(g.id)?.display_name}&apos;s things too.
              </p>
            )}
          </details>
        );
      })}
      <div className="flex flex-wrap gap-3">
        {me && mine?.labels?.dressy && (
          <button
            type="button"
            className={linkBtn}
            onClick={() =>
              save({
                labels:
                  LABEL_PRESETS[
                    (LABEL_PRESETS.findIndex((l) => l.dressy === mine.labels.dressy) + 1) %
                      LABEL_PRESETS.length
                  ],
              })
            }
          >
            Change your outfit wording
          </button>
        )}
        {items.some((p) => p.packed_count > 0) && (
          <button
            type="button"
            className={linkBtn}
            onClick={() => items.filter((p) => p.packed_count > 0).forEach((p) => setPacked(p, 0))}
          >
            Unpack all
          </button>
        )}
      </div>
    </Sec>
  );
}

/** After the trip: 30 seconds to tell your packing list what you didn't need and what you missed. */
function AfterTrip({ trip }: { trip: Trip }) {
  const { me } = usePeople();
  const { data: rows } = useRows<PackingItem>("packing_items");
  const { learn } = useMyProfile();
  const tm = useRowMutation<Trip>("trips");
  const [unused, setUnused] = useState<Record<string, number>>({});
  const [wish, setWish] = useState("");
  if (
    !me ||
    (trip.feedback_by ?? []).includes(me.id) ||
    daysBetween(trip.ends_on, torontoDayKey(new Date())) > 21
  )
    return null;
  const mine = live(rows).filter(
    (p) => p.trip_id === trip.id && p.owner_id === me.id && p.rule_key && p.qty > 0,
  );
  const finish = (skip: boolean) => {
    if (!skip)
      learn(
        trip.vibe!,
        (l) =>
          learnFromTrip(
            l,
            mine.map((p) => ({ rule_key: p.rule_key!, count: unused[p.id] ?? 0, qty: p.qty })),
            wish.split(","),
          ),
        `Thanks: your next ${VIBES[trip.vibe!].label.toLowerCase()} trip will pack smarter`,
      );
    tm.update(trip.id, { feedback_by: [...(trip.feedback_by ?? []), me.id] });
  };
  return (
    <div
      className="mb-3 rounded-lg border border-brass bg-[#fffdf8] p-3 text-sm"
      role="region"
      aria-label="How did packing go?"
    >
      <p className="m-0 font-bold">How did packing go?</p>
      <p className="m-0 text-xs text-ink-2">
        Tap anything you didn&apos;t use. Your next {VIBES[trip.vibe!].label.toLowerCase()} trip
        learns from it.
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {mine.map((p) => {
          const n = unused[p.id] ?? 0;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={n > 0}
              onClick={() => setUnused({ ...unused, [p.id]: n >= p.qty ? 0 : n + 1 })}
              className={`min-h-9 rounded-full border px-3 text-xs font-bold ${n ? "border-urgent bg-[#fdf0ec] text-urgent" : "border-[#e0d2b8] bg-white"}`}
            >
              {p.title}
              {n > 0 && ` · ${n} unused`}
            </button>
          );
        })}
      </div>
      <input
        className={`${inputCls} mt-2 w-full`}
        placeholder="Wish you'd brought… (comma-separated)"
        aria-label="Wish you'd brought"
        maxLength={300}
        value={wish}
        onChange={(e) => setWish(e.target.value)}
      />
      <div className="mt-2 flex gap-2">
        <button type="button" className={addBtn} onClick={() => finish(false)}>
          Save
        </button>
        <button type="button" className={linkBtn} onClick={() => finish(true)}>
          Skip
        </button>
      </div>
    </div>
  );
}

// ======================================================================
// Plan, bookings, budget
// ======================================================================

function Itinerary({ trip }: { trip: Trip }) {
  const { data: rows } = useRows<TripDay>("trip_days");
  const m = useRowMutation<TripDay>("trip_days");
  const items = live(rows).filter((d) => d.trip_id === trip.id);
  const days = tripDays(trip.starts_on, trip.ends_on);
  const outside = items.filter(
    (x) => x.day_date < trip.starts_on || x.day_date > days[days.length - 1],
  );
  return (
    <Sec title="Plan">
      <QuickPlan trip={trip} days={days} />
      {days.map((day, i) => {
        const list = items
          .filter((x) => x.day_date === day)
          .sort((a, b) => ((a.at_time ?? "99") < (b.at_time ?? "99") ? -1 : 1));
        return (
          <div key={day} className="mb-2">
            <p className="m-0 text-xs font-bold text-teak">
              Day {i + 1} · {dayLabel(day)}
            </p>
            {list.length === 0 && <p className="m-0 text-xs text-ink-2">Nothing planned</p>}
            {list.map((x) => (
              <div
                key={x.id}
                className="flex items-center gap-2 border-b border-dashed border-[#e6d9c2] py-1 text-sm"
              >
                <span className="w-12 flex-none text-xs text-ink-2">
                  {x.at_time ? x.at_time.slice(0, 5) : ""}
                </span>
                <span className="flex-1">{x.title}</span>
                <IconButton
                  label={`Delete ${x.title}`}
                  onClick={() => m.remove(x.id, `Removed “${x.title}”`)}
                >
                  <TrashIcon />
                </IconButton>
              </div>
            ))}
          </div>
        );
      })}
      {outside.length > 0 && (
        <div className="mb-3 rounded-lg border border-dashed border-[#e7b2a8] bg-[#fdf0ec] p-2">
          <p className="m-0 text-xs font-bold text-urgent">Not on the trip&apos;s dates any more</p>
          {outside.map((x) => (
            <div key={x.id} className="flex items-center gap-2 py-1 text-sm">
              <span className="flex-1">
                {x.title}{" "}
                <span className="text-[11px] text-ink-2">· was {dayLabel(x.day_date)}</span>
              </span>
              <select
                aria-label={`Move ${x.title} to a day`}
                className={smallSelect}
                value=""
                onChange={(e) => e.target.value && m.update(x.id, { day_date: e.target.value })}
              >
                <option value="">Move to…</option>
                {days.map((d, i) => (
                  <option key={d} value={d}>
                    Day {i + 1} · {dayLabel(d)}
                  </option>
                ))}
              </select>
              <IconButton
                label={`Delete ${x.title}`}
                onClick={() => m.remove(x.id, `Removed “${x.title}”`)}
              >
                <TrashIcon />
              </IconButton>
            </div>
          ))}
        </div>
      )}
      <Trash
        rows={trashed(rows).filter((d) => d.trip_id === trip.id)}
        label={(r) => r.title}
        onRestore={m.restore}
      />
    </Sec>
  );
}

/** One box for the whole plan: "Sat 7pm dinner at The Kitchen". */
function QuickPlan({ trip, days }: { trip: Trip; days: string[] }) {
  const m = useRowMutation<TripDay>("trip_days");
  const [text, setText] = useState("");
  const [dayOverride, setDayOverride] = useState<string | null>(null);
  const parsed = text.trim() ? parsePlanText(text, days) : null;
  const day = dayOverride ?? parsed?.day ?? days[0];
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed?.title) return;
    m.insert({
      household_id: trip.household_id,
      trip_id: trip.id,
      day_date: day,
      at_time: parsed.time,
      title: parsed.title,
    });
    setText("");
    setDayOverride(null);
  };
  return (
    <form onSubmit={submit} className="mb-3">
      <div className="flex gap-1.5">
        <input
          className={inputCls}
          placeholder="e.g. Sat 7pm dinner at The Kitchen"
          aria-label="Add to the plan"
          maxLength={200}
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" className={addBtn} disabled={!parsed?.title}>
          Add
        </button>
      </div>
      {parsed?.title && (
        <p className="m-0 mt-1 flex flex-wrap items-center gap-1 text-xs text-ink-2">
          →
          <select
            aria-label="Day"
            className="min-h-9 rounded border border-[#dccdb2] bg-white px-1 text-xs"
            value={day}
            onChange={(e) => setDayOverride(e.target.value)}
          >
            {days.map((d, i) => (
              <option key={d} value={d}>
                Day {i + 1} · {dayLabel(d)}
              </option>
            ))}
          </select>
          {parsed.time && (
            <b>
              {formatToronto(
                torontoToUtc(
                  ...(day.split("-").map(Number) as [number, number, number]),
                  Number(parsed.time.slice(0, 2)),
                  Number(parsed.time.slice(3)),
                ),
                { hour: "numeric", minute: "2-digit" },
              )}
            </b>
          )}
          <span>· {parsed.title}</span>
        </p>
      )}
    </form>
  );
}

function Bookings({ trip }: { trip: Trip }) {
  const { data: rows } = useRows<Booking>("trip_bookings");
  const m = useRowMutation<Booking>("trip_bookings");
  const list = live(rows)
    .filter((b) => b.trip_id === trip.id)
    .sort((a, b) => ((a.starts_at ?? "~") < (b.starts_at ?? "~") ? -1 : 1));
  return (
    <Sec title="Bookings">
      <AddBooking trip={trip} />
      {list.length === 0 && (
        <p className="text-sm text-ink-2">
          Flights, places to stay, tickets: keep the confirmation number and the PDF here. On
          Android you can also share a ticket to Veedu from your email.
        </p>
      )}
      {list.map((b) => (
        <BookingCard
          key={b.id}
          b={b}
          trip={trip}
          onDelete={() => m.remove(b.id, `Removed “${b.title}”`)}
        />
      ))}
      <Trash
        rows={trashed(rows).filter((b) => b.trip_id === trip.id)}
        label={(r) => r.title}
        onRestore={m.restore}
      />
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
          {b.starts_at && (
            <p className="m-0 text-xs text-ink-2">
              {formatToronto(b.starts_at, {
                weekday: "short",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
          {b.confirmation_no && (
            <p className="m-0 mt-0.5 flex items-center gap-2 text-xs">
              Confirmation{" "}
              <code className="rounded bg-[#f3ead9] px-1.5 py-0.5 font-bold tracking-wider">
                {b.confirmation_no}
              </code>
              <button
                type="button"
                className={linkBtn}
                onClick={() =>
                  navigator.clipboard?.writeText(b.confirmation_no!).then(
                    () => toast("Copied"),
                    () => toast("Couldn't copy", { tone: "error" }),
                  )
                }
              >
                Copy
              </button>
            </p>
          )}
          {b.cost != null && (
            <p className="m-0 text-xs text-ink-2">{money(b.cost, trip.currency)}</p>
          )}
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-bold underline"
            >
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
  const [kind, setKind] = useState<BookingKind>(
    trip.transport === "fly" ? "flight" : trip.transport === "train" ? "train" : "hotel",
  );
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
      const attachment_path = file
        ? await uploadHouseholdFile(trip.household_id, "bookings", file)
        : null;
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
    <form
      onSubmit={submit}
      className="mb-3 grid grid-cols-2 gap-1.5 rounded-lg border border-brass bg-[#fffdf8] p-2.5"
    >
      <select
        aria-label="Type"
        className={smallSelect}
        value={kind}
        onChange={(e) => setKind(e.target.value as BookingKind)}
      >
        {Object.entries(KIND_ICON).map(([k, icon]) => (
          <option key={k} value={k}>
            {icon} {k === "hotel" ? "Place to stay" : k[0].toUpperCase() + k.slice(1)}
          </option>
        ))}
      </select>
      <input
        className={inputCls}
        inputMode="decimal"
        placeholder="Cost"
        aria-label="Cost"
        value={cost}
        onChange={(e) => setCost(e.target.value)}
      />
      <input
        className={`${inputCls} col-span-2`}
        placeholder={kind === "hotel" ? "e.g. Lakeside cabin (Airbnb)" : "e.g. AC 870 to Kochi"}
        aria-label="Booking"
        maxLength={160}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        className={`${inputCls} col-span-2`}
        placeholder="Confirmation number"
        aria-label="Confirmation number"
        maxLength={60}
        autoCapitalize="characters"
        value={conf}
        onChange={(e) => setConf(e.target.value)}
      />
      <input
        type="date"
        aria-label="Date"
        className={smallSelect}
        value={day}
        onChange={(e) => setDay(e.target.value)}
      />
      <input
        type="time"
        aria-label="Time"
        className={smallSelect}
        value={time}
        onChange={(e) => setTime(e.target.value)}
      />
      <label className="col-span-2 flex min-h-11 items-center gap-2 text-xs">
        <span className="font-bold text-ink-2">Ticket / PDF</span>
        <input
          type="file"
          accept="application/pdf,image/*"
          aria-label="Attachment"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
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
          <div
            className="mt-1 h-2 overflow-hidden rounded-full bg-[#efe4cf]"
            role="img"
            aria-label={`${Math.round((100 * total) / plan)}% of budget used`}
          >
            <div
              className={`h-full ${over ? "bg-urgent" : "bg-brass"}`}
              style={{ width: `${Math.min(100, (100 * total) / plan)}%` }}
            />
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
          <input
            className={inputCls}
            inputMode="decimal"
            aria-label={`Planned budget in ${cur}`}
            placeholder={`Planned budget (${cur})`}
            value={planned}
            onChange={(e) => setPlanned(e.target.value)}
          />
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
          m.insert({
            household_id: trip.household_id,
            trip_id: trip.id,
            title: title.trim().slice(0, 120),
            amount: a,
            paid_by: paidBy || me?.id || null,
            spent_on: torontoDayKey(new Date()),
          });
          setTitle("");
          setAmount("");
        }}
      >
        <input
          className={`${inputCls} col-span-3`}
          placeholder="Add an expense, e.g. Groceries for the cottage"
          aria-label="Expense"
          maxLength={120}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <input
          className={`${inputCls} w-full`}
          inputMode="decimal"
          placeholder="Amount"
          aria-label="Amount"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <select
          aria-label="Paid by"
          className={smallSelect}
          value={paidBy || me?.id || ""}
          onChange={(e) => setPaidBy(e.target.value)}
        >
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
      {[
        ...booked.map((b) => ({
          key: `b:${b.id}`,
          title: `${KIND_ICON[b.kind]} ${b.title}`,
          amount: Number(b.cost),
          who: null as string | null,
          del: null as null | (() => void),
        })),
        ...expenses.map((x) => ({
          key: x.id,
          title: x.title,
          amount: Number(x.amount),
          who: x.paid_by,
          del: () => m.remove(x.id, `Removed “${x.title}”`),
        })),
      ].map((r) => (
        <div
          key={r.key}
          className="flex items-center gap-2 border-b border-dashed border-[#e6d9c2] py-1 text-sm"
        >
          <span className="flex-1">
            {r.title}
            {r.who && (
              <span className="ml-1 text-[11px] text-ink-2">· {byId(r.who)?.display_name}</span>
            )}
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
      <Trash
        rows={trashed(rows).filter((x) => x.trip_id === trip.id)}
        label={(r) => r.title}
        onRestore={m.restore}
      />
    </Sec>
  );
}

// ======================================================================
// Someday: trip ideas
// ======================================================================

function Ideas({ onPlan }: { onPlan: (idea: TripIdea) => void }) {
  const { me } = usePeople();
  const { data: rows } = useRows<TripIdea>("trip_ideas");
  const m = useRowMutation<TripIdea>("trip_ideas");
  const [title, setTitle] = useState("");
  const [vibe, setVibe] = useState<Vibe | null>(null);
  const ideas = live(rows);
  return (
    <Sec title="Someday">
      <form
        className="mb-2 space-y-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim() || !me) return;
          m.insert({ household_id: me.household_id, title: title.trim().slice(0, 120), vibe });
          setTitle("");
          setVibe(null);
        }}
      >
        <div className="flex gap-1.5">
          <input
            className={inputCls}
            placeholder="A trip you'd like to take, e.g. Amalfi coast"
            aria-label="Trip idea"
            maxLength={120}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button type="submit" className={addBtn} disabled={!title.trim()}>
            Add
          </button>
        </div>
        {title.trim() && (
          <div className="flex flex-wrap gap-1.5" aria-label="Its vibe (optional)">
            {(Object.keys(VIBES) as Vibe[]).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={vibe === v}
                className={chip(vibe === v)}
                onClick={() => setVibe(vibe === v ? null : v)}
              >
                {VIBES[v].icon} {VIBES[v].label}
              </button>
            ))}
          </div>
        )}
      </form>
      {ideas.length === 0 && (
        <p className="m-0 text-xs text-ink-2">Dream trips live here until they get dates.</p>
      )}
      {ideas.map((i) => (
        <div
          key={i.id}
          className="flex items-center gap-2 border-b border-dashed border-[#e6d9c2] py-1 text-sm"
        >
          <span className="flex-1">
            {i.vibe && <span aria-hidden="true">{VIBES[i.vibe].icon} </span>}
            {i.title}
          </span>
          <button type="button" className={linkBtn} onClick={() => onPlan(i)}>
            Plan it
          </button>
          <IconButton
            label={`Delete ${i.title}`}
            onClick={() => m.remove(i.id, `Removed “${i.title}”`)}
          >
            <TrashIcon />
          </IconButton>
        </div>
      ))}
      <Trash rows={trashed(rows)} label={(r) => r.title} onRestore={m.restore} />
    </Sec>
  );
}
