/** Person colours (SPEC §6). Stored by name; hex for drawing. */
export const PERSON_COLORS = {
  teak: { hex: "#7A4527", label: "Teak" },
  lotus: { hex: "#C98B8B", label: "Lotus" },
  leaf: { hex: "#4F7A3A", label: "Leaf" },
  brass: { hex: "#B8893B", label: "Brass" },
  terracotta: { hex: "#B8613D", label: "Terracotta" },
  "red-oxide": { hex: "#9C3B2A", label: "Red oxide" },
} as const;

/** Text colour that reads on a filled chip of this colour (WCAG AA 4.5:1): white, or dark ink on light colours. */
export function textOn(hex: string): string {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const n = parseInt(hex.slice(1), 16);
  const L = 0.2126 * lin(((n >> 16) & 255) / 255) + 0.7152 * lin(((n >> 8) & 255) / 255) + 0.0722 * lin((n & 255) / 255);
  return 1.05 / (L + 0.05) >= 4.5 ? "#ffffff" : "#2a1a12";
}

export type PersonColor = keyof typeof PERSON_COLORS;
export const PERSON_COLOR_NAMES = Object.keys(PERSON_COLORS) as PersonColor[];
