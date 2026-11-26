"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { formatQty, isInstagram, scaleQty } from "../../supabase/functions/_shared/recipe";
import { compressToWebp } from "@/lib/image";
import { insertOrUpdate, live, rowsKey, useRowMutation, useRows } from "@/lib/lists/rows";
import { toast } from "@/lib/lists/toast";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { PHOTO_BUCKET, uploadRecipePhoto, useSignedUrl } from "@/lib/files";
import {
  callRecipes,
  fmtMinutes,
  importPhoto,
  saveRecipe,
  totalMinutes,
  type Recipe,
  type RecipeDraft,
  type RecipeIngredient,
  type RecipeInput,
  type RecipeRating,
  type RecipeStep,
} from "@/lib/recipes";
import type { ShoppingItem } from "./ShoppingList";
import { EmptyState, IconButton, Sec, Stars, TrashIcon, addBtn, inputCls, linkBtn, smallSelect, usePeople } from "./ui";

type View =
  | { mode: "list" }
  | { mode: "detail"; id: string }
  | { mode: "edit"; id?: string; draft?: RecipeDraft; jobId?: string; photo?: Blob }
  | { mode: "import"; text?: string };

/** The kitchen's recipe box (list → recipe → edit / import). */
export function RecipeBox() {
  const [view, setView] = useState<View>({ mode: "list" });
  // Arriving from "Share to Veedu" (/kitchen?import=…) opens the importer with the shared text.
  useEffect(() => {
    const q = new URLSearchParams(location.search).get("import");
    if (!q) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hand-off from the share target
    setView({ mode: "import", text: q });
    history.replaceState(null, "", location.pathname);
  }, []);
  return (
    <Sec
      title="Recipe box"
      right={
        view.mode === "list" ? (
          <span className="flex gap-3 normal-case tracking-normal">
            <button type="button" className={linkBtn} onClick={() => setView({ mode: "import" })}>
              Import
            </button>
            <button type="button" className={linkBtn} onClick={() => setView({ mode: "edit" })}>
              + New
            </button>
          </span>
        ) : (
          <button type="button" className={`${linkBtn} normal-case tracking-normal`} onClick={() => setView({ mode: "list" })}>
            ← All recipes
          </button>
        )
      }
    >
      {view.mode === "list" && <RecipeList onOpen={(id) => setView({ mode: "detail", id })} />}
      {view.mode === "detail" && <RecipeDetail id={view.id} onEdit={() => setView({ mode: "edit", id: view.id })} onDeleted={() => setView({ mode: "list" })} />}
      {view.mode === "edit" && <RecipeEditor id={view.id} draft={view.draft} jobId={view.jobId} initialPhoto={view.photo} onSaved={(id) => setView({ mode: "detail", id })} />}
      {view.mode === "import" && <ImportBox initial={view.text} onDraft={(draft, jobId, photo) => setView({ mode: "edit", draft, jobId, photo })} />}
    </Sec>
  );
}

function Thumb({ path, className }: { path: string | null; className: string }) {
  const { data: url } = useSignedUrl(PHOTO_BUCKET, path);
  // eslint-disable-next-line @next/next/no-img-element -- signed URL to a private, already-compressed photo
  if (url) return <img src={url} alt="" className={`${className} object-cover`} />;
  return <div className={`${className} bg-[radial-gradient(circle_at_40%_40%,#f3e2b0,#d9a74a_55%,#a5662a)]`} aria-hidden="true" />;
}

function RecipeList({ onOpen }: { onOpen: (id: string) => void }) {
  const { data: rows, isLoading } = useRows<Recipe>("recipes");
  const { data: ings } = useRows<RecipeIngredient>("recipe_ingredients");
  const { data: ratings } = useRows<RecipeRating>("recipe_ratings");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [sort, setSort] = useState<"new" | "rating" | "quick">("new");
  const recipes = live(rows);
  const avg = (id: string) => {
    const r = (ratings ?? []).filter((x) => x.recipe_id === id && x.rating);
    return r.length ? r.reduce((s, x) => s + x.rating!, 0) / r.length : null;
  };
  const tags = useMemo(() => [...new Set(recipes.flatMap((r) => r.tags))].sort(), [recipes]);
  const needle = q.trim().toLowerCase();
  const shown = recipes
    .filter((r) => !tag || r.tags.includes(tag))
    .filter(
      (r) =>
        !needle ||
        r.title.toLowerCase().includes(needle) ||
        r.tags.some((t) => t.toLowerCase().includes(needle)) ||
        (ings ?? []).some((i) => i.recipe_id === r.id && i.item.toLowerCase().includes(needle)),
    )
    .sort((a, b) =>
      sort === "rating" ? (avg(b.id) ?? 0) - (avg(a.id) ?? 0) : sort === "quick" ? (totalMinutes(a) ?? 1e9) - (totalMinutes(b) ?? 1e9) : a.created_at < b.created_at ? 1 : -1,
    );
  if (!isLoading && recipes.length === 0)
    return (
      <EmptyState
        title="No recipes yet"
        hint="Import one from a recipe website or a pasted Instagram caption, or add your own. Then scale it and send the ingredients to the shopping list."
        example={
          <div className="mt-1 flex gap-2.5 rounded-lg border border-[#e6d9c2] bg-white p-2">
            <Thumb path={null} className="h-12 w-12 flex-none rounded-lg" />
            <div className="text-sm">
              <b>Kerala vegetable stew</b>
              <div className="text-xs text-ink-2">35 min · serves 4 · ★★★★★</div>
            </div>
          </div>
        }
      />
    );
  return (
    <>
      <div className="flex gap-1.5">
        <input className={inputCls} placeholder="Search recipes or ingredients…" aria-label="Search recipes" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className={smallSelect} aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
          <option value="new">Newest</option>
          <option value="rating">Top rated</option>
          <option value="quick">Quickest</option>
        </select>
      </div>
      {tags.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1" role="group" aria-label="Filter by tag">
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={tag === t}
              onClick={() => setTag(tag === t ? null : t)}
              className={`min-h-8 rounded-full px-2.5 text-[11px] font-bold ${tag === t ? "bg-teak text-white" : "bg-[#f3ead9] text-teak"}`}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      <div className="mt-2 space-y-2">
        {shown.map((r) => {
          const a = avg(r.id);
          return (
            <button key={r.id} type="button" onClick={() => onOpen(r.id)} className="flex w-full gap-2.5 rounded-lg border border-[#e6d9c2] bg-white p-2 text-left">
              <Thumb path={r.photo_path} className="h-16 w-16 flex-none rounded-lg" />
              <span className="min-w-0 grow">
                <b className="block truncate text-sm">{r.title}</b>
                <span className="block text-xs text-ink-2">
                  {[fmtMinutes(totalMinutes(r)), r.servings ? `serves ${formatQty(r.servings)}` : "", r.creator].filter(Boolean).join(" · ")}
                </span>
                {a !== null && <Stars value={a} label="Average rating" size="text-xs" />}
                <span className="block">
                  {r.tags.slice(0, 3).map((t) => (
                    <span key={t} className="mr-1 inline-block rounded-full bg-[#f3ead9] px-2 py-px text-[10px] font-bold text-teak">
                      {t}
                    </span>
                  ))}
                </span>
              </span>
            </button>
          );
        })}
        {shown.length === 0 && <p className="text-sm text-ink-2">No recipes match.</p>}
      </div>
    </>
  );
}

function RecipeDetail({ id, onEdit, onDeleted }: { id: string; onEdit: () => void; onDeleted: () => void }) {
  const qc = useQueryClient();
  const { me, partner } = usePeople();
  const { data: rows } = useRows<Recipe>("recipes");
  const { data: ingRows } = useRows<RecipeIngredient>("recipe_ingredients");
  const { data: stepRows } = useRows<RecipeStep>("recipe_steps");
  const { data: ratings } = useRows<RecipeRating>("recipe_ratings");
  const { data: shopping } = useRows<ShoppingItem>("shopping_items");
  const shop = useRowMutation<ShoppingItem>("shopping_items");
  const r = (rows ?? []).find((x) => x.id === id);
  const ings = (ingRows ?? []).filter((i) => i.recipe_id === id).sort((a, b) => a.position - b.position);
  const steps = (stepRows ?? []).filter((s) => s.recipe_id === id).sort((a, b) => a.position - b.position);
  const [servings, setServings] = useState<number | null>(null);
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [myNote, setMyNote] = useState<string | null>(null);
  if (!r) return <p className="text-sm text-ink-2">This recipe was deleted.</p>;
  const base = r.servings ?? null;
  const now = servings ?? base;
  const factor = base && now ? now / base : 1;
  const sel = picked ?? new Set(ings.map((i) => i.id));
  const mine = (ratings ?? []).find((x) => x.recipe_id === id && x.member_id === me?.id);
  const theirs = (ratings ?? []).find((x) => x.recipe_id === id && x.member_id === partner?.id);

  const rate = async (rating: number | null, note?: string) => {
    if (!me) return;
    const row = { household_id: r.household_id, recipe_id: id, member_id: me.id, rating, note: note ?? mine?.note ?? null };
    await insertOrUpdate("recipe_ratings", row, { recipe_id: id, member_id: me.id }, ["rating", "note"]).catch((e: Error) => toast(e.message, { tone: "error" }));
    qc.invalidateQueries({ queryKey: rowsKey("recipe_ratings") });
  };

  const addToList = () => {
    if (!me) return;
    const open = new Map(live(shopping).filter((s) => !s.checked_at).map((s) => [s.normalized_name, s]));
    const done = new Map(live(shopping).filter((s) => s.checked_at).map((s) => [s.normalized_name, s]));
    let added = 0,
      merged = 0;
    for (const i of ings.filter((x) => sel.has(x.id))) {
      const key = i.item.trim().replace(/\s+/g, " ").toLowerCase();
      if (open.has(key)) {
        merged++;
        continue;
      }
      const was = done.get(key);
      if (was) shop.update(was.id, { checked_at: null });
      else shop.insert({ household_id: me.household_id, name: i.item.slice(0, 80), qty: scaleQty(i.qty, factor), unit: i.unit, store: "Any store", source_recipe_id: r.id } as Partial<ShoppingItem>);
      open.set(key, {} as ShoppingItem);
      added++;
    }
    toast(`Added ${added} to the shopping list${merged ? ` · ${merged} already there` : ""}`);
  };

  const remove = async () => {
    const { error } = (await supabaseBrowser()?.from("recipes").update({ deleted_at: new Date().toISOString() }).eq("id", id)) ?? {};
    if (error) return toast(error.message, { tone: "error" });
    toast(`Deleted “${r.title}”`, {
      action: { label: "Undo", run: async () => (await supabaseBrowser()?.from("recipes").update({ deleted_at: null }).eq("id", id), qc.invalidateQueries({ queryKey: rowsKey("recipes") })) },
    });
    qc.invalidateQueries({ queryKey: rowsKey("recipes") });
    onDeleted();
  };

  return (
    <article>
      <Thumb path={r.photo_path} className="h-44 w-full rounded-lg" />
      <h3 className="mt-2 mb-0 font-serif text-xl font-semibold">{r.title}</h3>
      <p className="m-0 text-xs text-ink-2">
        {[r.prep_min ? `prep ${fmtMinutes(r.prep_min)}` : "", r.cook_min ? `cook ${fmtMinutes(r.cook_min)}` : "", r.creator].filter(Boolean).join(" · ")}
        {r.source_url && (
          <>
            {" · "}
            <a href={r.source_url} target="_blank" rel="noopener noreferrer" className="underline">
              source
            </a>
          </>
        )}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="flex items-center gap-1">
          <b className="text-xs">You</b>
          <Stars value={mine?.rating ?? null} onChange={(v) => rate(v)} label="Your rating" />
        </span>
        {partner && (
          <span className="flex items-center gap-1">
            <b className="text-xs">{partner.display_name}</b>
            <Stars value={theirs?.rating ?? null} label={`${partner.display_name}'s rating`} />
          </span>
        )}
      </div>
      {theirs?.note && <p className="m-0 mt-1 text-xs text-ink-2">“{theirs.note}” — {partner?.display_name}</p>}
      <textarea
        aria-label="Your notes on this recipe"
        placeholder="Your notes (e.g. less chilli next time)"
        rows={2}
        maxLength={1000}
        className="mt-1 w-full rounded-lg border border-[#dccdb2] bg-white p-2 text-sm"
        value={myNote ?? mine?.note ?? ""}
        onChange={(e) => setMyNote(e.target.value)}
        onBlur={() => myNote !== null && myNote !== (mine?.note ?? "") && rate(mine?.rating ?? null, myNote)}
      />

      <div className="mt-3 flex items-center justify-between">
        <h4 className="m-0 text-[11.5px] font-bold tracking-[0.09em] text-ink-2 uppercase">Ingredients</h4>
        {base && (
          <span className="flex items-center gap-1 text-sm" role="group" aria-label="Servings">
            <button type="button" aria-label="Fewer servings" className="h-9 w-9 rounded-full border border-[#e0d2b8] bg-white" onClick={() => setServings(Math.max(1, (now ?? 1) - 1))}>
              −
            </button>
            <span className="min-w-[78px] text-center">serves {formatQty(now)}</span>
            <button type="button" aria-label="More servings" className="h-9 w-9 rounded-full border border-[#e0d2b8] bg-white" onClick={() => setServings(Math.min(100, (now ?? 1) + 1))}>
              +
            </button>
          </span>
        )}
      </div>
      {ings.map((i) => (
        <label key={i.id} className="flex min-h-10 items-center gap-2 border-b border-dashed border-[#e6d9c2] text-sm last:border-b-0">
          <input
            type="checkbox"
            checked={sel.has(i.id)}
            onChange={(e) => {
              const n = new Set(sel);
              if (e.target.checked) n.add(i.id);
              else n.delete(i.id);
              setPicked(n);
            }}
            className="h-[18px] w-[18px] flex-none accent-red-oxide"
            aria-label={`Include ${i.item}`}
          />
          <span>
            <b>{[formatQty(scaleQty(i.qty, factor)), i.unit].filter(Boolean).join(" ")}</b> {i.item}
            {i.note && <span className="text-ink-2">, {i.note}</span>}
          </span>
        </label>
      ))}
      {ings.length > 0 && (
        <button type="button" className={`${addBtn} mt-2 w-full`} onClick={addToList} disabled={sel.size === 0}>
          Add {sel.size} to the shopping list
        </button>
      )}

      <h4 className="mt-4 mb-1 text-[11.5px] font-bold tracking-[0.09em] text-ink-2 uppercase">Steps</h4>
      <ol className="m-0 list-decimal space-y-1.5 pl-5 text-sm">
        {steps.map((s) => (
          <li key={s.id}>{s.body}</li>
        ))}
      </ol>
      {r.notes && <p className="mt-3 rounded-lg bg-[#fffdf8] p-2 text-sm">{r.notes}</p>}
      <div className="mt-4 flex gap-4">
        <button type="button" className={linkBtn} onClick={onEdit}>
          Edit recipe
        </button>
        <button type="button" className={`${linkBtn} text-urgent`} onClick={remove}>
          Delete recipe
        </button>
      </div>
    </article>
  );
}

interface EditIng {
  key: string;
  qty: string;
  unit: string;
  item: string;
  note: string;
  low: boolean;
}

function RecipeEditor({
  id,
  draft,
  jobId,
  initialPhoto,
  onSaved,
}: {
  id?: string;
  draft?: RecipeDraft;
  jobId?: string;
  initialPhoto?: Blob;
  onSaved: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { me } = usePeople();
  const { data: rows } = useRows<Recipe>("recipes");
  const { data: ingRows } = useRows<RecipeIngredient>("recipe_ingredients");
  const { data: stepRows } = useRows<RecipeStep>("recipe_steps");
  const existing = id ? (rows ?? []).find((r) => r.id === id) : undefined;
  const [f, setF] = useState(() => {
    const src = existing ?? draft;
    return {
      title: src?.title ?? "",
      servings: src?.servings ? String(src.servings) : "",
      prep: src?.prep_min ? String(src.prep_min) : "",
      cook: src?.cook_min ? String(src.cook_min) : "",
      tags: (src?.tags ?? []).join(", "),
      creator: src?.creator ?? "",
      source: src?.source_url ?? "",
      notes: existing?.notes ?? "",
      photo: existing?.photo_path ?? null,
    };
  });
  const [ings, setIngs] = useState<EditIng[]>(() => {
    const list = existing
      ? (ingRows ?? []).filter((i) => i.recipe_id === id).sort((a, b) => a.position - b.position).map((i) => ({ ...i, confidence: 1 }))
      : (draft?.ingredients ?? []);
    return [...list.map((i) => ({ key: crypto.randomUUID(), qty: i.qty === null ? "" : formatQty(i.qty), unit: i.unit ?? "", item: i.item, note: i.note ?? "", low: i.confidence < 0.7 })), blankIng()];
  });
  const [steps, setSteps] = useState<string[]>(() => [
    ...(existing ? (stepRows ?? []).filter((s) => s.recipe_id === id).sort((a, b) => a.position - b.position).map((s) => s.body) : (draft?.steps ?? [])),
    "",
  ]);
  const [busy, setBusy] = useState(false);
  const [photoFile, setPhotoFile] = useState<Blob | null>(initialPhoto ?? null);
  const low = draft?.confidence;

  const parseNum = (s: string) => {
    const t = s.trim();
    if (!t) return null;
    const map: Record<string, number> = { "½": 0.5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": 0.25, "¾": 0.75, "⅛": 0.125 };
    const parts = t.split(/\s+/);
    let n = 0;
    for (const p of parts) {
      if (map[p] !== undefined) n += map[p];
      else if (/^\d+\/\d+$/.test(p)) n += Number(p.split("/")[0]) / Number(p.split("/")[1]);
      else if (!isNaN(Number(p))) n += Number(p);
      else return null;
    }
    return n > 0 ? n : null;
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!f.title.trim() || !me) return;
    setBusy(true);
    try {
      let photo = f.photo;
      if (photoFile) photo = await uploadRecipePhoto(me.household_id, photoFile);
      else if (!photo && draft?.image_url) photo = await importPhoto(me.household_id, draft.image_url);
      const input: RecipeInput = {
        title: f.title.trim().slice(0, 140),
        photo_path: photo,
        prep_min: f.prep ? Math.round(Number(f.prep)) || null : null,
        cook_min: f.cook ? Math.round(Number(f.cook)) || null : null,
        servings: parseNum(f.servings),
        tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 12).map((t) => t.slice(0, 30)),
        source_url: /^https?:\/\//.test(f.source.trim()) ? f.source.trim().slice(0, 500) : null,
        creator: f.creator.trim().slice(0, 80) || null,
        notes: f.notes.trim().slice(0, 2000) || null,
        import_job_id: jobId ?? null,
        ingredients: ings.filter((i) => i.item.trim()).map((i) => ({ qty: parseNum(i.qty), unit: i.unit.trim() || null, item: i.item.trim().slice(0, 120), note: i.note.trim() || null })),
        steps: steps.map((s) => s.trim()).filter(Boolean),
      };
      const savedId = await saveRecipe(input, id);
      await Promise.all(["recipes", "recipe_ingredients", "recipe_steps"].map((t) => qc.invalidateQueries({ queryKey: rowsKey(t as "recipes") })));
      toast(id ? "Recipe saved" : "Recipe added");
      onSaved(savedId);
    } catch (err) {
      toast((err as Error).message, { tone: "error" });
    }
    setBusy(false);
  };

  const flag = (v: number | undefined) => (v !== undefined && v < 0.7 ? "border-[#e9c46a] bg-[#fff8e1]" : "");
  const lowCount = ings.filter((i) => i.low && i.item).length;

  return (
    <form onSubmit={save} className="space-y-2 text-sm">
      {draft && (
        <p className="m-0 rounded-lg border border-[#e9d4a4] bg-[#fff8e6] p-2 text-xs">
          {draft.method === "json-ld" ? "Read from the website's recipe data." : draft.method === "gemini" ? "Read by Gemini." : "Read with simple rules (no AI)."} Check it, then save.
          {lowCount > 0 && ` ${lowCount} ingredient${lowCount > 1 ? "s" : ""} highlighted need a look.`}
        </p>
      )}
      <input className={`${inputCls} w-full ${flag(low?.title)}`} placeholder="Recipe name" aria-label="Recipe name" value={f.title} maxLength={140} onChange={(e) => setF({ ...f, title: e.target.value })} required />
      <div className="grid grid-cols-3 gap-1.5">
        <label className="text-[11px] font-bold text-ink-2">
          Serves
          <input className={`${smallSelect} mt-0.5 w-full ${flag(low?.servings)}`} inputMode="decimal" value={f.servings} onChange={(e) => setF({ ...f, servings: e.target.value })} />
        </label>
        <label className="text-[11px] font-bold text-ink-2">
          Prep (min)
          <input className={`${smallSelect} mt-0.5 w-full ${flag(low?.times)}`} inputMode="numeric" value={f.prep} onChange={(e) => setF({ ...f, prep: e.target.value })} />
        </label>
        <label className="text-[11px] font-bold text-ink-2">
          Cook (min)
          <input className={`${smallSelect} mt-0.5 w-full ${flag(low?.times)}`} inputMode="numeric" value={f.cook} onChange={(e) => setF({ ...f, cook: e.target.value })} />
        </label>
      </div>
      <input className={`${inputCls} w-full`} placeholder="Tags, separated by commas" aria-label="Tags" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} />
      <div className="grid grid-cols-2 gap-1.5">
        <input className={inputCls} placeholder="Creator (e.g. @handle)" aria-label="Creator" value={f.creator} maxLength={80} onChange={(e) => setF({ ...f, creator: e.target.value })} />
        <input className={inputCls} placeholder="Source link" aria-label="Source link" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} />
      </div>
      <label className="flex min-h-11 items-center gap-2">
        <span className="text-xs font-bold text-ink-2">Photo</span>
        <input type="file" accept="image/*" aria-label="Recipe photo" onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)} className="text-xs" />
      </label>
      {draft?.image_url && !photoFile && !f.photo && <p className="m-0 text-xs text-ink-2">The recipe&apos;s photo will be copied in when you save.</p>}
      {initialPhoto && photoFile === initialPhoto && <p className="m-0 text-xs text-ink-2">Your first screenshot will be the recipe photo.</p>}

      <h4 className="mt-3 mb-0 text-[11.5px] font-bold tracking-[0.09em] text-ink-2 uppercase">Ingredients</h4>
      {ings.map((i, n) => (
        <div key={i.key} className="flex items-center gap-1">
          <input
            className={`${smallSelect} w-14 ${i.low ? "border-[#e9c46a] bg-[#fff8e1]" : ""}`}
            placeholder={i.low && !i.qty ? "?" : "Qty"}
            aria-label={`Amount for ingredient ${n + 1}`}
            value={i.qty}
            onChange={(e) => setIngs(upd(ings, n, { qty: e.target.value, low: false }))}
          />
          <input className={`${smallSelect} w-16`} placeholder="Unit" aria-label={`Unit for ingredient ${n + 1}`} value={i.unit} maxLength={20} onChange={(e) => setIngs(upd(ings, n, { unit: e.target.value }))} />
          <input
            className={`${inputCls} ${i.low ? "border-[#e9c46a] bg-[#fff8e1]" : ""}`}
            placeholder="Ingredient"
            aria-label={`Ingredient ${n + 1}`}
            value={i.item}
            maxLength={120}
            onChange={(e) => {
              const next = upd(ings, n, { item: e.target.value, low: false });
              setIngs(n === ings.length - 1 && e.target.value ? [...next, blankIng()] : next);
            }}
          />
          {n < ings.length - 1 && (
            <IconButton label={`Remove ingredient ${n + 1}`} onClick={() => setIngs(ings.filter((_, k) => k !== n))}>
              <TrashIcon />
            </IconButton>
          )}
        </div>
      ))}

      <h4 className="mt-3 mb-0 text-[11.5px] font-bold tracking-[0.09em] text-ink-2 uppercase">Steps</h4>
      {steps.map((s, n) => (
        <div key={n} className="flex items-start gap-1">
          <span className="mt-2.5 w-5 flex-none text-right text-xs text-ink-2">{n + 1}.</span>
          <textarea
            rows={2}
            className={`min-h-11 w-full rounded-lg border border-[#dccdb2] bg-white p-2 ${flag(low?.steps)}`}
            aria-label={`Step ${n + 1}`}
            placeholder={n === steps.length - 1 ? "Add a step…" : ""}
            value={s}
            maxLength={2000}
            onChange={(e) => {
              const next = steps.map((x, k) => (k === n ? e.target.value : x));
              setSteps(n === steps.length - 1 && e.target.value ? [...next, ""] : next);
            }}
          />
        </div>
      ))}
      <textarea rows={2} className="w-full rounded-lg border border-[#dccdb2] bg-white p-2" placeholder="Notes" aria-label="Recipe notes" value={f.notes} maxLength={2000} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      <button type="submit" className={`${addBtn} w-full`} disabled={busy || !f.title.trim()}>
        {busy ? "Saving…" : id ? "Save changes" : "Save recipe"}
      </button>
    </form>
  );
}

const blankIng = (): EditIng => ({ key: crypto.randomUUID(), qty: "", unit: "", item: "", note: "", low: false });
const upd = (list: EditIng[], n: number, patch: Partial<EditIng>) => list.map((x, k) => (k === n ? { ...x, ...patch } : x));

const STAGES = ["Reading", "Structuring", "Ready for review"];

function ImportBox({ initial, onDraft }: { initial?: string; onDraft: (d: RecipeDraft, jobId: string, photo?: Blob) => void }) {
  const [text, setText] = useState(initial ?? "");
  const [shots, setShots] = useState<{ blob: Blob; url: string }[]>([]);
  const [usePhoto, setUsePhoto] = useState(false);
  const [stage, setStage] = useState(-1);
  const [error, setError] = useState<string | null>(null);
  const trimmed = text.trim();
  const onlyUrl = /^https?:\/\/\S+$/.test(trimmed);
  const igOnly = onlyUrl && isInstagram(trimmed) && shots.length === 0;

  useEffect(() => () => shots.forEach((s) => URL.revokeObjectURL(s.url)), [shots]);

  const addShots = async (files: FileList | null) => {
    if (!files) return;
    setError(null);
    const room = 4 - shots.length;
    if (files.length > room) setError("Up to 4 screenshots at a time.");
    const next: { blob: Blob; url: string }[] = [];
    for (const f of [...files].slice(0, room)) {
      try {
        const blob = await compressToWebp(f, 1600, 450_000); // keep text sharp enough to read
        next.push({ blob, url: URL.createObjectURL(blob) });
      } catch {
        setError("Couldn't open one of those images.");
      }
    }
    setShots((cur) => [...cur, ...next]);
  };

  const paste = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t) setText(t);
    } catch {
      setError("Your browser didn't allow reading the clipboard. Long-press the box and choose Paste.");
    }
  };
  const run = async () => {
    setError(null);
    setStage(0);
    const timer = setTimeout(() => setStage(1), 1500);
    try {
      const firstUrl = trimmed.match(/https?:\/\/\S+/)?.[0] ?? null;
      let body: Record<string, unknown>;
      if (shots.length) {
        const images = await Promise.all(shots.map(async (s) => ({ mime: s.blob.type, data: await blobToBase64(s.blob) })));
        body = { images, caption: onlyUrl ? "" : trimmed, source_url: firstUrl };
      } else body = onlyUrl ? { url: trimmed } : { caption: trimmed, source_url: firstUrl };
      const { draft, job_id } = await callRecipes<{ draft: RecipeDraft; job_id: string }>("import", body);
      setStage(2);
      onDraft(draft, job_id, usePhoto && shots[0] ? shots[0].blob : undefined);
    } catch (e) {
      setError((e as Error).message);
      setStage(-1);
    }
    clearTimeout(timer);
  };

  return (
    <div className="space-y-2 text-sm">
      <p className="m-0 text-ink-2">
        Paste a recipe website link, <b>add screenshots</b> of an Instagram post (tap &ldquo;more&rdquo; first so the whole caption shows), or paste a caption. Up
        to 20 imports a day.
      </p>
      <textarea
        rows={4}
        className="w-full rounded-lg border border-[#dccdb2] bg-white p-2"
        placeholder="https://… or caption text (optional with screenshots)"
        aria-label="Link or caption to import"
        value={text}
        maxLength={10_000}
        onChange={(e) => setText(e.target.value)}
      />
      <div>
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-[#c9b796] bg-white px-3 font-bold text-teak">
          <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => (addShots(e.target.files), (e.target.value = ""))} disabled={shots.length >= 4} />
          📷 Add screenshots {shots.length ? `(${shots.length}/4)` : ""}
        </label>
        {shots.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {shots.map((s, i) => (
              <div key={s.url} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- local preview of a screenshot */}
                <img src={s.url} alt={`Screenshot ${i + 1}`} className="h-24 w-16 rounded-md border border-[#e6d9c2] object-cover" />
                <button
                  type="button"
                  aria-label={`Remove screenshot ${i + 1}`}
                  onClick={() => setShots(shots.filter((_, k) => k !== i))}
                  className="absolute -top-2 -right-2 h-7 w-7 rounded-full bg-ink text-xs text-white"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
        {shots.length > 0 && (
          <label className="mt-1 flex min-h-11 items-center gap-2 text-xs">
            <input type="checkbox" checked={usePhoto} onChange={(e) => setUsePhoto(e.target.checked)} className="h-[18px] w-[18px] accent-red-oxide" />
            Use the first screenshot as the recipe photo
          </label>
        )}
      </div>
      {igOnly && (
        <p className="m-0 rounded-lg border border-[#e9d4a4] bg-[#fff8e6] p-2 text-xs">
          Instagram links can&apos;t be read directly. Add screenshots of the post (or paste its caption); the link will be kept as the source.
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" className="min-h-11 rounded-lg border border-[#e0d2b8] bg-white px-3 text-sm font-bold" onClick={paste}>
          Paste
        </button>
        <button type="button" className={`${addBtn.replace("flex-none", "")} flex-1`} disabled={(!trimmed && !shots.length) || igOnly || stage >= 0} onClick={run}>
          {stage >= 0 ? "Importing…" : "Import"}
        </button>
      </div>
      {stage >= 0 && (
        <ol className="m-0 list-none p-0 text-xs" aria-live="polite">
          {(shots.length ? ["Uploading screenshots", "Reading them with Gemini", "Ready for review"] : STAGES).map((s, i) => (
            <li key={s} className={i < stage ? "text-leaf" : i === stage ? "font-bold text-ink" : "text-[#b4a693]"}>
              {i < stage ? "✓" : i === stage ? "•" : "○"} {s}
            </li>
          ))}
        </ol>
      )}
      {error && (
        <p role="alert" className="m-0 text-sm text-urgent">
          {error}
        </p>
      )}
    </div>
  );
}

function blobToBase64(b: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = () => rej(new Error("Couldn't read the screenshot"));
    r.readAsDataURL(b);
  });
}
