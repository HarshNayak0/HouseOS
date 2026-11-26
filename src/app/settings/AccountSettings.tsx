"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ColorPicker } from "@/components/account/ColorPicker";
import { InviteLink } from "@/components/account/InviteLink";
import { PushSetup } from "@/components/account/PushSetup";
import { btnPrimary, btnSecondary, input } from "@/components/ui/Card";
import { PERSON_COLORS, type PersonColor } from "@/lib/colors";
import { INSTANCE } from "@/lib/instance";
import { householdKey, useHousehold, type Member } from "@/lib/household";
import { memberProfileSchema, quietHoursSchema, roomLabelsSchema } from "@/lib/schemas";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { DEFAULT_LABELS, ROOM_IDS, type RoomId } from "@/scene/config";
import { CalendarSettings, MilestoneSettings } from "./CalendarSettings";

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-[11.5px] font-bold tracking-[0.09em] text-ink-2 uppercase">{title}</h2>
      {children}
    </section>
  );
}

function Saved({ state }: { state: "idle" | "saving" | "saved" | string }) {
  if (state === "idle") return null;
  return (
    <span role="status" className={`text-sm ${state === "saved" ? "text-leaf" : state === "saving" ? "text-ink-2" : "text-urgent"}`}>
      {state === "saved" ? "Saved ✓" : state === "saving" ? "Saving…" : state}
    </span>
  );
}

export function AccountSettings() {
  const { data, isLoading, error } = useHousehold();
  if (isLoading) return <p className="mt-4 text-sm text-ink-2">Loading…</p>;
  if (error) return <p className="mt-4 text-sm text-urgent">Couldn&apos;t load your household. Check your connection and reload.</p>;
  if (!data?.me)
    return (
      <p className="mt-4 text-sm">
        You haven&apos;t set up your home yet.{" "}
        <Link href="/onboarding" className="font-bold text-teak underline">
          Start here
        </Link>
      </p>
    );
  return (
    <>
      <Profile me={data.me} partner={data.partner} />
      <Household householdId={data.me.household_id} partner={data.partner} bothColor={data.settings?.both_color ?? "leaf"} />
      <Notifications me={data.me} />
      <CalendarSettings />
      <MilestoneSettings />
      <RoomLabels householdId={data.me.household_id} current={data.settings?.room_labels ?? {}} />
      <Section title="Your data">
        <a href="/api/export" download className={btnSecondary}>
          Export everything (JSON)
        </a>
      </Section>
      <Section title="Account">
        <p className="mt-0 mb-2 text-sm text-ink-2">Signed in as {data.user?.email}</p>
        <form action="/auth/signout" method="post">
          <button type="submit" className={btnSecondary}>
            Sign out
          </button>
        </form>
      </Section>
    </>
  );
}

function Profile({ me, partner }: { me: Member; partner: Member | null }) {
  const qc = useQueryClient();
  const [name, setName] = useState(me.display_name);
  const [color, setColor] = useState<PersonColor>(me.color);
  const [state, setState] = useState("idle");
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = memberProfileSchema.safeParse({ display_name: name, color });
    if (!r.success) return setState(r.error.issues[0].message);
    setState("saving");
    const { error } = (await supabaseBrowser()?.from("members").update(r.data).eq("id", me.id)) ?? {};
    setState(error ? error.message : "saved");
    qc.invalidateQueries({ queryKey: householdKey });
  };
  return (
    <Section title="You">
      <form onSubmit={save}>
        <label htmlFor="my-name" className="block text-sm font-bold">
          Name
        </label>
        <input id="my-name" className={`${input} mt-1 mb-3`} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} />
        <p className="mt-0 mb-2 text-sm font-bold">Your colour</p>
        <ColorPicker value={color} onChange={setColor} name="Your colour" taken={partner?.color} />
        <div className="mt-3 flex items-center gap-3">
          <button type="submit" className={btnPrimary}>
            Save
          </button>
          <Saved state={state} />
        </div>
      </form>
    </Section>
  );
}

function Household({ householdId, partner, bothColor }: { householdId: string; partner: Member | null; bothColor: PersonColor }) {
  const qc = useQueryClient();
  const [both, setBoth] = useState<PersonColor>(bothColor);
  const [state, setState] = useState("idle");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const router = useRouter();
  const saveBoth = async (c: PersonColor) => {
    setBoth(c);
    setState("saving");
    const { error } = (await supabaseBrowser()?.from("household_settings").update({ both_color: c }).eq("household_id", householdId)) ?? {};
    setState(error ? error.message : "saved");
    qc.invalidateQueries({ queryKey: householdKey });
  };
  const leave = async () => {
    const { error } = (await supabaseBrowser()?.rpc("leave_household")) ?? {};
    if (error) return setState(error.message);
    await qc.invalidateQueries({ queryKey: householdKey });
    router.replace("/onboarding");
  };
  return (
    <Section title="Household">
      {partner ? (
        <p className="mt-0 flex items-center gap-2 text-sm">
          <span className="inline-block h-4 w-4 rounded-full" style={{ background: PERSON_COLORS[partner.color].hex }} aria-hidden="true" />
          <span>
            <b>{partner.display_name}</b> lives here too.
          </span>
        </p>
      ) : (
        <div className="mb-2">
          <p className="mt-0 mb-2 text-sm text-ink-2">It&apos;s just you so far.</p>
          <InviteLink />
        </div>
      )}
      <p className="mt-4 mb-2 text-sm font-bold">Colour for things you share</p>
      <ColorPicker value={both} onChange={saveBoth} name="Shared colour" />
      <div className="mt-2">
        <Saved state={state} />
      </div>
      <div className="mt-4">
        {!confirmLeave ? (
          <button type="button" className="min-h-11 text-sm font-bold text-urgent underline" onClick={() => setConfirmLeave(true)}>
            Leave the household…
          </button>
        ) : (
          <div role="alertdialog" aria-labelledby="leave-title" className="rounded-lg border border-[#e7b2a8] bg-[#fdf0ec] p-3">
            <p id="leave-title" className="m-0 text-sm">
              {partner
                ? `Leave? ${partner.display_name} keeps the house and everything in it. You'd need a new invite to come back.`
                : "Leave? You're the only one here, so the house and everything in it will be deleted."}
            </p>
            <div className="mt-2 flex gap-2">
              <button type="button" className={btnSecondary} onClick={() => setConfirmLeave(false)}>
                Stay
              </button>
              <button type="button" className={`${btnPrimary} bg-urgent`} onClick={leave}>
                Leave
              </button>
            </div>
          </div>
        )}
      </div>
    </Section>
  );
}

interface Prefs {
  enabled: boolean;
  quiet_start: string;
  quiet_end: string;
  kinds: Record<string, boolean>;
}

const KINDS: [string, string][] = [
  ["notes", "New notes from your partner"],
  ["chores", "Chores when they're due"],
  ["tasks", "Tasks when they're due"],
  ["milestones", "Birthdays and anniversaries coming up"],
  ["store", "When your partner is at the store, and what they add while you are"],
  ["digest", "Morning summary at 8 am: your day, plus what's coming up"],
];

function Notifications({ me }: { me: Member }) {
  const { data: prefs } = useQuery({
    queryKey: ["prefs", me.id],
    queryFn: async () => {
      const { data } = (await supabaseBrowser()?.from("notification_prefs").select("enabled, quiet_start, quiet_end, kinds").eq("member_id", me.id).maybeSingle()) ?? {};
      return (data as Prefs | null) ?? null;
    },
  });
  const [form, setForm] = useState<Prefs | null>(null);
  const [state, setState] = useState("idle");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- seed the form once prefs load
    if (prefs && !form) setForm({ ...prefs, kinds: prefs.kinds ?? {}, quiet_start: prefs.quiet_start.slice(0, 5), quiet_end: prefs.quiet_end.slice(0, 5) });
  }, [prefs, form]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    const r = quietHoursSchema.safeParse(form);
    if (!r.success) return setState(r.error.issues[0].message);
    setState("saving");
    const { error } =
      (await supabaseBrowser()?.from("notification_prefs").update({ ...r.data, enabled: form.enabled, kinds: form.kinds }).eq("member_id", me.id)) ?? {};
    setState(error ? error.message : "saved");
  };
  return (
    <Section title="Notifications">
      <PushSetup householdId={me.household_id} memberId={me.id} showTest />
      {form && (
        <form onSubmit={save} className="mt-4">
          <label className="flex min-h-11 items-center gap-3 text-sm font-bold">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} className="h-[18px] w-[18px] accent-red-oxide" />
            Send me notifications
          </label>
          <fieldset className="m-0 mt-1 border-0 p-0 pl-6" disabled={!form.enabled}>
            <legend className="sr-only">Which notifications</legend>
            {KINDS.map(([k, label]) => (
              <label key={k} className="flex min-h-11 items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={form.kinds?.[k] !== false}
                  onChange={(e) => setForm({ ...form, kinds: { ...form.kinds, [k]: e.target.checked } })}
                  className="h-[18px] w-[18px] accent-red-oxide"
                />
                {label}
              </label>
            ))}
          </fieldset>
          <fieldset className="m-0 mt-2 border-0 p-0">
            <legend className="mb-1 text-sm font-bold">Quiet hours ({INSTANCE.city} time)</legend>
            <div className="flex items-center gap-2">
              <input type="time" aria-label="Quiet from" className={`${input} w-32`} value={form.quiet_start} onChange={(e) => setForm({ ...form, quiet_start: e.target.value })} />
              <span>to</span>
              <input type="time" aria-label="Quiet until" className={`${input} w-32`} value={form.quiet_end} onChange={(e) => setForm({ ...form, quiet_end: e.target.value })} />
            </div>
          </fieldset>
          <div className="mt-3 flex items-center gap-3">
            <button type="submit" className={btnPrimary}>
              Save
            </button>
            <Saved state={state} />
          </div>
        </form>
      )}
    </Section>
  );
}

function RoomLabels({ householdId, current }: { householdId: string; current: Partial<Record<RoomId, { name: string; ml: string }>> }) {
  const qc = useQueryClient();
  const build = (over: typeof current) =>
    Object.fromEntries(
      ROOM_IDS.map((id) => [id, { name: over[id]?.name ?? DEFAULT_LABELS[id].name, ml: over[id]?.ml ?? DEFAULT_LABELS[id].ml }]),
    ) as Record<RoomId, { name: string; ml: string }>;
  const [labels, setLabels] = useState(() => build(current));
  const [state, setState] = useState("idle");
  const set = (id: RoomId, k: "name" | "ml", v: string) => setLabels((l) => ({ ...l, [id]: { ...l[id], [k]: v } }));
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    // store only what differs from the built-in labels
    const overrides = Object.fromEntries(
      ROOM_IDS.filter((id) => labels[id].name !== DEFAULT_LABELS[id].name || labels[id].ml !== DEFAULT_LABELS[id].ml).map((id) => [
        id,
        { name: labels[id].name, ml: labels[id].ml },
      ]),
    );
    const r = roomLabelsSchema.safeParse(overrides);
    if (!r.success) return setState(r.error.issues[0].message);
    setState("saving");
    const { error } = (await supabaseBrowser()?.from("household_settings").update({ room_labels: r.data }).eq("household_id", householdId)) ?? {};
    setState(error ? error.message : "saved");
    qc.invalidateQueries({ queryKey: householdKey });
  };
  return (
    <Section title="Room names">
      <form onSubmit={save}>
        <div className="grid grid-cols-[1fr_1fr] gap-2">
          <span className="text-xs font-bold text-ink-2">English</span>
          <span className="text-xs font-bold text-ink-2">Malayalam</span>
          {ROOM_IDS.map((id) => (
            <div key={id} className="contents">
              <input aria-label={`${DEFAULT_LABELS[id].name} name`} className={input} value={labels[id].name} maxLength={30} onChange={(e) => set(id, "name", e.target.value)} />
              <input aria-label={`${DEFAULT_LABELS[id].name} name in Malayalam`} lang="ml" className={`${input} font-ml`} value={labels[id].ml} maxLength={30} onChange={(e) => set(id, "ml", e.target.value)} />
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="submit" className={btnPrimary}>
            Save
          </button>
          <button type="button" className={btnSecondary} onClick={() => setLabels(build({}))}>
            Reset to defaults
          </button>
          <Saved state={state} />
        </div>
      </form>
    </Section>
  );
}
