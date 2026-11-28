"use client";

import { celebrate } from "@/lib/feel";
import { useState } from "react";
import { trashed, useRowMutation, useRows, type BaseRow } from "@/lib/lists/rows";
import { visibleNotes } from "@/lib/lists/notes";
import { formatToronto } from "@/lib/time";
import { EmptyState, IconButton, PartnerHint, Sec, Trash, TrashIcon, addBtn, smallSelect, usePeople } from "./ui";

export interface Note extends BaseRow {
  body: string;
  color: NoteColor;
  pinned: boolean;
  expires_at: string | null;
  archived_at: string | null;
}
type NoteColor = "turmeric" | "lotus" | "leaf" | "sky" | "sand";
export const NOTE_COLORS: Record<NoteColor, string> = {
  turmeric: "#fff1b8",
  lotus: "#f6d0c8",
  leaf: "#d8e8c4",
  sky: "#d6e6ef",
  sand: "#efe3cb",
};
const EXPIRY: [string, number | null][] = [
  ["Keep", null],
  ["1 day", 1],
  ["3 days", 3],
  ["1 week", 7],
];

export function NotesBoard() {
  const { me, byUser } = usePeople();
  const { data: rows, isLoading } = useRows<Note>("notes");
  const m = useRowMutation<Note>("notes");
  const [body, setBody] = useState("");
  const [color, setColor] = useState<NoteColor>("turmeric");
  const [days, setDays] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);

  const notes = visibleNotes(rows).sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.created_at < b.created_at ? 1 : -1));

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim() || !me) return;
    const id = m.insert({
      household_id: me.household_id,
      body: body.trim().slice(0, 500),
      color,
      pinned,
      expires_at: days ? new Date(Date.now() + days * 86_400_000).toISOString() : null,
    });
    setBody("");
    setPinned(false);
    celebrate("note");
    setFresh(id);
  };

  return (
    <Sec title="Notes board">
      {!isLoading && notes.length === 0 && (
        <EmptyState
          title="The board is empty"
          hint="Leave a note for each other. When one of you posts, the brass lamp in the living room brightens on the other's screen for a day."
          example={
            <div className="mt-1 w-40 rounded p-2.5 text-[13px] text-[#3b2418] shadow-sm" style={{ background: NOTE_COLORS.lotus }}>
              Have a good shift ☀️
            </div>
          }
        />
      )}
      <div className="grid grid-cols-2 gap-2">
        {notes.map((n) => {
          const author = byUser(n.created_by);
          return (
            <div key={n.id} className={`note-card relative flex min-h-[84px] flex-col rounded p-2.5 text-[13px] text-[#3b2418] shadow-[0_2px_4px_rgba(59,36,24,0.12)] [&_button]:text-[#6b5444] ${n.id === fresh ? "moment-pin" : ""}`} style={{ background: NOTE_COLORS[n.color] }}>
              {n.pinned && (
                <span className="absolute -top-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full bg-red-oxide shadow" role="img" aria-label="Pinned" />
              )}
              <p className="m-0 grow break-words whitespace-pre-wrap">{n.body}</p>
              <PartnerHint id={n.id} />
              <div className="mt-1.5 flex items-center justify-between text-[10.5px] font-bold text-[rgba(59,36,24,0.85)]">
                <span>
                  {author?.display_name ?? "?"} · {formatToronto(n.created_at, { month: "short", day: "numeric" })}
                  {n.expires_at ? " · fades soon" : ""}
                </span>
                <span className="flex">
                  <IconButton label={n.pinned ? "Unpin note" : "Pin note"} onClick={() => m.update(n.id, { pinned: !n.pinned })}>
                    <span aria-hidden="true">{n.pinned ? "📌" : "📍"}</span>
                  </IconButton>
                  <IconButton label="Delete note" onClick={() => m.remove(n.id, "Note removed")}>
                    <TrashIcon />
                  </IconButton>
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <form onSubmit={add} className="mt-2">
        <textarea
          aria-label="New note"
          placeholder="Leave a note…"
          rows={2}
          maxLength={500}
          className="w-full rounded-lg border border-line-strong p-2 text-[15px] text-[#3b2418] caret-[#3b2418] placeholder:text-[#7a6250]"
          style={{ background: NOTE_COLORS[color] }}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <div className="flex gap-1" role="radiogroup" aria-label="Note colour">
            {(Object.keys(NOTE_COLORS) as NoteColor[]).map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={c}
                onClick={() => setColor(c)}
                className={`h-9 w-9 rounded-full border-2 ${color === c ? "border-brass" : "border-transparent"}`}
                style={{ background: NOTE_COLORS[c] }}
              />
            ))}
          </div>
          <select aria-label="Expires" className={smallSelect} value={days ?? ""} onChange={(e) => setDays(e.target.value ? Number(e.target.value) : null)}>
            {EXPIRY.map(([l, d]) => (
              <option key={l} value={d ?? ""}>
                {l}
              </option>
            ))}
          </select>
          <label className="flex min-h-11 items-center gap-1.5 text-sm">
            <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} className="h-[18px] w-[18px] accent-red-oxide" />
            Pin
          </label>
          <button type="submit" className={`${addBtn} ml-auto`} disabled={!body.trim()}>
            Post
          </button>
        </div>
      </form>
      <Trash rows={trashed(rows)} label={(r) => r.body.slice(0, 40)} onRestore={m.restore} />
    </Sec>
  );
}
