/** Indicator data shape (no three.js import, so pages can use it without loading 3D). */
export interface IndicatorState {
  /** Unchecked shopping items → fridge badge */
  shoppingOpen: number;
  /** Open chores → laundry heap size */
  choresOpen: number;
  /** Overdue chores → laundry badge */
  choresOverdue: number;
  /** A note from the other person in the last 24 h → nilavilakku brightens */
  newNoteFromPartner: boolean;
  /** A trip departs within 30 days → boat lantern lit */
  tripSoon: boolean;
  /** A vault renewal within 30 days → brass bell on the closet door */
  renewalSoon: boolean;
  /** A date planned this week → glow on the bedroom petti */
  dateThisWeek: boolean;
}

export const EMPTY_INDICATORS: IndicatorState = {
  shoppingOpen: 0,
  choresOpen: 0,
  choresOverdue: 0,
  newNoteFromPartner: false,
  tripSoon: false,
  renewalSoon: false,
  dateThisWeek: false,
};

