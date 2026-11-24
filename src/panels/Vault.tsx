"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { live, useRows } from "@/lib/lists/rows";
import { toast } from "@/lib/lists/toast";
import { torontoDayKey } from "@/lib/time";
import { daysBetween } from "@/lib/trips";
import {
  addPasskey,
  attachFile,
  callVault,
  deleteItem,
  deviceName,
  fileLink,
  listItems,
  lockVault,
  passkeysSupported,
  removeFile,
  saveItem,
  setPin,
  unlockWithPasskey,
  unlockWithPin,
  useVaultSession,
  vaultStatus,
  VaultError,
  type VaultItem,
  type VaultItemRow,
  type VaultStatus,
} from "@/lib/vault";
import { SECTION_ORDER, SECTIONS, pinProblem, type FieldDef, type VaultSection } from "../../supabase/functions/_shared/vault";
import { EmptyState, Sec, addBtn, inputCls, linkBtn, smallSelect, usePeople } from "./ui";

const STATUS_KEY = ["vault-status"] as const;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong");

export function ClosetVault() {
  const session = useVaultSession();
  return (
    <>
      <Renewals />
      {session ? <VaultOpen /> : <VaultLock />}
    </>
  );
}

/** Upcoming lease and insurance renewals: visible without unlocking (labels and dates aren't secret). */
function Renewals() {
  const { data } = useRows<VaultItemRow>("vault_items");
  const today = torontoDayKey(new Date());
  const soon = live(data)
    .filter((i) => i.renewal_date && i.renewal_date >= today)
    .sort((a, b) => (a.renewal_date! < b.renewal_date! ? -1 : 1))
    .slice(0, 4);
  if (!soon.length) return null;
  return (
    <Sec title="Renewals">
      {soon.map((i) => {
        const d = daysBetween(today, i.renewal_date!);
        return (
          <div key={i.id} className={`mb-1.5 flex items-center gap-2 rounded-lg border px-2.5 py-2 text-sm ${d <= 30 ? "border-[#e9d4a4] bg-[#fff8e6]" : "border-[#e6d9c2] bg-white"}`}>
            <span aria-hidden="true">{d <= 30 ? "🔔" : SECTIONS[i.section].icon}</span>
            <span className="flex-1 font-bold">{i.label}</span>
            <span className="text-xs text-ink-2">{d === 0 ? "today" : d === 1 ? "tomorrow" : `in ${d} days`}</span>
          </div>
        );
      })}
    </Sec>
  );
}

// ---------- locked ----------
function VaultLock() {
  const { data: status, error, isLoading, refetch } = useQuery({ queryKey: STATUS_KEY, queryFn: vaultStatus, staleTime: 0, retry: false });
  const [resetting, setResetting] = useState(false);
  if (isLoading) return <p className="text-sm text-ink-2">Checking the lock…</p>;
  if (error || !status)
    return (
      <Sec title="Home vault">
        <p className="text-sm text-urgent">{errMsg(error)}</p>
        <button type="button" className={linkBtn} onClick={() => refetch()}>
          Try again
        </button>
      </Sec>
    );
  if (!status.pin_set || resetting) {
    return (
      <Sec title={status.pin_set ? "Reset your PIN" : "Set up the vault"}>
        <Explainer />
        {status.signed_in_recently ? (
          <NewPin onDone={() => setResetting(false)} />
        ) : (
          <SignInAgain why={status.pin_set ? "To reset your PIN, first confirm it's you by signing in with Google again." : "First, confirm it's you by signing in with Google again. Then you'll pick a 6-digit PIN."} />
        )}
        {resetting && (
          <button type="button" className={linkBtn} onClick={() => setResetting(false)}>
            Cancel
          </button>
        )}
      </Sec>
    );
  }
  return <Unlock status={status} onForgot={() => setResetting(true)} />;
}

function Explainer() {
  return (
    <p className="mt-0 text-sm text-ink-2">
      The closet keeps Wi-Fi passwords, contacts, the lease, insurance, appliance manuals and shared accounts. Everything inside is encrypted, and
      opening it needs your fingerprint or face (a passkey) or your own 6-digit PIN. It locks itself after 5 minutes.
    </p>
  );
}

function SignInAgain({ why }: { why: string }) {
  return (
    <form method="post" action="/auth/signout?next=/closet" className="mt-2">
      <p className="m-0 mb-2 text-sm">{why}</p>
      <button type="submit" className={addBtn}>
        Sign in again
      </button>
    </form>
  );
}

function PinField({ value, onChange, label, autoFocus }: { value: string; onChange: (v: string) => void; label: string; autoFocus?: boolean }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold tracking-wider text-ink-2 uppercase">{label}</span>
      <input
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        data-1p-ignore
        data-lpignore="true"
        maxLength={6}
        autoFocus={autoFocus}
        aria-label={label}
        className={`${inputCls} block w-full text-center font-mono text-2xl tracking-[0.6em]`}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
      />
    </label>
  );
}

function NewPin({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [busy, setBusy] = useState(false);
  const problem = a.length === 6 ? pinProblem(a) : null;
  const mismatch = b.length === 6 && a !== b;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (a.length !== 6 || problem || a !== b) return;
    setBusy(true);
    try {
      await setPin(a);
      toast("PIN saved. The vault is open");
      qc.invalidateQueries({ queryKey: STATUS_KEY });
      onDone();
    } catch (err) {
      toast(errMsg(err), { tone: "error" });
    }
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="mt-2 space-y-2">
      <PinField label="Choose a 6-digit PIN" value={a} onChange={setA} autoFocus />
      {problem && <p className="m-0 text-xs text-urgent">{problem}</p>}
      <PinField label="Type it again" value={b} onChange={setB} />
      {mismatch && <p className="m-0 text-xs text-urgent">The two PINs don&apos;t match</p>}
      <p className="m-0 text-xs text-ink-2">This PIN is yours alone; Prerna and Harsh each set their own.</p>
      <button type="submit" className={addBtn} disabled={busy || a.length !== 6 || !!problem || a !== b}>
        {busy ? "Saving…" : "Save PIN and open"}
      </button>
    </form>
  );
}

function Unlock({ status, onForgot }: { status: VaultStatus; onForgot: () => void }) {
  const qc = useQueryClient();
  const [pin, setPinValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canPasskey, setCanPasskey] = useState(false);
  useEffect(() => {
    passkeysSupported().then(setCanPasskey);
  }, []);
  const hasPasskey = status.passkeys.length > 0 && canPasskey;
  const tryPin = async (value: string) => {
    setBusy(true);
    setError(null);
    try {
      await unlockWithPin(value);
    } catch (e) {
      setError(errMsg(e));
      setPinValue("");
      qc.invalidateQueries({ queryKey: STATUS_KEY });
    }
    setBusy(false);
  };
  const passkey = async () => {
    setBusy(true);
    setError(null);
    try {
      await unlockWithPasskey();
    } catch (e) {
      const name = (e as { name?: string }).name;
      setError(name === "NotAllowedError" || name === "AbortError" ? "Cancelled. Try again or use your PIN" : errMsg(e));
    }
    setBusy(false);
  };
  return (
    <Sec title="Home vault">
      <div className="rounded-lg border border-[#e6d9c2] bg-white p-4 text-center">
        <p className="m-0 text-3xl" aria-hidden="true">
          🔒
        </p>
        <p className="m-0 font-serif text-lg font-semibold">The closet is locked</p>
        {hasPasskey && (
          <button type="button" className={`${addBtn} mt-3 w-full`} onClick={passkey} disabled={busy}>
            Unlock with fingerprint or face
          </button>
        )}
        <form
          className="mt-3 text-left"
          onSubmit={(e) => {
            e.preventDefault();
            if (pin.length === 6) tryPin(pin);
          }}
        >
          <PinField
            label={hasPasskey ? "Or your PIN" : "Your PIN"}
            value={pin}
            autoFocus={!hasPasskey}
            onChange={(v) => {
              setPinValue(v);
              if (v.length === 6 && !busy) tryPin(v);
            }}
          />
        </form>
        {status.locked_until && !error && <p className="m-0 mt-2 text-xs text-urgent">Too many wrong PINs. The PIN is paused for now{hasPasskey ? "; your passkey still works" : ""}.</p>}
        {error && (
          <p role="alert" className="m-0 mt-2 text-sm text-urgent">
            {error}
          </p>
        )}
        <button type="button" className={linkBtn} onClick={onForgot}>
          Forgot your PIN?
        </button>
      </div>
    </Sec>
  );
}

// ---------- unlocked ----------
function useCountdown(until: number | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!until) return "";
  const s = Math.max(0, Math.round((until - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function VaultOpen() {
  const session = useVaultSession();
  const left = useCountdown(session?.expiresAt);
  const { data: rows } = useRows<VaultItemRow>("vault_items");
  const qc = useQueryClient();
  const [editing, setEditing] = useState<{ section: VaultSection; item?: VaultItem } | null>(null);
  // reload when either of you changes something (realtime updates the label rows). gcTime 0: the
  // decrypted items are dropped from memory as soon as this view closes (lock, timeout, leaving the room).
  const version = (rows ?? []).map((r) => r.id + r.updated_at + (r.deleted_at ?? "")).join("|");
  const { data, error } = useQuery({ queryKey: ["vault-items", version], queryFn: listItems, gcTime: 0, staleTime: Infinity, retry: false, refetchOnWindowFocus: false });
  const items = data ?? null;
  const load = useCallback(() => void qc.invalidateQueries({ queryKey: ["vault-items"] }), [qc]);
  useEffect(() => {
    if (error && !(error instanceof VaultError && error.status === 423)) toast(errMsg(error), { tone: "error" });
  }, [error]);

  const liveItems = (items ?? []).filter((i) => !i.deleted_at);
  const trash = (items ?? []).filter((i) => i.deleted_at);
  return (
    <>
      <div className="sticky top-0 z-10 mb-2 flex items-center gap-2 rounded-lg border border-[#cfe0c4] bg-[#f1f7ec] px-3 py-2 text-sm">
        <span aria-hidden="true">🔓</span>
        <span className="flex-1">
          <b>Open</b> · locks in <span className="tabular-nums">{left}</span>
        </span>
        <button type="button" className={`${addBtn} min-h-9`} onClick={() => lockVault()}>
          Lock
        </button>
      </div>
      {items === null && <p className="text-sm text-ink-2">Opening…</p>}
      {items !== null && liveItems.length === 0 && !editing && (
        <EmptyState title="The closet is empty" hint="Start with the Wi-Fi password, the landlord's number and your tenant insurance. Lease and insurance renewal dates show up on the calendar and the dashboard." />
      )}
      {editing && <ItemForm section={editing.section} item={editing.item} onClose={() => setEditing(null)} onSaved={load} />}
      {items !== null &&
        SECTION_ORDER.map((sec) => {
          const def = SECTIONS[sec];
          const list = liveItems.filter((i) => i.section === sec).sort((a, b) => a.label.localeCompare(b.label));
          return (
            <Sec
              key={sec}
              title={`${def.icon} ${def.title}`}
              right={
                <button type="button" className="min-h-9 text-xs font-bold text-teak normal-case underline" onClick={() => setEditing({ section: sec })}>
                  + Add
                </button>
              }
            >
              {list.length === 0 && <p className="m-0 text-xs text-ink-2">Nothing here yet.</p>}
              {list.map((i) => (
                <ItemCard key={i.id} item={i} onEdit={() => setEditing({ section: sec, item: i })} onChanged={load} />
              ))}
            </Sec>
          );
        })}
      {trash.length > 0 && (
        <details className="mb-3">
          <summary className="min-h-11 cursor-pointer text-xs font-bold text-ink-2">Recently deleted ({trash.length})</summary>
          {trash.map((i) => (
            <div key={i.id} className="flex items-center justify-between py-1 text-sm">
              {i.label}
              <button
                type="button"
                className={linkBtn}
                onClick={async () => {
                  await deleteItem(i.id, true).catch((e) => toast(errMsg(e), { tone: "error" }));
                  load();
                }}
              >
                Restore
              </button>
            </div>
          ))}
        </details>
      )}
      <Security />
    </>
  );
}

function summaryOf(i: VaultItem) {
  const def = SECTIONS[i.section];
  const first = def.fields.find((f) => !f.secret && f.type !== "multiline" && i.fields[f.key]);
  return first ? i.fields[first.key] : "";
}

function ItemCard({ item, onEdit, onChanged }: { item: VaultItem; onEdit: () => void; onChanged: () => void }) {
  const { byUser } = usePeople();
  const [open, setOpen] = useState(false);
  const def = SECTIONS[item.section];
  const today = torontoDayKey(new Date());
  const shown = def.fields.filter((f) => item.fields[f.key]);
  return (
    <div className="mb-2 rounded-lg border border-[#e6d9c2] bg-white">
      <button type="button" className="flex min-h-11 w-full items-center gap-2 px-2.5 py-2 text-left" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="min-w-0 flex-1">
          <b className="text-sm">{item.label}</b>
          {summaryOf(item) && <span className="block truncate text-xs text-ink-2">{summaryOf(item)}</span>}
        </span>
        {item.renewal_date && (
          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ${item.renewal_date >= today && daysBetween(today, item.renewal_date) <= 30 ? "bg-[#fff0c9] text-[#7d5a1a]" : "bg-[#f3ead9] text-teak"}`}>
            {item.renewal_date < today ? "renewal passed" : `renews ${new Date(item.renewal_date + "T12:00:00Z").toLocaleDateString("en-CA", { timeZone: "UTC", month: "short", day: "numeric" })}`}
          </span>
        )}
        <span aria-hidden="true" className="text-ink-2">
          {open ? "▴" : "▾"}
        </span>
      </button>
      {open && (
        <div className="border-t border-dashed border-[#e6d9c2] px-2.5 pt-1 pb-2">
          {item.broken && <p className="text-sm text-urgent">This item can&apos;t be decrypted. Was the vault key changed?</p>}
          {shown.map((f) => (
            <FieldRow key={f.key} def={f} value={item.fields[f.key]} />
          ))}
          {item.has_attachment && <Attachment item={item} onChanged={onChanged} />}
          <p className="m-0 mt-1 text-[10.5px] text-ink-2">
            Updated by {byUser(item.updated_by)?.display_name ?? "?"} · {new Date(item.updated_at).toLocaleDateString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric" })}
          </p>
          <div className="flex flex-wrap gap-3">
            <button type="button" className={linkBtn} onClick={onEdit}>
              Edit
            </button>
            <button
              type="button"
              className={`${linkBtn} text-urgent`}
              onClick={async () => {
                try {
                  await deleteItem(item.id);
                  onChanged();
                  toast(`Deleted “${item.label}”`, {
                    action: {
                      label: "Undo",
                      run: () => void deleteItem(item.id, true).then(onChanged),
                    },
                  });
                } catch (e) {
                  toast(errMsg(e), { tone: "error" });
                }
              }}
            >
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} copied`);
  } catch {
    toast("Couldn't copy on this device", { tone: "error" });
  }
}

function FieldRow({ def, value }: { def: FieldDef; value: string }) {
  const [show, setShow] = useState(false);
  const masked = def.secret && !show;
  let body: React.ReactNode = value;
  if (!masked && def.type === "tel")
    body = (
      <a href={`tel:${value.replace(/[^\d+]/g, "")}`} className="underline">
        {value}
      </a>
    );
  if (!masked && def.type === "email")
    body = (
      <a href={`mailto:${value}`} className="underline">
        {value}
      </a>
    );
  if (!masked && def.type === "url")
    body = (
      <a href={value} target="_blank" rel="noopener noreferrer" className="break-all underline">
        {value}
      </a>
    );
  if (!masked && def.type === "date") body = new Date(value + "T12:00:00Z").toLocaleDateString("en-CA", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" });
  return (
    <div className="flex items-start gap-2 border-b border-dashed border-[#efe4cf] py-1.5 last:border-0">
      <div className="min-w-0 flex-1">
        <p className="m-0 text-[10.5px] font-bold tracking-wider text-ink-2 uppercase">{def.label}</p>
        {/* masked values are never put in the page, only dots */}
        <p className={`m-0 text-sm break-words ${def.secret ? "font-mono" : ""} ${def.type === "multiline" ? "whitespace-pre-wrap" : ""}`}>{masked ? "••••••••" : body}</p>
      </div>
      {def.secret && (
        <button type="button" className={`${linkBtn} min-w-11`} onClick={() => setShow((v) => !v)} aria-label={`${show ? "Hide" : "Show"} ${def.label}`}>
          {show ? "Hide" : "Show"}
        </button>
      )}
      {def.type !== "multiline" && (
        <button type="button" className={`${linkBtn} min-w-11`} onClick={() => copy(value, def.label)} aria-label={`Copy ${def.label}`}>
          Copy
        </button>
      )}
    </div>
  );
}

function Attachment({ item, onChanged }: { item: VaultItem; onChanged: () => void }) {
  const openFile = async () => {
    // open the tab first (inside the tap) so phone browsers don't block it, then point it at the link
    const w = window.open("", "_blank");
    try {
      const url = await fileLink(item.id);
      if (w) w.location.href = url;
      else window.location.href = url;
    } catch (e) {
      w?.close();
      toast(errMsg(e), { tone: "error" });
    }
  };
  return (
    <div className="flex items-center gap-3 py-1.5 text-sm">
      <button type="button" className="font-bold underline" onClick={openFile}>
        📄 {item.attachment_name ?? "Attachment"}
      </button>
      <button
        type="button"
        className={`${linkBtn} text-urgent`}
        onClick={async () => {
          if (!window.confirm("Remove this file from the vault?")) return;
          await removeFile(item.id).catch((e) => toast(errMsg(e), { tone: "error" }));
          onChanged();
        }}
      >
        Remove file
      </button>
    </div>
  );
}

const ATTACH: VaultSection[] = ["lease", "insurance", "appliance"];

function ItemForm({ section, item, onClose, onSaved }: { section: VaultSection; item?: VaultItem; onClose: () => void; onSaved: () => void }) {
  const def = SECTIONS[section];
  const [label, setLabel] = useState(item?.label ?? "");
  const [renewal, setRenewal] = useState(item?.renewal_date ?? "");
  const [fields, setFields] = useState<Record<string, string>>(item?.fields ?? {});
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // braces matter: newer Chrome returns a Promise here, and React would treat it as a cleanup function
    void ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, []);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { id } = await saveItem({ id: item?.id, section, label, renewal_date: renewal || null, fields });
      if (file) await attachFile(id, file);
      toast(item ? "Saved" : `Added to ${def.title}`);
      onSaved();
      onClose();
    } catch (err) {
      toast(errMsg(err), { tone: "error" });
    }
    setBusy(false);
  };
  return (
    <div ref={ref} role="dialog" aria-label={`${item ? "Edit" : "Add"} ${def.title}`} className="mb-3 rounded-lg border border-brass bg-[#fffdf8] p-3">
      <p className="m-0 mb-2 font-bold">
        {def.icon} {item ? `Edit “${item.label}”` : `New in ${def.title}`}
      </p>
      <form onSubmit={submit} className="space-y-2" autoComplete="off">
        <label className="block text-[11px] font-bold tracking-wider text-ink-2 uppercase">
          {def.labelName}
          <input className={`${inputCls} block w-full normal-case`} placeholder={def.labelPlaceholder} maxLength={80} value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        {def.renewal && (
          <label className="block text-[11px] font-bold tracking-wider text-ink-2 uppercase">
            {def.renewal}
            <input type="date" className={`${smallSelect} block w-full`} value={renewal} onChange={(e) => setRenewal(e.target.value)} />
          </label>
        )}
        {def.fields.map((f) => (
          <label key={f.key} className="block text-[11px] font-bold tracking-wider text-ink-2 uppercase">
            {f.label}
            {f.secret && <span className="ml-1 font-normal normal-case">(hidden until you tap Show)</span>}
            {f.type === "multiline" ? (
              <textarea
                rows={3}
                maxLength={2000}
                className="block w-full rounded-lg border border-[#dccdb2] bg-white p-2 text-[15px] font-normal tracking-normal normal-case"
                value={fields[f.key] ?? ""}
                onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })}
              />
            ) : (
              <input
                type={f.type === "date" ? "date" : f.type === "tel" ? "tel" : f.type === "email" ? "email" : f.type === "url" ? "url" : "text"}
                className={`${inputCls} block w-full font-normal tracking-normal normal-case ${f.secret ? "font-mono" : ""}`}
                placeholder={f.placeholder}
                maxLength={500}
                autoComplete="off"
                autoCapitalize="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                value={fields[f.key] ?? ""}
                onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })}
              />
            )}
          </label>
        ))}
        {ATTACH.includes(section) && (
          <label className="flex min-h-11 flex-wrap items-center gap-2 text-xs">
            <span className="font-bold text-ink-2">{item?.has_attachment ? "Replace the file" : section === "appliance" ? "Manual (PDF or photo, up to 5 MB)" : "Document (PDF or photo, up to 5 MB)"}</span>
            <input type="file" accept="application/pdf,image/*" aria-label="Attachment" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
        )}
        <div className="flex gap-2">
          <button type="submit" className={addBtn} disabled={busy || !label.trim()}>
            {busy ? "Encrypting…" : "Save"}
          </button>
          <button type="button" className={linkBtn} onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function Security() {
  const qc = useQueryClient();
  const { data: status, refetch } = useQuery({ queryKey: STATUS_KEY, queryFn: vaultStatus, staleTime: 0 });
  const [canPasskey, setCanPasskey] = useState(false);
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    passkeysSupported().then(setCanPasskey);
  }, []);
  const add = async () => {
    setBusy(true);
    try {
      await addPasskey(deviceName());
      toast("Passkey added. Next time, unlock with your fingerprint or face");
      refetch();
    } catch (e) {
      const name = (e as { name?: string }).name;
      if (name === "InvalidStateError") toast("This device already has a passkey for the vault");
      else if (name !== "NotAllowedError" && name !== "AbortError") toast(errMsg(e), { tone: "error" });
    }
    setBusy(false);
  };
  return (
    <Sec title="Your unlock methods">
      <p className="mt-0 text-xs text-ink-2">These are yours only. Each of you sets up your own.</p>
      {status?.passkeys.map((p) => (
        <div key={p.id} className="flex items-center gap-2 py-1 text-sm">
          <span className="flex-1">
            🔑 {p.name}
            <span className="block text-[11px] text-ink-2">
              added {new Date(p.created_at).toLocaleDateString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric" })}
              {p.last_used_at && ` · last used ${new Date(p.last_used_at).toLocaleDateString("en-CA", { timeZone: "America/Toronto", month: "short", day: "numeric" })}`}
            </span>
          </span>
          <button
            type="button"
            className={`${linkBtn} text-urgent`}
            onClick={async () => {
              if (!window.confirm(`Remove the passkey “${p.name}”?`)) return;
              await callVault("passkey/delete", { id: p.id }).catch((e) => toast(errMsg(e), { tone: "error" }));
              qc.invalidateQueries({ queryKey: STATUS_KEY });
            }}
          >
            Remove
          </button>
        </div>
      ))}
      {canPasskey ? (
        <button type="button" className={`${addBtn} mt-1`} onClick={add} disabled={busy}>
          {status?.passkeys.length ? "Add this device too" : "Use fingerprint or face to unlock"}
        </button>
      ) : (
        <p className="m-0 text-xs text-ink-2">This browser can&apos;t use passkeys. On iPhone, use Safari or the app added to your Home Screen.</p>
      )}
      <div className="mt-2">
        {changing ? (
          <>
            <NewPin onDone={() => setChanging(false)} />
            <button type="button" className={linkBtn} onClick={() => setChanging(false)}>
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className={linkBtn} onClick={() => setChanging(true)}>
            Change PIN
          </button>
        )}
      </div>
    </Sec>
  );
}
