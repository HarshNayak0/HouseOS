import { describe, expect, it } from "vitest";
import { LIMITS, formatBytes, usageWarnings } from "@/lib/usage";

describe("usage monitor", () => {
  it("warns at 70% of either limit", () => {
    expect(usageWarnings({ db_bytes: LIMITS.db * 0.69, storage_bytes: 0 })).toEqual([]);
    expect(usageWarnings({ db_bytes: LIMITS.db * 0.7, storage_bytes: 0 }).map((w) => w.what)).toEqual(["database"]);
    expect(usageWarnings({ db_bytes: LIMITS.db * 0.9, storage_bytes: LIMITS.storage * 0.75 }).map((w) => w.what)).toEqual(["database", "file storage"]);
    expect(usageWarnings(null)).toEqual([]);
  });
  it("formats sizes", () => {
    expect(formatBytes(500)).toBe("1 KB");
    expect(formatBytes(3.5 * 1024 * 1024)).toBe("3.5 MB");
    expect(formatBytes(120 * 1024 * 1024)).toBe("120 MB");
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.00 GB");
  });
});
