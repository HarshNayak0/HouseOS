"use client";

import Link from "next/link";
import { COURT, DEFAULT_LABELS, ROOMS, roomPath, type Bounds, type RoomId } from "@/scene/config";

/**
 * 2D top-down nalukettu map (SPEC §3.4 fallback). Same rooms and coordinates as the 3D house.
 * Every room is a real link, so it works with keyboard and screen readers.
 */
const VB = { x: -7.8, y: -17.2, w: 17.6, h: 24.2 };

const rect = ([x0, x1, z0, z1]: Bounds) => ({ x: x0, y: z0, width: x1 - x0, height: z1 - z0 });

// The open hall around the courtyard belongs to the living room.
const HALL: Bounds = [-2.5, 3, -2, 3];

const isYardLabel = (id: RoomId) => id === "backyard";

export function FloorPlan({
  selected,
  onRoomLink,
}: {
  selected: RoomId | null;
  onRoomLink: (id: RoomId) => (e: React.MouseEvent) => void;
}) {
  const order: RoomId[] = ["backyard", "office", "bedroom", "kitchen", "wash", "living", "closet"];
  return (
    <div
      data-panel={!!selected}
      className="absolute inset-0 flex items-center justify-center overflow-hidden bg-plaster px-4 pt-[74px] pb-4 transition-[padding] duration-[220ms] data-[panel=true]:pb-[calc(58dvh+16px)] min-[721px]:data-[panel=true]:pr-[400px] min-[721px]:data-[panel=true]:pb-4"
    >
      <nav aria-label="Rooms (floor plan)" className="h-full w-full max-w-[560px]">
        <svg
          viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
          className="h-full w-full"
          role="group"
          aria-label="Floor plan of the house. Front of the house is at the bottom."
        >
          {/* compound and verandah */}
          <rect x={-7.2} y={-6.2} width={14.4} height={12.4} rx={0.1} fill="#8f3323" />
          <rect x={-4.5} y={3} width={11.7} height={3.2} fill="#a9473a" />
          <text x={1.4} y={5.1} textAnchor="middle" fontSize={0.42} fill="#fbf8f2" fontWeight={700}>
            Verandah (poomukham)
          </text>
          {order.map((id) => {
            const r = rect(ROOMS[id].bounds);
            const label = DEFAULT_LABELS[id];
            const on = selected === id;
            const [x0, x1, z0, z1] = ROOMS[id].bounds;
            // In 2D the backyard label sits below the pond so it doesn't cover it.
            const [lx, lz] = isYardLabel(id) ? [0.25, -8.4] : (ROOMS[id].labelAt ?? [(x0 + x1) / 2, (z0 + z1) / 2]);
            const isYard = id === "backyard";
            return (
              <Link
                key={id}
                href={roomPath(id)}
                scroll={false}
                onClick={onRoomLink(id)}
                aria-label={`${label.name}${label.ml ? ` (${label.ml})` : ""}: ${label.feature}`}
                aria-current={on ? "page" : undefined}
                className="group outline-none"
              >
                <rect
                  {...r}
                  rx={0.08}
                  fill={isYard ? (on ? "#7d9a4e" : "#6b8a3f") : on ? "#c2573f" : "#9c3b2a"}
                  stroke={on ? "#E2C27A" : "#2f1510"}
                  strokeWidth={on ? 0.16 : 0.1}
                  className="transition-[fill] group-hover:brightness-110 group-focus-visible:stroke-[#E2C27A] group-focus-visible:[stroke-width:0.22]"
                />
                {id === "living" && <rect {...rect(HALL)} fill={on ? "#c2573f" : "#9c3b2a"} />}
                {id === "living" && (
                  <rect x={COURT.x0} y={COURT.z0} width={COURT.x1 - COURT.x0} height={COURT.z1 - COURT.z0} fill="#a89c87" stroke="#5e554b" strokeWidth={0.06} />
                )}
                {isYard && (
                  <>
                    <ellipse cx={2.6} cy={-11.6} rx={3.3} ry={2.3} fill="#2f6b73" stroke="#a5552f" strokeWidth={0.15} />
                    <circle cx={-4.6} cy={-10.2} r={0.85} fill="#18303a" stroke="#a5552f" strokeWidth={0.15} />
                  </>
                )}
                <g transform={`translate(${lx} ${lz})`} pointerEvents="none">
                  <rect x={-1.55} y={label.ml ? -0.62 : -0.4} width={3.1} height={label.ml ? 1.2 : 0.78} rx={0.39} fill="#fbf8f2" stroke="#B8893B" strokeWidth={0.05} />
                  <text y={label.ml ? -0.07 : 0.14} textAnchor="middle" fontSize={0.4} fontWeight={700} fill="#3b2418">
                    {label.name}
                  </text>
                  {label.ml && (
                    <text y={0.4} textAnchor="middle" fontSize={0.32} fill="#7a6250" fontFamily="var(--font-manjari)">
                      {label.ml}
                    </text>
                  )}
                </g>
              </Link>
            );
          })}
          {/* main door */}
          <rect x={-0.4} y={2.9} width={1.3} height={0.2} fill="#7a4527" />
        </svg>
      </nav>
    </div>
  );
}
