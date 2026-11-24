/**
 * Sunrise and sunset for Toronto, computed locally (NOAA's general solar position formulas; about
 * ±2 minutes). No network call, no API. Drives the automatic evening mode.
 */
import { torontoDayKey } from "./time";

export const TORONTO = { lat: 43.6532, lng: -79.3832 } as const;
const rad = Math.PI / 180;

/** Sunrise and sunset (as instants) for a calendar day given as YYYY-MM-DD. */
export function sunTimes(day: string, lat: number = TORONTO.lat, lng: number = TORONTO.lng): { sunrise: Date; sunset: Date } {
  const [y, m, d] = day.split("-").map(Number);
  const midnight = Date.UTC(y, m - 1, d);
  const n = Math.round((midnight - Date.UTC(y, 0, 1)) / 86_400_000) + 1;
  const g = ((2 * Math.PI) / 365) * (n - 1);
  const eqtime =
    229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  const cosHa = Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl);
  const ha = Math.acos(Math.min(1, Math.max(-1, cosHa))) / rad;
  // minutes after 00:00 UTC on that date (sunset in Toronto's summer runs past midnight UTC)
  const rise = 720 - 4 * (lng + ha) - eqtime;
  const set = 720 - 4 * (lng - ha) - eqtime;
  return { sunrise: new Date(midnight + rise * 60_000), sunset: new Date(midnight + set * 60_000) };
}

/** Evening from 20 minutes before sunset until 15 minutes after sunrise, Toronto time. */
export function isEvening(now: Date = new Date()): boolean {
  const { sunrise, sunset } = sunTimes(torontoDayKey(now));
  const t = now.getTime();
  return t >= sunset.getTime() - 20 * 60_000 || t < sunrise.getTime() + 15 * 60_000;
}
