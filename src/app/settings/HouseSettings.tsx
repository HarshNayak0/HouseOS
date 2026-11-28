"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { btnPrimary, input } from "@/components/ui/Card";
import { DECOR_KEYS, DECOR_LABELS, type DecorKey } from "@/lib/decor";
import { FEEL_CHANGED, buzz, celebrate, hapticsOn, setHapticsOn, setSoundsOn, soundsOn } from "@/lib/feel";
import { defaultNameplate } from "@/lib/homey";
import { householdKey, useHousehold } from "@/lib/household";
import { nameplateSchema } from "@/lib/schemas";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Section } from "./AccountSettings";

/** Shared: the gate's nameplate and which festivals and seasons decorate the house. */
export function HouseDecorSettings() {
  const { data } = useHousehold();
  const qc = useQueryClient();
  const s = data?.settings;
  const [plate, setPlate] = useState<string | null>(null);
  const [state, setState] = useState("idle");
  if (!data?.me) return null;
  const hh = data.me.household_id;
  const fallback = defaultNameplate(data.members);
  const value = plate ?? s?.nameplate ?? "";
  const off = new Set(s?.decor_off ?? []);
  const update = async (patch: Record<string, unknown>) => {
    const { error } = (await supabaseBrowser()?.from("household_settings").update(patch).eq("household_id", hh)) ?? {};
    await qc.invalidateQueries({ queryKey: householdKey });
    return error;
  };
  const savePlate = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = nameplateSchema.safeParse(value);
    if (!r.success) return setState(r.error.issues[0].message);
    setState("saving");
    const error = await update({ nameplate: r.data || null });
    setState(error ? error.message : "saved");
    setPlate(null);
  };
  const toggle = (k: DecorKey, on: boolean) => {
    const next = on ? [...off].filter((x) => x !== k) : [...off, k];
    update({ decor_off: next });
  };
  return (
    <Section title="The house">
      <form onSubmit={savePlate}>
        <label className="block text-sm font-bold" htmlFor="nameplate">
          Nameplate on the gate
        </label>
        <p className="m-0 mb-1.5 text-xs text-ink-2">Engraved in brass on the gatepost. Leave it empty for “{fallback}”.</p>
        <div className="flex flex-wrap items-center gap-2">
          <input id="nameplate" className={`${input} min-w-0 flex-1`} value={value} placeholder={fallback} maxLength={32} onChange={(e) => (setPlate(e.target.value), setState("idle"))} />
          <button type="submit" className={btnPrimary}>
            Save
          </button>
          {state !== "idle" && (
            <span role="status" className={`text-sm ${state === "saved" ? "text-leaf" : state === "saving" ? "text-ink-2" : "text-urgent"}`}>
              {state === "saved" ? "Saved ✓" : state === "saving" ? "Saving…" : state}
            </span>
          )}
        </div>
      </form>
      <fieldset className="m-0 mt-5 border-0 p-0">
        <legend className="mb-1 text-sm font-bold">Festivals, seasons and your dates</legend>
        <p className="m-0 mb-1 text-xs text-ink-2">The yard and verandah dress up for these. Changes show on both phones.</p>
        {DECOR_KEYS.map((k) => (
          <label key={k} className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5">
            <input type="checkbox" checked={!off.has(k)} onChange={(e) => toggle(k, e.target.checked)} className="mt-1 h-[18px] w-[18px] accent-red-oxide" />
            <span>
              <span className="block text-sm font-bold">{DECOR_LABELS[k].label}</span>
              <span className="block text-xs text-ink-2">{DECOR_LABELS[k].hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
    </Section>
  );
}

/** Per phone: soft sounds and haptics. */
export function FeelSettings() {
  const [sounds, setSounds] = useState(false);
  const [haptics, setHaptics] = useState(true);
  useEffect(() => {
    const sync = () => {
      setSounds(soundsOn());
      setHaptics(hapticsOn());
    };
    sync();
    window.addEventListener(FEEL_CHANGED, sync);
    return () => window.removeEventListener(FEEL_CHANGED, sync);
  }, []);
  return (
    <>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5">
        <input
          type="checkbox"
          checked={sounds}
          onChange={(e) => {
            setSoundsOn(e.target.checked);
            if (e.target.checked) celebrate("chore"); // a sample: the brass bell
          }}
          className="mt-1 h-[18px] w-[18px] accent-red-oxide"
        />
        <span>
          <span className="block text-sm font-bold">Soft sounds</span>
          <span className="block text-xs text-ink-2">
            A brass bell when a chore is done, a soft tick when you check something off, a paper rustle for a new note. While the house is open: birds in the morning, crickets after dark,
            rain when it&apos;s raining at home. Quiet, and made on the phone (nothing to download).
          </span>
        </span>
      </label>
      <label className="flex min-h-11 cursor-pointer items-start gap-3 py-1.5">
        <input
          type="checkbox"
          checked={haptics}
          onChange={(e) => {
            setHapticsOn(e.target.checked);
            if (e.target.checked) buzz("done");
          }}
          className="mt-1 h-[18px] w-[18px] accent-red-oxide"
        />
        <span>
          <span className="block text-sm font-bold">Haptics</span>
          <span className="block text-xs text-ink-2">A light tap when you tick something off, a double tap for a chore, a short one when you delete. On iPhone this is lighter (iOS 18 and later).</span>
        </span>
      </label>
    </>
  );
}
