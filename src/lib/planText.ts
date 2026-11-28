/**
 * Plan items typed in plain words: "Sat 7pm dinner at The Kitchen" → Saturday of the trip, 19:00,
 * "Dinner at The Kitchen". Understands weekdays, "day 2", "first/last day", "Dec 14" / "14 Dec",
 * times like 7pm, 7:30 pm, 19:00 and noon. Pure, so it's unit-tested.
 */
import { weekdayMon } from "./time";

const WEEKDAYS: [RegExp, number][] = [
  [/^mon(day)?$/, 0],
  [/^tue(s|sday)?$/, 1],
  [/^wed(nesday)?$/, 2],
  [/^thu(r|rs|rsday)?$/, 3],
  [/^fri(day)?$/, 4],
  [/^sat(urday)?$/, 5],
  [/^sun(day)?$/, 6],
];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

export interface ParsedPlan {
  /** a day of the trip, or null if none was named (the caller picks a default) */
  day: string | null;
  /** HH:MM, or null */
  time: string | null;
  title: string;
}

export function parsePlanText(text: string, days: string[]): ParsedPlan {
  let rest = ` ${text.trim().replace(/\s+/g, " ")} `;
  let day: string | null = null;
  let time: string | null = null;
  const cut = (re: RegExp) => {
    rest = rest.replace(re, " ");
  };

  // time
  const t12 = rest.match(/\s(?:at\s)?(\d{1,2})(?:[:.](\d{2}))?\s?([ap])\.?m\.?(?=\s)/i);
  const t24 = rest.match(/\s(?:at\s)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/);
  const noon = rest.match(/\s(?:at\s)?noon(?=\s)/i);
  if (t12) {
    let h = Number(t12[1]) % 12;
    if (t12[3].toLowerCase() === "p") h += 12;
    const m = Number(t12[2] ?? 0);
    if (h < 24 && m < 60) {
      time = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      cut(new RegExp(t12[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  } else if (t24) {
    time = `${t24[1].padStart(2, "0")}:${t24[2]}`;
    cut(new RegExp(t24[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } else if (noon) {
    time = "12:00";
    cut(/\s(?:at\s)?noon(?=\s)/i);
  }

  // day
  const dayN = rest.match(/\s(?:on\s)?day\s?(\d{1,2})(?=\s)/i);
  const firstLast = rest.match(/\s(?:on\s)?(?:the\s)?(first|last)\sday(?=\s)/i);
  const monthDay = rest.match(new RegExp(`\\s(?:on\\s)?(${MONTHS.join("|")})[a-z]*\\.?\\s(\\d{1,2})(?:st|nd|rd|th)?(?=\\s)`, "i"));
  const dayMonth = rest.match(new RegExp(`\\s(?:on\\s)?(\\d{1,2})(?:st|nd|rd|th)?\\s(${MONTHS.join("|")})[a-z]*\\.?(?=\\s)`, "i"));
  if (dayN && days[Number(dayN[1]) - 1]) {
    day = days[Number(dayN[1]) - 1];
    cut(new RegExp(dayN[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } else if (firstLast) {
    day = firstLast[1].toLowerCase() === "first" ? days[0] : days[days.length - 1];
    cut(new RegExp(firstLast[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
  } else if (monthDay || dayMonth) {
    const [mon, dd] = monthDay ? [monthDay[1], monthDay[2]] : [dayMatch(dayMonth!)[1], dayMatch(dayMonth!)[0]];
    const m = MONTHS.indexOf(mon.slice(0, 3).toLowerCase()) + 1;
    const hit = days.find((k) => Number(k.slice(5, 7)) === m && Number(k.slice(8)) === Number(dd));
    if (hit) {
      day = hit;
      cut(new RegExp((monthDay ?? dayMonth)![0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    }
  } else {
    for (const word of rest.trim().split(" ")) {
      const w = word.toLowerCase().replace(/[.,]$/, "");
      const wd = WEEKDAYS.find(([re]) => re.test(w));
      if (!wd) continue;
      const hit = days.find((k) => weekdayMon(k) === wd[1]);
      if (hit) {
        day = hit;
        cut(new RegExp(`\\s(?:on\\s)?${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=\\s)`, "i"));
      }
      break; // only a leading-ish weekday counts, so "Sunday brunch spot" names aren't eaten later in the text
    }
  }

  let title = rest.replace(/\s+/g, " ").trim().replace(/^(at|on|-|,)\s+/i, "");
  title = title ? title[0].toUpperCase() + title.slice(1) : "";
  return { day, time, title: title.slice(0, 160) };
}

function dayMatch(m: RegExpMatchArray): [string, string] {
  return [m[1], m[2]];
}
