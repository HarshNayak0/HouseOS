/**
 * Weather for a trip, from Open-Meteo (free, no account or key). Only the destination's name (to find
 * it) and its coordinates and dates (for the forecast) are sent; nothing about you. Forecasts reach 16
 * days ahead; further out, the packing list uses a season guess instead (see packing.ts).
 */
import type { Weather } from "./packing";

export interface Place {
  lat: number;
  lng: number;
  label: string;
}

/** Find a place by name, e.g. "Muskoka" → Muskoka, Ontario, Canada. Tries the full text, then its first part. */
export async function findPlace(name: string): Promise<Place | null> {
  const tries = [name, name.split(/[,(-]/)[0], name.split(" ")[0]].map((s) => s.trim()).filter((s, i, a) => s.length >= 2 && a.indexOf(s) === i);
  for (const q of tries) {
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1&language=en&format=json`);
      if (!res.ok) continue;
      const r = (await res.json()).results?.[0];
      if (r) return { lat: r.latitude, lng: r.longitude, label: [r.name, r.admin1, r.country].filter(Boolean).filter((x: string, i: number, a: string[]) => a.indexOf(x) === i).join(", ").slice(0, 160) };
    } catch {
      /* offline: try the next, then give up */
    }
  }
  return null;
}

export interface DayForecast {
  day: string;
  minC: number;
  maxC: number;
  rain: number; // max chance of rain, %
  code: number; // WMO weather code
}

/** Days of the trip that are inside the 16-day forecast window, from Open-Meteo's daily arrays. */
export function summarizeForecast(daily: { time: string[]; temperature_2m_min: number[]; temperature_2m_max: number[]; precipitation_probability_max: (number | null)[]; weather_code: number[] }, starts_on: string, ends_on: string): { days: DayForecast[]; weather: Weather | null } {
  const days: DayForecast[] = [];
  daily.time.forEach((day, i) => {
    if (day < starts_on || day > ends_on) return;
    days.push({ day, minC: Math.round(daily.temperature_2m_min[i]), maxC: Math.round(daily.temperature_2m_max[i]), rain: daily.precipitation_probability_max[i] ?? 0, code: daily.weather_code[i] });
  });
  if (!days.length) return { days, weather: null };
  return {
    days,
    weather: { minC: Math.min(...days.map((d) => d.minC)), maxC: Math.max(...days.map((d) => d.maxC)), rainyDays: days.filter((d) => d.rain >= 50).length, forecast: true },
  };
}

export async function fetchForecast(place: { lat: number; lng: number }, starts_on: string, ends_on: string) {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${place.lat.toFixed(3)}&longitude=${place.lng.toFixed(3)}` +
    `&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&forecast_days=16&timezone=auto`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather service answered ${res.status}`);
  return summarizeForecast((await res.json()).daily, starts_on, ends_on);
}

/** A small picture for a WMO weather code. */
export function weatherIcon(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 67 || (code >= 80 && code <= 82)) return "🌧️";
  if (code <= 77 || code === 85 || code === 86) return "❄️";
  return "⛈️";
}
