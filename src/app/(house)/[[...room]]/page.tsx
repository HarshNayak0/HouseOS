import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DEFAULT_LABELS, ROOM_IDS, isRoomId } from "@/scene/config";

// Any other path (e.g. /garage) is a 404.
export const dynamicParams = false;

// "/" and one static page per room: /living, /kitchen, /bedroom, /office, /wash, /closet, /backyard.
export function generateStaticParams() {
  return [{ room: [] }, ...ROOM_IDS.map((id) => ({ room: [id] }))];
}

export async function generateMetadata({ params }: PageProps<"/[[...room]]">): Promise<Metadata> {
  const { room } = await params;
  const id = room?.[0];
  if (!isRoomId(id)) return {};
  return { title: `${DEFAULT_LABELS[id].name} · Veedu` };
}

/** The house UI is in the layout; this page only validates the URL. */
export default async function RoomPage({ params }: PageProps<"/[[...room]]">) {
  const { room } = await params;
  if (room && (room.length > 1 || !isRoomId(room[0]))) notFound();
  return null;
}
