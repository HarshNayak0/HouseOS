"use client";

import { useMemo, useRef, useState } from "react";
import { live, trashed, useRowMutation, useRows, type BaseRow } from "@/lib/lists/rows";
import { toast } from "@/lib/lists/toast";
import { usePeople } from "./ui";
import { Check, EmptyState, IconButton, PartnerHint, Row, Sec, Trash, TrashIcon, addBtn, inputCls, linkBtn, smallSelect } from "./ui";

export interface ShoppingItem extends BaseRow {
  name: string;
  normalized_name: string;
  qty: number | null;
  unit: string | null;
  store: string;
  checked_at: string | null;
  checked_by: string | null;
}
interface Frequent {
  normalized_name: string;
  display_name: string;
  times_added: number;
  last_store: string | null;
}

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
const ANY = "Any store";
const NEW_STORE = "__new__";

export function ShoppingList() {
  const { me } = usePeople();
  const { data: rows, isLoading } = useRows<ShoppingItem>("shopping_items");
  const { data: freq } = useRows<Frequent & { id: string; deleted_at: null }>("item_frequency");
  const m = useRowMutation<ShoppingItem>("shopping_items");
  const [name, setName] = useState("");
  const [store, setStore] = useState(ANY);
  const [newStore, setNewStore] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const items = live(rows);
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
    return [...g.entries()].sort(([a], [b]) => (a === ANY ? 1 : b === ANY ? -1 : a.localeCompare(b)));
  }, [open]);

  const onList = new Set(open.map((i) => i.normalized_name));
  const q = norm(name);
  const suggestions = (freq ?? [])
    .filter((f) => !onList.has(f.normalized_name) && (q ? f.normalized_name.startsWith(q) && f.normalized_name !== q : true))
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
      else m.insert({ household_id: me.household_id, name: n.slice(0, 80), store: targetStore.slice(0, 40) });
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
    <Sec title="Shopping list" right={<span className="font-normal normal-case tracking-normal">{open.length} to get</span>}>
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
          <select aria-label="Store" className={`${smallSelect} flex-1`} value={store} onChange={(e) => setStore(e.target.value)}>
            {stores.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
            <option value={NEW_STORE}>New store…</option>
          </select>
          {store === NEW_STORE && (
            <input className={inputCls} placeholder="Store name" aria-label="New store name" value={newStore} maxLength={40} onChange={(e) => setNewStore(e.target.value)} />
          )}
        </div>
      </form>
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5" aria-label={q ? "Suggestions" : "Often bought"}>
          {!q && <span className="w-full text-[11px] text-ink-2">Often bought</span>}
          {suggestions.map((s) => (
            <button
              key={s.normalized_name}
              type="button"
              onClick={() => add(s.display_name, s.last_store)}
              className="min-h-9 rounded-full border border-[#e6d9c2] bg-white px-3 text-xs font-bold text-teak"
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
                <span className="h-[18px] w-[18px] flex-none rounded border border-[#c9b796]" />
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
              <ItemRow key={i.id} item={i} onCheck={(v) => m.update(i.id, { checked_at: v ? new Date().toISOString() : null })} onDelete={() => m.remove(i.id, `Removed ${i.name}`)} onRename={(n) => m.update(i.id, { name: n })} />
            ))}
          </div>
        ))}
        {checked.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ink-2">In the basket ({checked.length})</span>
              <button type="button" className={linkBtn} onClick={clearChecked}>
                Clear checked
              </button>
            </div>
            {checked.map((i) => (
              <ItemRow key={i.id} item={i} onCheck={(v) => m.update(i.id, { checked_at: v ? new Date().toISOString() : null })} onDelete={() => m.remove(i.id, `Removed ${i.name}`)} onRename={(n) => m.update(i.id, { name: n })} />
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
}: {
  item: ShoppingItem;
  onCheck: (v: boolean) => void;
  onDelete: () => void;
  onRename: (n: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(item.name);
  const { byId } = usePeople();
  const by = item.checked_at ? byId(item.checked_by) : null;
  return (
    <Row done={!!item.checked_at}>
      <Check checked={!!item.checked_at} onChange={onCheck} label={`Got ${item.name}`} />
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
          <button type="button" className="min-h-9 text-left" onClick={() => setEditing(true)} aria-label={`${item.name}, tap to rename`}>
            {item.name}
            {item.qty ? <span className="text-ink-2"> · {item.qty}{item.unit ? ` ${item.unit}` : ""}</span> : null}
          </button>
        )}
        {by && <span className="block text-[11px] text-ink-2 no-underline">got by {by.display_name}</span>}
        <PartnerHint id={item.id} />
      </div>
      <IconButton label={`Delete ${item.name}`} onClick={onDelete}>
        <TrashIcon />
      </IconButton>
    </Row>
  );
}
