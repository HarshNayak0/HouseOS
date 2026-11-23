/** Person colours (SPEC §6). Stored by name; hex for drawing. */
export const PERSON_COLORS = {
  teak: { hex: "#7A4527", label: "Teak" },
  lotus: { hex: "#C98B8B", label: "Lotus" },
  leaf: { hex: "#4F7A3A", label: "Leaf" },
  brass: { hex: "#B8893B", label: "Brass" },
  terracotta: { hex: "#B8613D", label: "Terracotta" },
  "red-oxide": { hex: "#9C3B2A", label: "Red oxide" },
} as const;

export type PersonColor = keyof typeof PERSON_COLORS;
export const PERSON_COLOR_NAMES = Object.keys(PERSON_COLORS) as PersonColor[];
