"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PhotoViewer } from "@/components/house/PhotoViewer";
import { FILES_BUCKET, uploadHouseholdFile, useSignedUrl } from "@/lib/files";
import { householdKey, useHousehold } from "@/lib/household";
import { useHomeyState, useWallPhotoUrls } from "@/lib/homey";
import { live, useRows } from "@/lib/lists/rows";
import { toast } from "@/lib/lists/toast";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Sec, linkBtn } from "./ui";

interface Memory {
  id: string;
  title: string;
  photo_path: string | null;
  happened_on: string;
  deleted_at: string | null;
}

/** The three framed photos on the living-room wall: choose them here, tap to look closer. */
export function WallPhotos() {
  const { data } = useHousehold();
  const qc = useQueryClient();
  const urls = useWallPhotoUrls();
  const [picking, setPicking] = useState<number | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);
  const me = data?.me;
  const current = [0, 1, 2].map((i) => data?.settings?.wall_photos?.[i] ?? null);
  const shown = urls.filter((u): u is string => !!u);

  const save = async (i: number, path: string | null) => {
    if (!me) return;
    const next = [...current];
    next[i] = path ? { path } : null;
    const { error } = (await supabaseBrowser()?.from("household_settings").update({ wall_photos: next }).eq("household_id", me.household_id)) ?? {};
    if (error) return toast(`Couldn't save: ${error.message}`, { tone: "error" });
    await qc.invalidateQueries({ queryKey: householdKey });
    setPicking(null);
    toast(path ? "On the wall 🖼️" : "Taken down");
  };
  const upload = async (i: number, f: File | undefined) => {
    if (!f || !me) return;
    setBusy(i);
    try {
      await save(i, await uploadHouseholdFile(me.household_id, "photos", f));
    } catch (e) {
      toast((e as Error).message, { tone: "error" });
    }
    setBusy(null);
  };

  return (
    <Sec title="On the wall">
      <p className="m-0 mb-2 text-xs text-ink-2">Three frames hang in the living room. Tap one to look closer.</p>
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => (urls[i] ? setViewing(shown.indexOf(urls[i]!)) : setPicking(picking === i ? null : i))}
              aria-label={urls[i] ? `View photo ${i + 1}` : `Choose photo ${i + 1}`}
              className="aspect-square w-full overflow-hidden rounded-md border-[3px] border-teak bg-sunken p-0 shadow-[inset_0_0_0_2px_var(--color-brass)]"
            >
              {urls[i] ? (
                // eslint-disable-next-line @next/next/no-img-element -- signed URL to a private photo
                <img src={urls[i]!} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-2xl text-brass" aria-hidden="true">
                  {busy === i ? "…" : "+"}
                </span>
              )}
            </button>
            <button type="button" className={linkBtn} onClick={() => setPicking(picking === i ? null : i)} aria-expanded={picking === i}>
              {current[i] ? "Change" : "Add"}
            </button>
          </div>
        ))}
      </div>
      {picking !== null && (
        <div className="mt-2 rounded-lg border border-line bg-card-warm p-2.5">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex min-h-11 cursor-pointer items-center rounded-lg bg-red-oxide px-3 text-sm font-bold text-white">
              Upload a photo
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => upload(picking, e.target.files?.[0])} />
            </label>
            {current[picking] && (
              <button type="button" className={`${linkBtn} text-urgent`} onClick={() => save(picking, null)}>
                Take it down
              </button>
            )}
            <button type="button" className={linkBtn} onClick={() => setPicking(null)}>
              Cancel
            </button>
          </div>
          <FromMemories onPick={(path) => save(picking, path)} />
        </div>
      )}
      {viewing !== null && shown.length > 0 && <PhotoViewer urls={shown} start={Math.max(0, viewing)} onClose={() => setViewing(null)} />}
    </Sec>
  );
}

function FromMemories({ onPick }: { onPick: (path: string) => void }) {
  const { data: rows } = useRows<Memory>("date_memories");
  const withPhotos = live(rows).filter((m) => m.photo_path);
  if (!withPhotos.length) return <p className="m-0 mt-2 text-xs text-ink-2">Photos from your date memories will show here too.</p>;
  return (
    <>
      <p className="m-0 mt-2 mb-1 text-xs font-bold text-ink-2">Or one from your dates</p>
      <div className="grid grid-cols-4 gap-1.5">
        {withPhotos.slice(0, 16).map((m) => (
          <MemoryThumb key={m.id} m={m} onPick={onPick} />
        ))}
      </div>
    </>
  );
}

function MemoryThumb({ m, onPick }: { m: Memory; onPick: (path: string) => void }) {
  const { data: url } = useSignedUrl(FILES_BUCKET, m.photo_path);
  return (
    <button type="button" onClick={() => onPick(m.photo_path!)} aria-label={`Use the photo from ${m.title}`} className="aspect-square overflow-hidden rounded border border-line bg-sunken p-0">
      {/* eslint-disable-next-line @next/next/no-img-element -- signed URL to a private photo */}
      {url && <img src={url} alt="" className="h-full w-full object-cover" />}
    </button>
  );
}

/** One line about the jasmine on the verandah. */
export function JasmineNote() {
  const h = useHomeyState();
  if (!h) return null;
  const { thisWeek, total, growth } = h.jasmine;
  const stage = growth >= 8 ? "right across the verandah" : growth >= 5 ? "up the pillar and along the beam" : growth >= 2 ? "climbing the pillar" : "just a sprout";
  return (
    <p className="mt-4 mb-0 rounded-lg border border-ok-line bg-ok px-3 py-2 text-xs text-ink">
      🌼 The jasmine on the verandah is {stage}: {thisWeek} {thisWeek === 1 ? "thing" : "things"} done together this week
      {thisWeek >= 14 ? ", so it's in full flower" : thisWeek ? "" : ", so it's all green buds for now"} ({total} in all). Chores, tasks and dates help it grow.
    </p>
  );
}
