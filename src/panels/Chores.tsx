"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { dueLabel, dueState, weekStartKey } from "@/lib/lists/dates";
import { describeRepeat, firstOccurrence, nextOccurrence, toRRule, type Repeat, type Weekday } from "@/lib/lists/recurrence";
import { live, rowsKey, trashed, useRowMutation, useRows, type BaseRow } from "@/lib/lists/rows";
import { toast } from "@/lib/lists/toast";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { formatToronto, torontoDayKey, torontoToUtc } from "@/lib/time";
import { EmptyState, IconButton, PartnerHint, Sec, Trash, TrashIcon, WhoChip, addBtn, inputCls, linkBtn, smallSelect, usePeople } from "./ui";

export interface Chore extends BaseRow {
  title: string;
  notes: string | null;
  rrule: string;
  dtstart: string;
  next_due_at: string;
  assignment_mode: "fixed" | "rotating";
  assignee_id: string | null;
  remind: boolean;
  paused: boolean;
}
export interface Completion extends BaseRow {
  chore_id: string;
  completed_by: string | null;
  completed_at: string;
  due_at: string;
}

const DAYS: [Weekday, string][] = [
  ["MO", "M"],
  ["TU", "T"],
  ["WE", "W"],
  ["TH", "T"],
  ["FR", "F"],
  ["SA", "S"],
  ["SU", "S"],
];

export function Chores() {
  const { me, partner, byId } = usePeople();
  const qc = useQueryClient();
  const { data: rows, isLoading } = useRows<Chore>("chores");
  const { data: comps } = useRows<Completion>("chore_completions");
  const m = useRowMutation<Chore>("chores");

  const chores = live(rows).sort((a, b) => (a.next_due_at < b.next_due_at ? -1 : 1));

  const complete = useMutation({
    mutationFn: async (c: Chore) => {
      const after = new Date(Math.max(Date.parse(c.next_due_at), Date.now()));
      const next = nextOccurrence(c.rrule, new Date(c.dtstart), after);
      const { data, error } = await supabaseBrowser()!.rpc("complete_chore", { p_chore: c.id, p_next_due: next.toISOString() });
      if (error) throw error;
      return { id: data as string, next, chore: c };
    },
    onMutate: async (c) => {
      await qc.cancelQueries({ queryKey: rowsKey("chores") });
      const prev = qc.getQueryData<Chore[]>(rowsKey("chores"));
      const after = new Date(Math.max(Date.parse(c.next_due_at), Date.now()));
      const next = nextOccurrence(c.rrule, new Date(c.dtstart), after).toISOString();
      const rotateTo = c.assignment_mode === "rotating" ? (c.assignee_id === me?.id ? partner?.id : me?.id) ?? c.assignee_id : c.assignee_id;
      qc.setQueryData<Chore[]>(rowsKey("chores"), (old = []) => old.map((r) => (r.id === c.id ? { ...r, next_due_at: next, assignee_id: rotateTo ?? null } : r)));
      return { prev };
    },
    onError: (err, _c, ctx) => {
      if (ctx?.prev) qc.setQueryData(rowsKey("chores"), ctx.prev);
      toast(`Couldn't save: ${(err as { message?: string }).message ?? "error"}`, { tone: "error" });
    },
    onSuccess: ({ id, next, chore }) => {
      const label = dueLabel(next);
      toast(`Done! “${chore.title}” is next due ${/^(Today|Tomorrow|Yesterday)/.test(label) ? label.toLowerCase() : label}`, {
        action: {
          label: "Undo",
          run: async () => {
            const { error } = await supabaseBrowser()!.rpc("undo_chore_completion", { p_completion: id });
            if (error) toast(error.message, { tone: "error" });
            qc.invalidateQueries({ queryKey: rowsKey("chores") });
            qc.invalidateQueries({ queryKey: rowsKey("chore_completions") });
          },
        },
      });
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: rowsKey("chores") });
      qc.invalidateQueries({ queryKey: rowsKey("chore_completions") });
    },
  });

  const weekStart = weekStartKey();
  const thisWeek = live(comps).filter((c) => torontoDayKey(c.completed_at) >= weekStart);
  const count = (id?: string) => thisWeek.filter((c) => c.completed_by === id).length;
  const [showAll, setShowAll] = useState(false);
  const recent = live(comps).slice(0, showAll ? 40 : 8);
  const choreTitle = (id: string) => (rows ?? []).find((c) => c.id === id)?.title ?? "a chore";

  return (
    <>
      <Sec title="Chores" right={<span className="font-normal normal-case tracking-normal">{chores.filter((c) => dueState(c.next_due_at) === "overdue").length} overdue</span>}>
        <AddChore onAdd={(c) => me && m.insert({ ...c, household_id: me.household_id })} />
        <div className="mt-2">
          {!isLoading && chores.length === 0 && (
            <EmptyState
              title="No chores yet"
              hint="Add the jobs that repeat. Tick one off and the next one is scheduled; the laundry basket in the house fills up as they pile up."
              example={
                <div className="flex min-h-11 items-center gap-2 text-sm">
                  <span className="grow">
                    Take out recycling <span className="block text-xs text-ink-2">Weekly · Tue · takes turns</span>
                  </span>
                </div>
              }
            />
          )}
          {chores.map((c) => (
            <ChoreRow key={c.id} c={c} onDone={() => complete.mutate(c)} m={m} />
          ))}
          <Trash rows={trashed(rows)} label={(r) => r.title} onRestore={m.restore} />
        </div>
      </Sec>
      {(me || partner) && (
        <Sec title="This week">
          <p className="m-0 text-sm" aria-label="Chores done this week">
            {[me, partner]
              .filter(Boolean)
              .map((p) => `${p!.display_name} ${count(p!.id)}`)
              .join(" · ")}{" "}
            <span className="text-ink-2">done since Monday</span>
          </p>
        </Sec>
      )}
      {recent.length > 0 && (
        <Sec title="Recently done">
          {recent.map((c) => (
            <DoneRow key={c.id} c={c} who={byId(c.completed_by)?.display_name ?? "Someone"} title={choreTitle(c.chore_id)} />
          ))}
          {live(comps).length > recent.length && (
            <button type="button" className={linkBtn} onClick={() => setShowAll(true)}>
              Show more
            </button>
          )}
        </Sec>
      )}
    </>
  );
}

/** One "done" record, with a remove button (for a Done tapped by mistake). */
function DoneRow({ c, who, title }: { c: Completion; who: string; title: string }) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    setBusy(true);
    const { data, error } = await supabaseBrowser()!.rpc("remove_chore_completion", { p_completion: c.id });
    setBusy(false);
    setConfirm(false);
    if (error) return toast(error.message, { tone: "error" });
    const when = dueState(c.due_at) === "overdue" ? "overdue again" : `due ${dueLabel(c.due_at).toLowerCase()} again`;
    toast(data === "undone" ? `Removed. “${title}” is ${when}` : "Removed from the log");
    qc.invalidateQueries({ queryKey: rowsKey("chores") });
    qc.invalidateQueries({ queryKey: rowsKey("chore_completions") });
  };
  return (
    <div className="flex min-h-11 items-center gap-2 border-b border-dashed border-[#e6d9c2] py-1 text-sm last:border-b-0">
      <p className="m-0 grow">
        <b>{who}</b> did {title}
        <span className="text-ink-2"> · {formatToronto(c.completed_at, { weekday: "short", hour: "numeric", minute: "2-digit" })}</span>
      </p>
      {confirm ? (
        <span className="flex flex-none items-center gap-1">
          <button type="button" className={`${linkBtn} text-urgent`} onClick={remove} disabled={busy}>
            {busy ? "Removing…" : "Remove"}
          </button>
          <button type="button" className={linkBtn} onClick={() => setConfirm(false)}>
            Keep
          </button>
        </span>
      ) : (
        <IconButton label={`Remove the record of ${who} doing ${title}`} onClick={() => setConfirm(true)}>
          <TrashIcon />
        </IconButton>
      )}
    </div>
  );
}

function ChoreRow({ c, onDone, m }: { c: Chore; onDone: () => void; m: ReturnType<typeof useRowMutation<Chore>> }) {
  const [open, setOpen] = useState(false);
  const { me, partner } = usePeople();
  const state = dueState(c.next_due_at);
  return (
    <div className="border-b border-dashed border-[#e6d9c2] last:border-b-0">
      <div className="flex min-h-11 items-center gap-2.5 py-1.5 text-sm">
        <button
          type="button"
          onClick={onDone}
          aria-label={`Done: ${c.title}`}
          className={`min-h-9 flex-none rounded-full border px-3 text-xs font-bold ${state === "overdue" || state === "today" ? "border-red-oxide bg-red-oxide text-white" : "border-[#e0d2b8] bg-white text-ink"}`}
        >
          Done
        </button>
        <button type="button" className="min-h-9 min-w-0 grow text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {c.title}
          <span className="block text-xs text-ink-2">
            <span className={state === "overdue" ? "font-bold text-urgent" : state === "today" ? "font-bold text-red-oxide" : ""}>{dueLabel(c.next_due_at)}</span>
            {" · "}
            {describeRepeat(c.rrule)}
            {c.assignment_mode === "rotating" ? " · takes turns" : ""}
          </span>
          <PartnerHint id={c.id} />
        </button>
        <WhoChip memberId={c.assignee_id} />
      </div>
      {open && (
        <div className="mb-2 ml-2 flex flex-wrap items-center gap-2 rounded-lg bg-[#fffdf8] p-2 text-sm">
          <label className="flex items-center gap-1.5">
            <span className="text-xs text-ink-2">Who</span>
            <select
              className={smallSelect}
              aria-label="Who does it"
              value={c.assignment_mode === "rotating" ? "rotate" : (c.assignee_id ?? "")}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "rotate") m.update(c.id, { assignment_mode: "rotating", assignee_id: c.assignee_id ?? me?.id ?? null });
                else m.update(c.id, { assignment_mode: "fixed", assignee_id: v || null });
              }}
            >
              <option value="">Both</option>
              {me && <option value={me.id}>{me.display_name}</option>}
              {partner && <option value={partner.id}>{partner.display_name}</option>}
              <option value="rotate">Take turns</option>
            </select>
          </label>
          <button type="button" className={`${linkBtn} text-urgent`} onClick={() => m.remove(c.id, `Deleted “${c.title}”`)}>
            Delete chore
          </button>
        </div>
      )}
    </div>
  );
}

function AddChore({ onAdd }: { onAdd: (c: Partial<Chore>) => void }) {
  const { me, partner } = usePeople();
  const [title, setTitle] = useState("");
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Repeat["kind"]>("weekly");
  const [every, setEvery] = useState(1);
  const today = torontoDayKey(new Date());
  const todayDow = (["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as Weekday[])[new Date(today + "T12:00:00Z").getUTCDay()];
  const [days, setDays] = useState<Weekday[]>([todayDow]);
  const [monthDay, setMonthDay] = useState(Number(today.slice(8, 10)) > 28 ? 28 : Number(today.slice(8, 10)));
  const [start, setStart] = useState(today);
  const [who, setWho] = useState<string>("rotate");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const repeat: Repeat = kind === "daily" ? { kind, every } : kind === "weekly" ? { kind, every, days } : { kind, every, day: monthDay };
    const rrule = toRRule(repeat);
    const [y, mo, d] = start.split("-").map(Number);
    const dtstart = torontoToUtc(y, mo, d, 18, 0); // chores are due by 6 pm Toronto
    const first = firstOccurrence(rrule, dtstart);
    onAdd({
      title: title.trim().slice(0, 80),
      rrule,
      dtstart: dtstart.toISOString(),
      next_due_at: first.toISOString(),
      assignment_mode: who === "rotate" ? "rotating" : "fixed",
      assignee_id: who === "rotate" ? (me?.id ?? null) : who || null,
    });
    setTitle("");
    setOpen(false);
  };

  return (
    <form onSubmit={submit}>
      <div className="flex gap-1.5">
        <input className={inputCls} placeholder="New chore…" aria-label="New chore" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} onFocus={() => setOpen(true)} />
        <button type="submit" className={addBtn} disabled={!title.trim()}>
          Add
        </button>
      </div>
      {open && (
        <div className="mt-1.5 space-y-1.5 rounded-lg bg-[#fffdf8] p-2 text-sm">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-ink-2">Repeat every</span>
            <input type="number" min={1} max={52} aria-label="Interval" className={`${smallSelect} w-16`} value={every} onChange={(e) => setEvery(Math.max(1, Number(e.target.value) || 1))} />
            <select aria-label="Repeat unit" className={smallSelect} value={kind} onChange={(e) => setKind(e.target.value as Repeat["kind"])}>
              <option value="daily">{every > 1 ? "days" : "day"}</option>
              <option value="weekly">{every > 1 ? "weeks" : "week"}</option>
              <option value="monthly">{every > 1 ? "months" : "month"}</option>
            </select>
          </div>
          {kind === "weekly" && (
            <div className="flex gap-1" role="group" aria-label="On these days">
              {DAYS.map(([d, l]) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={days.includes(d)}
                  aria-label={d}
                  onClick={() => setDays((cur) => (cur.includes(d) ? (cur.length > 1 ? cur.filter((x) => x !== d) : cur) : [...cur, d]))}
                  className={`h-11 w-11 rounded-full border text-xs font-bold ${days.includes(d) ? "border-teak bg-teak text-white" : "border-[#e0d2b8] bg-white"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
          {kind === "monthly" && (
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-ink-2">On day</span>
              <input type="number" min={1} max={28} aria-label="Day of month" className={`${smallSelect} w-16`} value={monthDay} onChange={(e) => setMonthDay(Math.min(28, Math.max(1, Number(e.target.value) || 1)))} />
            </label>
          )}
          <div className="flex flex-wrap gap-1.5">
            <label className="flex items-center gap-1.5">
              <span className="text-xs text-ink-2">Starting</span>
              <input type="date" aria-label="Start date" className={smallSelect} value={start} min={today} onChange={(e) => setStart(e.target.value || today)} />
            </label>
            <select aria-label="Who does it" className={smallSelect} value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="rotate">Take turns</option>
              <option value="">Both</option>
              {me && <option value={me.id}>{me.display_name}</option>}
              {partner && <option value={partner.id}>{partner.display_name}</option>}
            </select>
          </div>
        </div>
      )}
    </form>
  );
}
