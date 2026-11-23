"use client";

import { PERSON_COLORS, PERSON_COLOR_NAMES, type PersonColor } from "@/lib/colors";

export function ColorPicker({
  value,
  onChange,
  name,
  taken,
}: {
  value: PersonColor;
  onChange: (c: PersonColor) => void;
  name: string;
  /** Colour already used by the other person (shown, but marked). */
  taken?: PersonColor | null;
}) {
  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="sr-only">{name}</legend>
      <div className="flex flex-wrap gap-3">
        {PERSON_COLOR_NAMES.map((c) => (
          <label key={c} className="flex cursor-pointer flex-col items-center gap-1 text-xs text-ink-2">
            <input type="radio" name={name} value={c} checked={value === c} onChange={() => onChange(c)} className="peer sr-only" />
            <span
              aria-hidden="true"
              className="h-11 w-11 rounded-full border-2 border-transparent ring-offset-2 ring-offset-paper peer-checked:ring-2 peer-checked:ring-brass peer-focus-visible:outline-2 peer-focus-visible:outline-brass"
              style={{ background: PERSON_COLORS[c].hex }}
            />
            <span>
              {PERSON_COLORS[c].label}
              {taken === c ? " ·" : ""}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
