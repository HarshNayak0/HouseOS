"use client";

import { useEffect, useRef, useState } from "react";
import { live, useRowMutation, useRows } from "@/lib/lists/rows";
import { toast } from "@/lib/lists/toast";
import { goToRoom } from "@/lib/nav";
import type { RoomId } from "@/scene/config";
import type { Note } from "@/panels/Notes";
import type { ShoppingItem } from "@/panels/ShoppingList";
import type { Task } from "@/panels/Tasks";
import { usePeople } from "@/panels/ui";

type Kind = "grocery" | "task" | "note";
const KINDS: { kind: Kind; icon: string; label: string; title: string; placeholder: string; room: RoomId }[] = [
  { kind: "grocery", icon: "🛒", label: "Grocery", title: "Add to the shopping list", placeholder: "e.g. Coconut milk", room: "kitchen" },
  { kind: "task", icon: "✓", label: "Task", title: "New task", placeholder: "e.g. Book dental cleanings", room: "office" },
  { kind: "note", icon: "📝", label: "Note", title: "Leave a note", placeholder: "e.g. Landlord coming Thu 10 am", room: "living" },
];
const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * One floating + that fans out into Grocery, Task and Note, so the everyday things take one tap from
 * anywhere in the house. Not shown while a room's panel is open: each room has its own add box.
 */
export function QuickAdd() {
  const { me } = usePeople();
  const { data: shopping } = useRows<ShoppingItem>("shopping_items");
  const shop = useRowMutation<ShoppingItem>("shopping_items");
  const tasks = useRowMutation<Task>("tasks");
  const notes = useRowMutation<Note>("notes");
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind | null>(null);
  const [text, setText] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setKind(null);
    setText("");
  };
  // Escape or a tap elsewhere closes it
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: PointerEvent) => !rootRef.current?.contains(e.target as Node) && close();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  if (!me) return null;
  const current = KINDS.find((k) => k.kind === kind) ?? null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = text.trim().replace(/\s+/g, " ");
    if (!value || !current) return;
    const done = (msg: string) => {
      toast(msg, { action: { label: "Open", run: () => goToRoom(current.room) } });
      close();
    };
    if (current.kind === "grocery") {
      // same rules as the list itself: no duplicates, and a ticked-off item comes back instead
      const items = live(shopping);
      const existing = items.find((i) => i.normalized_name === norm(value));
      if (existing && !existing.checked_at) return done(`${existing.name} is already on the list`);
      if (existing) shop.update(existing.id, { checked_at: null });
      else shop.insert({ household_id: me.household_id, name: value.slice(0, 80), store: "Any store" });
      return done(`Added ${value} to the shopping list`);
    }
    if (current.kind === "task") {
      tasks.insert({ household_id: me.household_id, title: value.slice(0, 120), due_at: null, due_has_time: false, assignee_id: null, priority: 0, visibility: "shared" });
      return done("Task added");
    }
    notes.insert({ household_id: me.household_id, body: value.slice(0, 500), color: "turmeric", pinned: false, expires_at: null });
    done("Note left on the board");
  };

  return (
    <div
      ref={rootRef}
      className="fixed right-4 bottom-[max(20px,calc(env(safe-area-inset-bottom)+12px))] z-[15] flex flex-col items-end gap-2.5"
    >
      {current && (
        <form onSubmit={submit} className="w-[min(320px,calc(100vw-32px))] rounded-[10px] border border-brass bg-paper p-3 shadow-[0_12px_40px_rgba(59,36,24,0.28)]" aria-label={current.title}>
          <p className="m-0 mb-2 text-sm font-bold">
            {current.icon} {current.title}
          </p>
          <div className="flex gap-1.5">
            <input
              autoFocus
              className="min-h-11 min-w-0 flex-1 rounded-lg border border-line-strong bg-card px-2.5 text-[15px]"
              placeholder={current.placeholder}
              aria-label={current.title}
              maxLength={current.kind === "note" ? 500 : 120}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            <button type="submit" disabled={!text.trim()} className="min-h-11 flex-none rounded-lg bg-red-oxide px-3 text-sm font-bold text-white disabled:opacity-50">
              Add
            </button>
          </div>
        </form>
      )}
      {open && !current && (
        <ul className="m-0 flex list-none flex-col items-end gap-2.5 p-0" aria-label="Quick add">
          {[...KINDS].reverse().map((k, i) => (
            <li key={k.kind} className="flex items-center gap-2 motion-safe:animate-[quickadd-in_160ms_ease-out_both]" style={{ animationDelay: `${(KINDS.length - 1 - i) * 40}ms` }}>
              <span className="rounded-full bg-paper px-2.5 py-1 text-xs font-bold text-ink shadow-[0_2px_8px_rgba(59,36,24,0.18)]" aria-hidden="true">
                {k.label}
              </span>
              <button
                type="button"
                onClick={() => setKind(k.kind)}
                aria-label={k.title}
                className="flex h-12 w-12 items-center justify-center rounded-full border border-brass bg-paper text-xl shadow-[0_4px_14px_rgba(59,36,24,0.22)]"
              >
                <span aria-hidden="true">{k.icon}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        aria-label={open ? "Close quick add" : "Quick add: grocery, task or note"}
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
        className="flex h-14 w-14 items-center justify-center rounded-full bg-red-oxide text-white shadow-[0_6px_20px_rgba(59,36,24,0.35)]"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" className={`transition-transform duration-200 ${open ? "rotate-45" : ""}`}>
          <path d="M12 4v16M4 12h16" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
