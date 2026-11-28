import { describe, expect, it } from "vitest";
import { summarizeForecast, weatherIcon } from "@/lib/weather";

const daily = {
  time: ["2026-12-17", "2026-12-18", "2026-12-19", "2026-12-20"],
  temperature_2m_min: [-1.2, -4.6, 0.4, 2],
  temperature_2m_max: [3, 1.4, 6.2, 7],
  precipitation_probability_max: [10, 80, null, 55],
  weather_code: [0, 73, 3, 61],
};

describe("trip weather", () => {
  it("uses only the trip's days", () => {
    const { days, weather } = summarizeForecast(daily, "2026-12-18", "2026-12-21");
    expect(days.map((d) => d.day)).toEqual(["2026-12-18", "2026-12-19", "2026-12-20"]);
    expect(weather).toEqual({ minC: -5, maxC: 7, rainyDays: 2, forecast: true });
  });
  it("nothing when the trip is beyond the forecast", () => {
    expect(summarizeForecast(daily, "2027-01-10", "2027-01-12").weather).toBeNull();
  });
  it("icons", () => {
    expect([0, 2, 3, 45, 61, 73, 95].map(weatherIcon)).toEqual(["☀️", "🌤️", "☁️", "🌫️", "🌧️", "❄️", "⛈️"]);
  });
});
