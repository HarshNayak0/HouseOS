"use client";

import { useMemo, useState } from "react";
import { dueLabel, dueState } from "@/lib/lists/dates";
import { live, trashed, useRowMutation, useRows, type BaseRow } from "@/lib/lists/rows";
import { torontoDayKey, torontoToUtc } from "@/lib/time";
import { Check, EmptyState, IconButton, PartnerHint, Row, Sec, Trash, TrashIcon, WhoChip, addBtn, inputCls, linkBtn, smallSelect, usePeople } from "./ui";

export interface Task extends BaseRow {
  title: string;
  notes: string | null;
  due_at: string | null;
  due_has_time: boolean;
  assignee_id: string | null;
  priority: number;
  visibility: "shared" | "personal";
  completed_at: string | null;
  completed_by: string | null;
}
interface Subtask extends BaseRow {
  task_id: string;
  title: string;
  done: boolean;
  position: number;
}

type Filter = "all" | "me" | "partner" | "both";
const PRIORITY = ["None", "Low", "Medium", "High"];

/** Toronto date (+ optional time) inputs → UTC ISO string. */
function toDue(date: string, time: string): { due_at: string | null; due_has_time: boolean } {
  if (!date) return { due_at: null, due_has_time: false };
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time ? time.split(":").map(Number) : [23, 59];
  return { due_at: torontoToUtc(y, mo, d, h, mi).toISOString(), due_has_time: !!time };
}

export function Tasks() {
  const { me, partner } = usePeople();
  const { data: rows, isLoading } = useRows<Task>("tasks");
  const { data: subRows } = useRows<Subtask>("subtasks");
  const m = useRowMutation<Task>("tasks");
  const [filter, setFilter] = useState<Filter>("all");
  const [showDone, setShowDone] = useState(false);

  const tasks = live(rows);
  const matches = (t: Task) =>
    filter === "all" ||
    (filter === "me" && (t.assignee_id === me?.id || (t.assignee_id === null && t.visibility === "personal"))) ||
    (filter === "partner" && t.assignee_id === partner?.id) ||
    (filter === "both" && t.assignee_id === null && t.visibility === "shared");
  const open = useMemo(
    () =>
      tasks
        .filter((t) => !t.completed_at && matches(t))
        .sort((a, b) => {
          if (!!a.due_at !== !!b.due_at) return a.due_at ? -1 : 1;
          if (a.due_at && b.due_at && a.due_at !== b.due_at) return a.due_at < b.due_at ? -1 : 1;
          return b.priority - a.priority;
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- matches depends on filter/me/partner
    [tasks, filter, me?.id, partner?.id],
  );
  const done = tasks.filter((t) => t.completed_at && matches(t)).sort((a, b) => (a.completed_at! < b.completed_at! ? 1 : -1));
  const subs = live(subRows);

  return (
    <Sec title="Tasks" right={<span className="font-normal normal-case tracking-normal">{open.length} open</span>}>
      <div className="mb-2 flex flex-wrap gap-1.5" role="group" aria-label="Show tasks for">
        {(
          [
            ["all", "All"],
            ["me", "Mine"],
            ["partner", partner?.display_name ?? "Partner"],
            ["both", "Both"],
          ] as [Filter, string][]
        ).map(([f, label]) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`min-h-9 rounded-full border px-3 text-xs font-bold ${filter === f ? "border-teak bg-teak text-white" : "border-[#e6d9c2] bg-white text-ink"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <AddTask onAdd={(t) => me && m.insert({ ...t, household_id: me.household_id })} />
      <div className="mt-2">
        {!isLoading && tasks.filter((t) => !t.completed_at).length === 0 && (
          <EmptyState
            title="No tasks yet"
            hint="Add errands and to-dos, give them a date, and say who's doing them. Mark one Personal to keep it to yourself."
            example={
              <Row>
                <span className="h-[18px] w-[18px] flex-none rounded border border-[#c9b796]" />
                <span className="grow">
                  Renew tenant insurance <span className="block text-xs text-urgent">Friday</span>
                </span>
              </Row>
            }
          />
        )}
        {open.map((t) => (
          <TaskRow key={t.id} task={t} subs={subs.filter((s) => s.task_id === t.id)} m={m} />
        ))}
        {done.length > 0 && (
          <div className="mt-3">
            <button type="button" className={linkBtn} onClick={() => setShowDone((v) => !v)} aria-expanded={showDone}>
              Done ({done.length})
            </button>
            {showDone && done.slice(0, 30).map((t) => <TaskRow key={t.id} task={t} subs={subs.filter((s) => s.task_id === t.id)} m={m} />)}
          </div>
        )}
        <Trash rows={trashed(rows)} label={(r) => r.title} onRestore={m.restore} />
      </div>
    </Sec>
  );
}

function AssigneeSelect({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const { me, partner } = usePeople();
  return (
    <select aria-label="Who's doing it" className={smallSelect} value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Both</option>
      {me && <option value={me.id}>{me.display_name} (me)</option>}
      {partner && <option value={partner.id}>{partner.display_name}</option>}
    </select>
  );
}

function AddTask({ onAdd }: { onAdd: (t: Partial<Task>) => void }) {
  const [title, setTitle] = useState("");
  const [more, setMore] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [assignee, setAssignee] = useState<string | null>(null);
  const [priority, setPriority] = useState(0);
  const [personal, setPersonal] = useState(false);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({ title: title.trim().slice(0, 120), ...toDue(date, time), assignee_id: assignee, priority, visibility: personal ? "personal" : "shared" });
    setTitle("");
    setDate("");
    setTime("");
    setPriority(0);
  };
  return (
    <form onSubmit={submit}>
      <div className="flex gap-1.5">
        <input className={inputCls} placeholder="New task…" aria-label="New task" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} />
        <button type="submit" className={addBtn} disabled={!title.trim()}>
          Add
        </button>
      </div>
      <button type="button" className={linkBtn} onClick={() => setMore((v) => !v)} aria-expanded={more}>
        {more ? "Fewer options" : "Date, person, priority…"}
      </button>
      {more && (
        <div className="grid grid-cols-2 gap-1.5 pb-1">
          <input type="date" aria-label="Due date" className={smallSelect} value={date} min={torontoDayKey(new Date())} onChange={(e) => setDate(e.target.value)} />
          <input type="time" aria-label="Due time (optional)" className={smallSelect} value={time} disabled={!date} onChange={(e) => setTime(e.target.value)} />
          <AssigneeSelect value={assignee} onChange={setAssignee} />
          <select aria-label="Priority" className={smallSelect} value={priority} onChange={(e) => setPriority(Number(e.target.value))}>
            {PRIORITY.map((p, i) => (
              <option key={p} value={i}>
                {i ? `${p} priority` : "No priority"}
              </option>
            ))}
          </select>
          <label className="col-span-2 flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" checked={personal} onChange={(e) => setPersonal(e.target.checked)} className="h-[18px] w-[18px] accent-red-oxide" />
            Personal (only I can see it)
          </label>
        </div>
      )}
    </form>
  );
}

function TaskRow({ task: t, subs, m }: { task: Task; subs: Subtask[]; m: ReturnType<typeof useRowMutation<Task>> }) {
  const [open, setOpen] = useState(false);
  const state = dueState(t.due_at);
  const doneSubs = subs.filter((s) => s.done).length;
  return (
    <div className="border-b border-dashed border-[#e6d9c2] last:border-b-0">
      <div className={`flex min-h-11 items-center gap-2.5 py-1.5 text-sm ${t.completed_at ? "[&_.title]:text-[#7a6b5d] [&_.title]:line-through" : ""}`}>
        <Check checked={!!t.completed_at} onChange={(v) => m.update(t.id, { completed_at: v ? new Date().toISOString() : null })} label={`Done: ${t.title}`} />
        <button type="button" className="min-h-9 min-w-0 grow text-left" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          <span className="title">
            {t.priority === 3 && <span className="mr-1 font-bold text-urgent" aria-label="High priority">!</span>}
            {t.title}
            {t.visibility === "personal" && <span className="ml-1 text-xs" aria-label="Personal">🔒</span>}
          </span>
          <span className="block text-xs text-ink-2">
            {t.due_at && <span className={state === "overdue" && !t.completed_at ? "font-bold text-urgent" : ""}>{dueLabel(t.due_at, t.due_has_time)}</span>}
            {subs.length > 0 && <span>{t.due_at ? " · " : ""}{doneSubs}/{subs.length} steps</span>}
            {!t.completed_at && t.priority >= 2 && (
              <span>
                {t.due_at || subs.length ? " · " : ""}
                {t.priority === 3 ? "🔔 reminds 8 am and 6 pm until done" : "🔔 in the morning summary until done"}
              </span>
            )}
          </span>
          <PartnerHint id={t.id} />
        </button>
        <WhoChip memberId={t.assignee_id} />
      </div>
      {open && <TaskDetails t={t} subs={subs} m={m} />}
    </div>
  );
}

function TaskDetails({ t, subs, m }: { t: Task; subs: Subtask[]; m: ReturnType<typeof useRowMutation<Task>> }) {
  const sm = useRowMutation<Subtask>("subtasks");
  const [notes, setNotes] = useState(t.notes ?? "");
  const [sub, setSub] = useState("");
  const dueDate = t.due_at ? torontoDayKey(t.due_at) : "";
  return (
    <div className="mb-2 ml-9 rounded-lg bg-[#fffdf8] p-2">
      <textarea
        aria-label="Notes"
        placeholder="Notes"
        rows={2}
        maxLength={2000}
        className="w-full rounded-lg border border-[#dccdb2] bg-white p-2 text-sm"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => notes !== (t.notes ?? "") && m.update(t.id, { notes: notes || null })}
      />
      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <input
          type="date"
          aria-label="Due date"
          className={smallSelect}
          value={dueDate}
          onChange={(e) => m.update(t.id, toDue(e.target.value, ""))}
        />
        <AssigneeSelect value={t.assignee_id} onChange={(v) => m.update(t.id, { assignee_id: v })} />
      </div>
      <div className="mt-2">
        {subs
          .sort((a, b) => a.position - b.position || (a.created_at < b.created_at ? -1 : 1))
          .map((s) => (
            <Row key={s.id} done={s.done}>
              <Check checked={s.done} onChange={(v) => sm.update(s.id, { done: v })} label={`Step done: ${s.title}`} />
              <span className="grow">{s.title}</span>
              <IconButton label={`Delete step ${s.title}`} onClick={() => sm.remove(s.id, "Step removed")}>
                <TrashIcon />
              </IconButton>
            </Row>
          ))}
        <form
          className="mt-1 flex gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!sub.trim()) return;
            sm.insert({ household_id: t.household_id, task_id: t.id, title: sub.trim().slice(0, 120), position: subs.length });
            setSub("");
          }}
        >
          <input className={inputCls} placeholder="Add a step…" aria-label="Add a step" value={sub} maxLength={120} onChange={(e) => setSub(e.target.value)} />
          <button type="submit" className={addBtn} disabled={!sub.trim()}>
            Add
          </button>
        </form>
      </div>
      <button type="button" className={`${linkBtn} text-urgent`} onClick={() => m.remove(t.id, `Deleted “${t.title}”`)}>
        Delete task
      </button>
    </div>
  );
}
