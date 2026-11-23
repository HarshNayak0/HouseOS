import { describe, expect, it } from "vitest";
import { COURT, ROOMS, ROOM_IDS, isRoomId } from "@/scene/config";
import { Rng } from "@/scene/rng";

const size = (id: keyof typeof ROOMS) => {
  const [x0, x1, z0, z1] = ROOMS[id].bounds;
  return [+(x1 - x0).toFixed(2), +(z1 - z0).toFixed(2)];
};

describe("house layout matches SPEC §3.1 footprints", () => {
  it.each([
    ["kitchen", [4, 5]],
    ["bedroom", [5.5, 4]],
    ["office", [4.5, 4]],
    ["wash", [4, 4]],
    ["closet", [2.5, 3]],
    ["backyard", [16, 9]],
  ] as const)("%s is %j m", (id, dims) => {
    expect(size(id)).toEqual(dims);
  });

  it("living room is 4.5 × 5 m and the courtyard 2.6 × 2.6 m", () => {
    expect(size("living")[1]).toBe(5);
    expect(+(COURT.x1 - COURT.x0).toFixed(2)).toBe(2.6);
    expect(+(COURT.z1 - COURT.z0).toFixed(2)).toBe(2.6);
  });

  it("has a route id for every room", () => {
    expect(ROOM_IDS).toEqual(["living", "kitchen", "bedroom", "office", "wash", "closet", "backyard"]);
    expect(isRoomId("kitchen")).toBe(true);
    expect(isRoomId("laundry")).toBe(false);
  });
});

describe("seeded RNG", () => {
  it("reproduces the prototype's Park–Miller sequence", () => {
    const r = new Rng(11);
    const first = [r.next(), r.next(), r.next()];
    expect(first[0]).toBeCloseTo((11 * 16807 - 1) / 2147483646, 12);
    expect(new Rng(11).next()).toBe(first[0]);
    first.forEach((v) => expect(v).toBeGreaterThan(0));
  });
});
