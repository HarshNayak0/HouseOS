import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateConfig } from "../../scripts/instance-config.mjs";

const files = readdirSync("instances").filter((f) => f.endsWith(".json"));

describe("couples' settings (instances/*.json)", () => {
  it.each(files)("%s is valid", (f) => {
    const c = JSON.parse(readFileSync(`instances/${f}`, "utf8"));
    expect(validateConfig(c, f.startsWith("_") ? c.slug : f.replace(/\.json$/, ""))).toEqual([]);
  });
  it("catches the usual mistakes", () => {
    const bad = { slug: "x1", appUrl: "https://x.vercel.app/", supabaseProjectRef: "short", timeZone: "Toronto", city: "", lat: 200, lng: 0 };
    expect(validateConfig(bad)).toHaveLength(5);
  });
});
