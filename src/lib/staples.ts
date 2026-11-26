/**
 * Staples: things you buy on a rhythm. From how often an item has been added (item_frequency keeps a
 * count, the first and the last time), work out its usual gap and suggest it once that gap has passed.
 * Pure, so it's unit-tested.
 */
export interface FrequencyRow {
  normalized_name: string;
  display_name: string;
  times_added: number;
  last_store: string | null;
  created_at: string;
  last_added_at: string;
}

export interface Staple {
  name: string;
  key: string;
  store: string | null;
  /** usual gap between purchases, in days */
  everyDays: number;
  /** days since it was last added */
  sinceDays: number;
}

const DAY = 86_400_000;

export function dueStaples(rows: FrequencyRow[] | undefined, onList: Set<string>, now = Date.now(), max = 8): Staple[] {
  const out: (Staple & { ratio: number })[] = [];
  for (const r of rows ?? []) {
    if (r.times_added < 3 || onList.has(r.normalized_name)) continue; // needs a few purchases to have a rhythm
    const span = Date.parse(r.last_added_at) - Date.parse(r.created_at);
    const every = span / (r.times_added - 1);
    if (every < 2 * DAY) continue; // added several times in one go: no rhythm yet
    const since = now - Date.parse(r.last_added_at);
    const ratio = since / every;
    if (ratio < 0.9) continue; // not due yet
    if (ratio > 4) continue; // long gone from the rotation
    out.push({ name: r.display_name, key: r.normalized_name, store: r.last_store, everyDays: Math.round(every / DAY), sinceDays: Math.floor(since / DAY), ratio });
  }
  return out
    .sort((a, b) => b.ratio - a.ratio)
    .slice(0, max)
    .map((s) => ({ name: s.name, key: s.key, store: s.store, everyDays: s.everyDays, sinceDays: s.sinceDays }));
}
