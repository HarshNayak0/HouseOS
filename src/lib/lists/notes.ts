import type { Note } from "@/panels/Notes";
import { live } from "./rows";

/** Notes that are visible on the board (not deleted, archived or expired). */
export const visibleNotes = (rows: Note[] | undefined, now = Date.now()) =>
  live(rows).filter((n) => !n.archived_at && (!n.expires_at || Date.parse(n.expires_at) > now));
