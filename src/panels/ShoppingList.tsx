"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { live, trashed, useRowMutation, useRows, type BaseRow } from "@/lib/lists/rows";
import { toast } from "@/lib/lists/toast";
import { celebrate } from "@/lib/feel";
import { effectiveReducedMotion } from "@/lib/view-pref";
import { useNow } from "@/lib/lists/useNow";
import { dueStaples, type FrequencyRow } from "@/lib/staples";
import { usePeople } from "./ui";
import {
  Basket,
  Check,
  EmptyState,
  IconButton,
  PartnerHint,
  Row,
  Sec,
  Trash,
  TrashIcon,
  addBtn,
  inputCls,
  linkBtn,
  smallSelect,
} from "./ui";

export interface ShoppingItem extends BaseRow {
  name: string;
  normalized_name: string;
  qty: number | null;
  unit: string | null;
  store: string;
  checked_at: string | null;
  checked_by: string | null;
}
type Frequent = FrequencyRow;
export interface StoreVisit {
  id: string;
  household_id: string;
  member_id: string;
  store: string;
  started_at: string;
  ended_at: string | null;
}
const VISIT_MS = 2 * 3_600_000;
/** Store visits still going (not ended, under 2 hours old). */
export const activeVisits = (rows: StoreVisit[] | undefined, now: number) =>
  // (a visit just started here has no started_at until the server answers: count it as now)
  (rows ?? []).filter(
    (v) => !v.ended_at && now - (v.started_at ? Date.parse(v.started_at) : now) < VISIT_MS,
  );

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const ANY = "Any store";
const NEW_STORE = "__new__";

export function ShoppingList() {
  const { me } = usePeople();
  const { data: rows, isLoading } = useRows<ShoppingItem>("shopping_items");
  const { data: freq } = useRows<Frequent & { id: string; deleted_at: null }>("item_frequency");
  const nowMs = useNow();
  const m = useRowMutation<ShoppingItem>("shopping_items");
  const [name, setName] = useState("");
  const [store, setStore] = useState(ANY);
  const [newStore, setNewStore] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const items = live(rows);
  const [bounce, setBounce] = useState(0);
  const basketRef = useRef<HTMLSpanElement>(null);
  const [arrived, setArrived] = useState<string | null>(null);
  const checkItem = (i: ShoppingItem, v: boolean) => {
    m.update(i.id, { checked_at: v ? new Date().toISOString() : null });
    if (v) {
      setArrived(i.id);
      setTimeout(() => setArrived((a) => (a === i.id ? null : a)), 1000);
    }
  };
  // the item has landed in the basket: it bounces (and ticks, and buzzes)
  const landed = () => {
    celebrate("check");
    setBounce((b) => b + 1);
  };
  const open = items.filter((i) => !i.checked_at);
  const checked = items.filter((i) => i.checked_at);
  const stores = useMemo(() => {
    const s = new Set<string>([ANY]);
    (rows ?? []).forEach((r) => s.add(r.store));
    (freq ?? []).forEach((f) => f.last_store && s.add(f.last_store));
    return [...s];
  }, [rows, freq]);
  const groups = useMemo(() => {
    const g = new Map<string, ShoppingItem[]>();
    for (const i of open) g.set(i.store, [...(g.get(i.store) ?? []), i]);
    return [...g.entries()].sort(([a], [b]) =>
      a === ANY ? 1 : b === ANY ? -1 : a.localeCompare(b),
    );
  }, [open]);

  const onList = new Set(open.map((i) => i.normalized_name));
  const q = norm(name);
  const staples = q ? [] : dueStaples(freq, onList, nowMs);
  const stapleKeys = new Set(staples.map((x) => x.key));
  const suggestions = (freq ?? [])
    .filter(
      (f) =>
        !onList.has(f.normalized_name) &&
        !stapleKeys.has(f.normalized_name) &&
        (q ? f.normalized_name.startsWith(q) && f.normalized_name !== q : true),
    )
    .slice(0, q ? 5 : 6);

  const add = (rawName: string, rawStore?: string | null) => {
    const n = rawName.trim().replace(/\s+/g, " ");
    if (!n || !me) return;
    const key = norm(n);
    const targetStore = (rawStore ?? (store === NEW_STORE ? newStore.trim() : store)) || ANY;
    const existingOpen = open.find((i) => i.normalized_name === key);
    if (existingOpen) {
      toast(`${existingOpen.name} is already on the list`);
    } else {
      const wasChecked = checked.find((i) => i.normalized_name === key);
      if (wasChecked) m.update(wasChecked.id, { checked_at: null });
      else
        m.insert({
          household_id: me.household_id,
          name: n.slice(0, 80),
          store: targetStore.slice(0, 40),
        });
    }
    setName("");
    if (store === NEW_STORE && newStore.trim()) {
      setStore(newStore.trim());
      setNewStore("");
    }
    inputRef.current?.focus();
  };

  const clearChecked = () => {
    const ids = checked.map((i) => i.id);
    if (!ids.length) return;
    ids.forEach((id) => m.update(id, { deleted_at: new Date().toISOString() }));
    toast(`Cleared ${ids.length} item${ids.length > 1 ? "s" : ""}`, {
      action: { label: "Undo", run: () => ids.forEach((id) => m.update(id, { deleted_at: null })) },
    });
  };

  return (
    <Sec
      title="Shopping list"
      right={<span className="font-normal normal-case tracking-normal">{open.length} to get</span>}
    >
      <StoreVisitBar stores={stores.filter((x) => x !== ANY)} />
      <form
        className="flex flex-wrap gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          add(name);
        }}
      >
        <input
          ref={inputRef}
          className={inputCls}
          placeholder="Add an item…"
          aria-label="Item to add"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />
        <button type="submit" className={addBtn} disabled={!name.trim()}>
          Add
        </button>
        <div className="flex w-full gap-1.5">
          <select
            aria-label="Store"
            className={`${smallSelect} flex-1`}
            value={store}
            onChange={(e) => setStore(e.target.value)}
          >
            {stores.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value={NEW_STORE}>New store…</option>
          </select>
          {store === NEW_STORE && (
            <input
              className={inputCls}
              placeholder="Store name"
              aria-label="New store name"
              value={newStore}
              maxLength={40}
              onChange={(e) => setNewStore(e.target.value)}
            />
          )}
        </div>
      </form>
      {staples.length > 0 && (
        <div
          className="mt-2 rounded-lg border border-callout-line bg-callout p-2"
          aria-label="Probably running low"
        >
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] font-bold text-callout-ink">Probably running low</span>
            <button
              type="button"
              className="min-h-9 text-xs font-bold text-teak underline"
              onClick={() => {
                staples.forEach((x) => add(x.name, x.store));
                toast(`Added ${staples.length} staple${staples.length > 1 ? "s" : ""}`);
              }}
            >
              Add all
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {staples.map((x) => (
              <button
                key={x.key}
                type="button"
                onClick={() => add(x.name, x.store)}
                title={`Usually every ${x.everyDays} days · last added ${x.sinceDays} days ago`}
                aria-label={`Add ${x.name}: usually every ${x.everyDays} days, last added ${x.sinceDays} days ago`}
                className="min-h-9 rounded-full border border-callout-line bg-card px-3 text-xs font-bold text-teak"
              >
                + {x.name}
              </button>
            ))}
          </div>
        </div>
      )}
      {suggestions.length > 0 && (
        <div
          className="mt-2 flex flex-wrap gap-1.5"
          aria-label={q ? "Suggestions" : "Often bought"}
        >
          {!q && <span className="w-full text-[11px] text-ink-2">Often bought</span>}
          {suggestions.map((s) => (
            <button
              key={s.normalized_name}
              type="button"
              onClick={() => add(s.display_name, s.last_store)}
              className="min-h-9 rounded-full border border-line bg-card px-3 text-xs font-bold text-teak"
            >
              + {s.display_name}
            </button>
          ))}
        </div>
      )}

      <div className="mt-2">
        {!isLoading && open.length === 0 && checked.length === 0 && (
          <EmptyState
            title="Nothing to buy"
            hint="Add what you need and it shows up on both phones instantly. Pick a store to group things."
            example={
              <Row>
                <span className="h-[18px] w-[18px] flex-none rounded border border-line-firm" />
                <span className="grow">
                  Coconut milk <span className="block text-xs text-ink-2">Indian grocery</span>
                </span>
              </Row>
            }
          />
        )}
        {groups.map(([s, list]) => (
          <div key={s}>
            <div className="mt-2 text-xs font-bold text-ink-2">{s}</div>
            {list.map((i) => (
              <ItemRow
                key={i.id}
                item={i}
                basket={() => basketRef.current}
                onLanded={landed}
                onCheck={(v) => checkItem(i, v)}
                onDelete={() => m.remove(i.id, `Removed ${i.name}`)}
                onRename={(n) => m.update(i.id, { name: n })}
              />
            ))}
          </div>
        ))}
        {(checked.length > 0 || open.length > 0) && (
          <div className="mt-3">
            <div className="flex min-h-11 items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-bold text-ink-2">
                <span ref={basketRef} className="inline-flex">
                  <Basket bounce={bounce} size={26} />
                </span>
                In the basket ({checked.length})
              </span>
              {checked.length > 0 && (
                <button type="button" className={linkBtn} onClick={clearChecked}>
                  Clear checked
                </button>
              )}
            </div>
            {checked.map((i) => (
              <ItemRow
                key={i.id}
                item={i}
                arrived={i.id === arrived}
                onCheck={(v) => checkItem(i, v)}
                onDelete={() => m.remove(i.id, `Removed ${i.name}`)}
                onRename={(n) => m.update(i.id, { name: n })}
              />
            ))}
          </div>
        )}
        <Trash rows={trashed(rows)} label={(r) => r.name} onRestore={m.restore} />
      </div>
    </Sec>
  );
}

function ItemRow({
  item,
  onCheck,
  onDelete,
  onRename,
  basket,
  onLanded,
  arrived,
}: {
  item: ShoppingItem;
  basket?: () => HTMLElement | null;
  onLanded?: () => void;
  arrived?: boolean;
  onCheck: (v: boolean) => void;
  onDelete: () => void;
  onRename: (n: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(item.name);
  const [dropping, setDropping] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLButtonElement>(null);
  const { byId } = usePeople();
  const by = item.checked_at ? byId(item.checked_by) : null;
  // just landed in the basket: the row opens up gently
  useEffect(() => {
    if (!arrived || !wrap.current) return;
    const h = wrap.current.offsetHeight;
    wrap.current.animate(
      effectiveReducedMotion()
        ? [{ opacity: 0 }, { opacity: 1 }]
        : [
            { height: "0px", opacity: 0, transform: "translateY(-6px)" },
            { height: `${h}px`, opacity: 1, transform: "none" },
          ],
      { duration: 280, easing: "ease-out" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when it arrives
  }, []);
  // ticking an item off: its name flies in an arc into the basket, the row closes up behind it
  const check = (v: boolean) => {
    if (!v) return onCheck(false);
    if (dropping || !wrap.current) return;
    setDropping(true);
    flyToBasket(wrap.current, nameRef.current, item.name, basket?.() ?? null).then(() => {
      onLanded?.();
      onCheck(true);
      // if the save failed and the item is back on the list, show the row again
      setTimeout(() => {
        if (!wrap.current) return;
        wrap.current.getAnimations().forEach((a) => a.cancel());
        setDropping(false);
      }, 1500);
    });
  };
  return (
    <div ref={wrap} className="relative overflow-hidden">
      <Row done={!!item.checked_at || dropping}>
        <Check
          checked={!!item.checked_at || dropping}
          onChange={check}
          label={`Got ${item.name}`}
        />
        <div className="grow min-w-0">
          {editing ? (
            <input
              autoFocus
              className={`${inputCls} w-full`}
              value={val}
              maxLength={80}
              aria-label="Item name"
              onChange={(e) => setVal(e.target.value)}
              onBlur={() => {
                setEditing(false);
                if (val.trim() && val.trim() !== item.name) onRename(val.trim());
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  setVal(item.name);
                  setEditing(false);
                }
              }}
            />
          ) : (
            <button
              ref={nameRef}
              type="button"
              className={`min-h-9 text-left transition-opacity duration-100 ${dropping ? "opacity-0" : ""}`}
              onClick={() => setEditing(true)}
              aria-label={`${item.name}, tap to rename`}
            >
              {item.name}
              {item.qty ? (
                <span className="text-ink-2">
                  {" "}
                  · {item.qty}
                  {item.unit ? ` ${item.unit}` : ""}
                </span>
              ) : null}
            </button>
          )}
          {by && (
            <span className="block">
              {/* inline-block so the item's strike-through doesn't run through this line */}
              <span className="inline-block text-[11px] text-ink-2">got by {by.display_name}</span>
            </span>
          )}
          <PartnerHint id={item.id} />
        </div>
        <IconButton label={`Delete ${item.name}`} onClick={onDelete}>
          <TrashIcon />
        </IconButton>
      </Row>
    </div>
  );
}

/** "I'm at the store": tells the other person (push), and their additions are pushed to you. */
function StoreVisitBar({ stores }: { stores: string[] }) {
  const { me, partner, byId } = usePeople();
  const { data: rows } = useRows<StoreVisit>("store_visits");
  const m = useRowMutation<StoreVisit>("store_visits");
  const nowMs = useNow(30_000);
  const [picking, setPicking] = useState(false);
  const [store, setStore] = useState("");
  const active = activeVisits(rows, nowMs);
  const mine = active.find((v) => v.member_id === me?.id);
  const theirs = active.filter((v) => v.member_id !== me?.id);
  const start = (name: string) => {
    if (!me || !name.trim()) return;
    m.insert({ household_id: me.household_id, member_id: me.id, store: name.trim().slice(0, 40) });
    setPicking(false);
    toast(
      `${partner?.display_name ?? "Your partner"} will get a notification that you're at ${name.trim()}`,
    );
  };
  const end = (id: string) => m.update(id, { ended_at: new Date().toISOString() });
  const mins = (v: StoreVisit) =>
    Math.max(1, Math.round((nowMs - Date.parse(v.started_at)) / 60_000));
  return (
    <div className="mb-2">
      {theirs.map((v) => (
        <div
          key={v.id}
          role="status"
          className="mb-1.5 rounded-lg border border-ok-line bg-ok px-3 py-2 text-sm"
        >
          🛒 <b>{byId(v.member_id)?.display_name ?? "Your partner"}</b> is at <b>{v.store}</b> now (
          {mins(v)} min). Add anything you need and it&apos;s sent to them.
        </div>
      ))}
      {mine ? (
        <div className="flex items-center gap-2 rounded-lg border border-ok-line bg-ok px-3 py-2 text-sm">
          <span className="flex-1">
            🛒 You&apos;re at <b>{mine.store}</b>. New items from your partner come to you as
            notifications.
          </span>
          <button
            type="button"
            className="min-h-9 flex-none text-xs font-bold text-teak underline"
            onClick={() => end(mine.id)}
          >
            Done shopping
          </button>
        </div>
      ) : picking ? (
        <form
          className="flex flex-wrap items-center gap-1.5 rounded-lg border border-brass bg-card-warm p-2"
          onSubmit={(e) => {
            e.preventDefault();
            start(store);
          }}
        >
          <span className="w-full text-xs font-bold text-ink-2">Which store?</span>
          {stores.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => start(s)}
              className="min-h-9 rounded-full border border-line bg-card px-3 text-xs font-bold text-teak"
            >
              {s}
            </button>
          ))}
          <input
            className={`${inputCls} min-w-32`}
            placeholder="Another store"
            aria-label="Store name"
            maxLength={40}
            value={store}
            onChange={(e) => setStore(e.target.value)}
          />
          <button type="submit" className={addBtn} disabled={!store.trim()}>
            Go
          </button>
          <button type="button" className={linkBtn} onClick={() => setPicking(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            setStore("");
            setPicking(true);
          }}
          className="min-h-10 w-full rounded-lg border border-dashed border-ok-line bg-card text-sm font-bold text-leaf"
          aria-describedby="store-hint"
        >
          🛒 I&apos;m at the store
          <span id="store-hint" className="sr-only">
            Tells your partner, and sends you what they add while you shop
          </span>
        </button>
      )}
    </div>
  );
}

/** The nearest scrolling ancestor (the room panel's body). */
function scroller(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === "auto" || o === "scroll") return p;
  }
  return null;
}

/**
 * The item's name lifts off its row and flies in an arc into the basket (or toward the bottom of the
 * panel if the basket is scrolled out of view); the row closes up behind it. With reduce motion on,
 * the row simply fades. Resolves when the item has landed.
 */
function flyToBasket(
  row: HTMLElement,
  nameEl: HTMLElement | null,
  name: string,
  basket: HTMLElement | null,
): Promise<void> {
  if (effectiveReducedMotion() || typeof row.animate !== "function") {
    return row
      .animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, fill: "forwards" })
      .finished.then(
        () => undefined,
        () => undefined,
      );
  }
  const from = (nameEl ?? row).getBoundingClientRect();
  const scroll = scroller(row);
  // where the basket is right now (it moves up as the row closes), kept inside the visible panel
  const target = () => {
    const box = scroll?.getBoundingClientRect() ?? { top: 0, bottom: innerHeight, left: 0 };
    const t = basket?.getBoundingClientRect();
    const x = t ? t.left + t.width / 2 : box.left + 40;
    const y = t ? t.top + t.height / 2 : box.bottom - 24;
    return { x, y: Math.min(Math.max(y, box.top + 20), box.bottom - 20) };
  };

  const ghost = document.createElement("div");
  const cs = nameEl ? getComputedStyle(nameEl) : null;
  ghost.textContent = name;
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "fixed",
    left: "0px",
    top: "0px",
    font: cs?.font ?? "600 15px sans-serif",
    color: cs?.color ?? "inherit",
    whiteSpace: "nowrap",
    pointerEvents: "none",
    zIndex: "60",
    transformOrigin: "0 50%",
    willChange: "transform, opacity",
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(ghost);
  const x0 = from.left,
    y0 = from.top + from.height / 2;
  const MS = 640;
  const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  const fly = new Promise<void>((resolve) => {
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / MS);
      const e = ease(k);
      const { x: x1, y: y1 } = target();
      const tx = x1 - 6;
      // a curve that lifts up first, then drops into the basket
      const cx = x0 + (tx - x0) * 0.45,
        cy = Math.min(y0, y1) - Math.min(70, 30 + Math.abs(y1 - y0) * 0.25);
      const x = (1 - e) * (1 - e) * x0 + 2 * (1 - e) * e * cx + e * e * tx;
      const y = (1 - e) * (1 - e) * y0 + 2 * (1 - e) * e * cy + e * e * y1;
      const sc = 1 - 0.75 * e;
      ghost.style.transform = `translate(${x}px, ${y}px) translateY(-50%) scale(${sc})`;
      ghost.style.opacity = String(k < 0.75 ? 1 : 1 - (k - 0.75) * 3.4);
      if (k < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
  // the row closes up behind it
  const h = row.offsetHeight;
  row.animate(
    [
      { height: `${h}px`, opacity: 1 },
      { height: "0px", opacity: 0 },
    ],
    { duration: 320, delay: 180, easing: "ease-in-out", fill: "forwards" },
  );
  return fly.then(() => ghost.remove());
}
