import type { RoomId } from "@/scene/config";

/** Placeholder panel content for phase 1: what each room will hold, and when it arrives. */
export const PLACEHOLDERS: Record<RoomId, { phase: number; items: string[] }> = {
  living: {
    phase: 5,
    items: [
      "Time-sensitive strip: overdue items, due soon, milestones, trips, renewals",
      "Today: both calendars, colour-coded",
      "Next 7 days and pending tasks",
      "Notes board (phase 3)",
      "Together for N days · activity feed",
    ],
  },
  kitchen: {
    phase: 3,
    items: ["Shared shopping list by store (phase 3)", "Recipe box with ratings and a servings scaler (phase 6)", "Import from a website, a pasted caption or an uploaded video (phase 6)"],
  },
  bedroom: { phase: 7, items: ["Date ideas: wishlist → planned → done", "“Surprise me” from the uruli", "Memories timeline"] },
  office: { phase: 4, items: ["Tasks with subtasks (phase 3)", "Google Calendar for both of you, plus a shared “Us” calendar (phase 4)", "Milestones and the September planner (phase 4)"] },
  wash: { phase: 3, items: ["Recurring chores, fixed or rotating", "Completion log and a weekly fairness line", "The laundry basket fills as chores pile up"] },
  closet: { phase: 7, items: ["Wi-Fi, contacts, lease and insurance, appliances", "Unlock with Face ID / fingerprint or a 6-digit PIN", "Encrypted, masked by default"] },
  backyard: { phase: 7, items: ["One page per trip: itinerary, bookings, budget", "Shared packing list with templates", "The boat lantern lights up when a trip is near"] },
};
