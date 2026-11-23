/**
 * House configuration, ported from reference/veedu-prototype.html.
 * Coordinates are metres; front of house = +z. Keep these numbers identical to the prototype.
 */
export const P = 0.45; // plinth height
export const WH = 3.0; // wall height
export const CUT = 0.4; // wall scale in cutaway mode

export const ROOM_IDS = ["living", "kitchen", "bedroom", "office", "wash", "closet", "backyard"] as const;
export type RoomId = (typeof ROOM_IDS)[number];

export function isRoomId(v: unknown): v is RoomId {
  return typeof v === "string" && (ROOM_IDS as readonly string[]).includes(v);
}

/** Floor bounds [x0, x1, z0, z1]. */
export type Bounds = readonly [number, number, number, number];

export interface RoomLabel {
  /** English name */
  name: string;
  /** Malayalam name (empty = English only for now). Editable; will move to household settings in phase 2. */
  ml: string;
  /** Feature line shown in the panel header */
  feature: string;
}

export interface RoomDef {
  id: RoomId;
  bounds: Bounds;
  /** Label anchor [x, z] if not the centre */
  labelAt?: readonly [number, number];
  /** Phase that brings the real feature */
  phase: number;
}

export const ROOMS: Record<RoomId, RoomDef> = {
  living: { id: "living", bounds: [-7, 3, -2, 3], labelAt: [-4.6, 0.6], phase: 3 },
  office: { id: "office", bounds: [-7, -2.5, -6, -2], phase: 3 },
  bedroom: { id: "bedroom", bounds: [-2.5, 3, -6, -2], phase: 7 },
  kitchen: { id: "kitchen", bounds: [3, 7, -6, -1], phase: 3 },
  wash: { id: "wash", bounds: [3, 7, -1, 3], phase: 3 },
  closet: { id: "closet", bounds: [-7, -4.5, 3, 6], phase: 7 },
  backyard: { id: "backyard", bounds: [-7, 9, -16.5, -7.5], phase: 7 },
};

/** Default room labels (SPEC §3.1). Every label is editable in config / settings. */
export const DEFAULT_LABELS: Record<RoomId, RoomLabel> = {
  living: { name: "Living room", ml: "സ്വീകരണമുറി", feature: "Dashboard · Notes board" },
  office: { name: "Office", ml: "പഠനമുറി", feature: "Calendar · Tasks" },
  bedroom: { name: "Bedroom", ml: "കിടപ്പുമുറി", feature: "Date ideas" },
  kitchen: { name: "Kitchen", ml: "അടുക്കള", feature: "Shopping list · Recipe box" },
  wash: { name: "Wash area", ml: "", feature: "Chores" },
  closet: { name: "Coat closet", ml: "", feature: "Home info vault" },
  backyard: { name: "Backyard", ml: "തൊടി", feature: "Trip planner" },
};

/** Courtyard (nadumuttam) bounds. */
export const COURT = { x0: -1.05, x1: 1.55, z0: -0.8, z1: 1.8 } as const;

export const roomPath = (id: RoomId) => `/${id}`;
