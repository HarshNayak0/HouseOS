"use client";

import { useState } from "react";
import { PERSON_COLORS } from "@/lib/colors";
import { useHousehold, type Member } from "@/lib/household";
import { usePartnerEdited } from "@/lib/lists/presence";
import { dismiss, useToasts } from "@/lib/lists/toast";

export function Sec({ title, right, children }: { title: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h3 className="m-0 mb-1.5 flex items-center justify-between gap-2 text-[11.5px] font-bold tracking-[0.09em] text-ink-2 uppercase">
        <span>{title}</span>
        {right}
      </h3>
      {children}
    </section>
  );
}

export function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="-m-2 flex h-11 w-11 flex-none cursor-pointer items-center justify-center">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} className="h-[18px] w-[18px] accent-red-oxide" />
    </label>
  );
}

/** Members by id plus helpers for "Me / Prerna / Both". */
export function usePeople() {
  const { data } = useHousehold();
  const members = data?.members ?? [];
  const me = data?.me ?? null;
  const partner = data?.partner ?? null;
  const byId = (id: string | null | undefined): Member | null => members.find((m) => m.id === id) ?? null;
  const byUser = (uid: string | null | undefined): Member | null => members.find((m) => m.user_id === uid) ?? null;
  const both = data?.settings?.both_color ?? "leaf";
  return { me, partner, members, byId, byUser, bothColor: both, myUserId: data?.user?.id ?? null };
}

export function WhoChip({ memberId, small }: { memberId: string | null | undefined; small?: boolean }) {
  const { byId, bothColor } = usePeople();
  const m = byId(memberId);
  const color = m ? PERSON_COLORS[m.color].hex : PERSON_COLORS[bothColor].hex;
  return (
    <span
      className={`flex-none rounded-full font-bold text-white ${small ? "px-1.5 py-px text-[10px]" : "px-[7px] py-[2px] text-[11px]"}`}
      style={{ background: color }}
    >
      {m ? m.display_name : "Both"}
    </span>
  );
}

/** Small "updated by Prerna just now" line under a row the other person just changed. */
export function PartnerHint({ id }: { id: string }) {
  const fresh = usePartnerEdited(id);
  const { partner } = usePeople();
  if (!fresh || !partner) return null;
  return <span className="block text-[11px] font-bold text-brass">updated by {partner.display_name} just now</span>;
}

export function Row({ done, children, className = "" }: { done?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={`flex min-h-11 items-center gap-2.5 border-b border-dashed border-[#e6d9c2] py-1.5 text-sm last:border-b-0 ${done ? "[&_.grow]:text-[#a8998a] [&_.grow]:line-through" : ""} ${className}`}>
      {children}
    </div>
  );
}

export function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="-m-1.5 flex h-11 w-11 flex-none items-center justify-center rounded-full text-ink-2 hover:bg-[#f3ead9]">
      {children}
    </button>
  );
}

export const TrashIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14" />
  </svg>
);

export function EmptyState({ title, hint, example }: { title: string; hint: string; example?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-[#e0d2b8] bg-[#fffdf8] p-3 text-sm">
      <p className="m-0 font-bold">{title}</p>
      <p className="mt-1 mb-0 text-ink-2">{hint}</p>
      {example && (
        <div className="mt-2 opacity-70" aria-label="Example">
          <span className="text-[10px] font-bold tracking-wider text-ink-2 uppercase">Example</span>
          {example}
        </div>
      )}
    </div>
  );
}

export const inputCls = "min-h-11 min-w-0 flex-1 rounded-lg border border-[#dccdb2] bg-white px-2.5 text-[15px]";
export const smallSelect = "min-h-11 rounded-lg border border-[#dccdb2] bg-white px-2 text-sm";
export const addBtn = "min-h-11 flex-none rounded-lg bg-red-oxide px-3 text-sm font-bold text-white disabled:opacity-50";
export const linkBtn = "min-h-11 text-xs font-bold text-teak underline";

/** "Recently deleted" (7-day trash) with Restore. */
export function Trash<T extends { id: string; deleted_at: string | null }>({
  rows,
  label,
  onRestore,
}: {
  rows: T[];
  label: (r: T) => string;
  onRestore: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  if (!rows.length) return null;
  return (
    <div className="mt-3">
      <button type="button" className={linkBtn} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Recently deleted ({rows.length})
      </button>
      {open && (
        <div className="mt-1">
          {rows.map((r) => (
            <Row key={r.id}>
              <span className="grow text-ink-2">{label(r)}</span>
              <button type="button" className={linkBtn} onClick={() => onRestore(r.id)}>
                Restore
              </button>
            </Row>
          ))}
          <p className="mt-1 text-[11px] text-ink-2">Deleted items are removed for good after 7 days.</p>
        </div>
      )}
    </div>
  );
}

export function Toaster() {
  const toasts = useToasts();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-3 z-50 flex flex-col items-center gap-2 px-3">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === "error" ? "alert" : "status"}
          className={`pointer-events-auto flex max-w-sm items-center gap-3 rounded-full px-4 py-2 text-[13px] text-[#fbf8f2] shadow-lg ${t.tone === "error" ? "bg-urgent" : "bg-[rgba(59,36,24,0.92)]"}`}
        >
          <span>{t.text}</span>
          {t.action && (
            <button
              type="button"
              className="min-h-9 font-bold text-brass-light underline"
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
