/**
 * Extra furniture detail added on top of the prototype (kitchen sink, cabinet doors, lamps, coats…).
 * Built after everything else so the prototype's random sequence is untouched.
 * Kept cheap: simple boxes/cylinders that merge into the existing per-material draw calls.
 */
import * as THREE from "three";
import type { BuildCtx } from "../context";
import { P } from "../config";

export function buildDetails(ctx: BuildCtx) {
  const { b, M, color } = ctx;
  const steel = color({ color: 0xc4c8cc, metalness: 0.85, roughness: 0.3 });
  const steelDark = color({ color: 0x5c6166, metalness: 0.7, roughness: 0.4 });
  const teakDark = color({ color: 0x3a1c0a, roughness: 0.6 });
  const white = color({ color: 0xf3efe6, roughness: 0.9 });
  const plastic = (c: number) => color({ color: c, roughness: 0.5 });
  const top = P + 0.91; // kitchen counter top

  /* ---------- Kitchen ---------- */
  // Cabinet doors on the back counter (front face at z = -5.35) with brass pulls
  for (const x of [3.6, 4.4, 5.2, 5.95]) {
    b.box(teakDark, 0.74, 0.66, 0.02, x, P + 0.1, -5.34);
    b.box(M.brass, 0.12, 0.025, 0.03, x, P + 0.62, -5.32);
  }
  // Cabinet doors on the side counter (front face at x = 6.35)
  for (const z of [-4.75, -3.55]) {
    b.box(teakDark, 0.02, 0.66, 0.9, 6.34, P + 0.1, z);
    b.box(M.brass, 0.03, 0.025, 0.12, 6.32, P + 0.62, z);
  }
  // Steel sink set into the side counter, with a mixer tap
  {
    const z = -4.15;
    b.box(steel, 0.46, 0.012, 0.62, 6.63, top, z); // rim
    b.box(steelDark, 0.36, 0.006, 0.5, 6.63, top + 0.012, z); // basin (reads as a recess from above)
    b.cyl(M.dark, 0.025, 0.025, 0.004, 6.63, top + 0.018, z, null, 10); // drain
    b.cyl(steel, 0.022, 0.026, 0.3, 6.88, top, z, null, 10); // tap column
    b.box(steel, 0.2, 0.025, 0.03, 6.79, top + 0.28, z); // spout
    b.box(steel, 0.06, 0.02, 0.02, 6.88, top + 0.2, z + 0.05); // lever
    // dish rack with two plates beside the sink
    b.box(steel, 0.3, 0.02, 0.32, 6.65, top, -3.5);
    for (const dz of [-0.06, 0.06]) b.box(white, 0.02, 0.22, 0.22, 6.62, top + 0.02, -3.5 + dz);
  }
  // Mixer-grinder, cutting board with vegetables, masala dabba
  b.box(white, 0.2, 0.14, 0.2, 5.75, top, -5.7);
  b.cyl(steel, 0.07, 0.06, 0.18, 5.75, top + 0.14, -5.7, null, 12);
  b.box(color({ color: 0x2f2a26, roughness: 0.6 }), 0.09, 0.03, 0.09, 5.75, top + 0.32, -5.7);
  b.box(color({ color: 0xc89a62, roughness: 0.7 }), 0.42, 0.02, 0.28, 5.15, top, -5.62);
  b.mesh(new THREE.SphereGeometry(0.045, 8, 6), color({ color: 0xc0392b, roughness: 0.6 }).m).position.set(5.05, top + 0.06, -5.62);
  b.mesh(new THREE.SphereGeometry(0.04, 8, 6), color({ color: 0x7aa33a, roughness: 0.6 }).m).position.set(5.2, top + 0.05, -5.58);
  b.cyl(steel, 0.12, 0.12, 0.07, 3.62, top, -5.6, null, 16);
  // fridge: door split and handles (front face at x = 6.24)
  b.box(M.dark, 0.01, 0.012, 0.66, 6.235, P + 1.22, -1.55);
  b.box(steel, 0.03, 0.5, 0.03, 6.22, P + 1.3, -1.3);
  b.box(steel, 0.03, 0.35, 0.03, 6.22, P + 0.75, -1.3);
  // copper water pot (kudam) on the floor
  {
    const k = b.mesh(new THREE.SphereGeometry(0.2, 14, 10), M.copper.m);
    k.position.set(3.45, P + 0.2, -4.6);
    b.cyl(M.copper, 0.07, 0.09, 0.1, 3.45, P + 0.36, -4.6, null, 12);
  }

  /* ---------- Office ---------- */
  b.box(M.teak, 0.4, 0.5, 0.6, -4.25, P + 0.18, -5.5); // drawer unit
  for (const y of [0.3, 0.52]) b.box(M.brass, 0.08, 0.02, 0.02, -4.25, P + y, -5.19);
  b.cyl(M.brass, 0.07, 0.08, 0.02, -5.3, P + 0.77, -5.6, null, 12); // desk lamp
  b.cyl(M.brass, 0.01, 0.01, 0.34, -5.3, P + 0.79, -5.6, null, 6);
  {
    const shade = b.mesh(new THREE.ConeGeometry(0.09, 0.12, 12, 1, true), color({ color: 0x2f4a5c, roughness: 0.6, side: THREE.DoubleSide }).m);
    shade.position.set(-5.25, P + 1.12, -5.55);
    shade.rotation.z = -0.5;
  }
  b.box(white, 0.22, 0.006, 0.3, -4.35, P + 0.77, -5.45).rotation.y = 0.2; // papers
  b.cyl(M.teak, 0.035, 0.035, 0.1, -4.2, P + 0.77, -5.72, null, 8); // pen holder
  b.box(color({ color: 0x9c3b2a, roughness: 0.8 }), 0.44, 0.06, 0.44, -4.75, P + 0.5, -4.75); // chair cushion

  /* ---------- Bedroom ---------- */
  // almirah (wardrobe) against the kitchen wall, with a mirror and brass handles
  b.box(M.teak, 0.55, 1.95, 1.2, 2.62, P, -3.2);
  b.box(teakDark, 0.01, 1.7, 0.01, 2.34, P + 0.15, -3.2);
  b.box(color({ color: 0xd8e2e6, metalness: 0.9, roughness: 0.08 }), 0.01, 1.2, 0.42, 2.34, P + 0.4, -3.5);
  for (const dz of [-0.06, 0.06]) b.box(M.brass, 0.03, 0.14, 0.02, 2.33, P + 1.0, -3.2 + dz);
  // folded blanket at the foot of the bed
  b.box(color({ color: 0x9c3b2a, roughness: 1 }), 1.3, 0.08, 0.35, 0.25, P + 0.56, -4.05);

  /* ---------- Living room ---------- */
  b.box(white, 0.3, 0.01, 0.22, -5.15, P + 0.41, 0.75); // newspaper on the coffee table
  b.cyl(M.pot, 0.18, 0.13, 0.4, -6.55, P, -1.55, null, 14); // corner plant
  {
    const leaf = b.mesh(new THREE.IcosahedronGeometry(0.34, 1), M.leaf.m);
    leaf.position.set(-6.55, P + 0.75, -1.55);
  }
  b.box(color({ color: 0xb8893b, roughness: 0.9 }), 0.12, 0.38, 0.45, -6.72, P + 0.48, 0.5); // middle cushion

  /* ---------- Wash area ---------- */
  b.box(M.dark, 0.03, 0.06, 0.5, 6.26, P + 0.76, 0); // washing machine control strip
  b.cyl(plastic(0x2f6fa3), 0.04, 0.04, 0.2, 6.75, P + 0.86, 0.15, null, 10); // detergent
  b.cyl(plastic(0xe2b85a), 0.035, 0.035, 0.16, 6.62, P + 0.86, 0.2, null, 10);
  b.cyl(plastic(0x2f6fa3), 0.2, 0.16, 0.3, 5.9, P, 2.35, null, 16, true); // bucket
  b.cyl(plastic(0x2a5a86), 0.16, 0.16, 0.01, 5.9, P + 0.25, 2.35, null, 16); // water in bucket
  {
    const mop = b.cyl(M.teak, 0.015, 0.015, 1.3, 6.85, P, 1.3, null, 6);
    mop.rotation.x = 0.15;
  }

  /* ---------- Coat closet ---------- */
  b.box(color({ color: 0x6b2a20, roughness: 1 }), 0.08, 0.75, 0.3, -6.86, P + 1.0, 3.38); // coat on the first hook
  b.box(M.teak, 0.04, 0.06, 0.9, -4.62, P + 1.72, 5.55); // coat rail by the verandah door
  ([
    [0x2f4a5c, 5.35],
    [0xc9b796, 5.75],
  ] as const).forEach(([c, z]) => b.box(color({ color: c, roughness: 1 }), 0.08, 0.75, 0.3, -4.67, P + 0.97, z));
  for (const x of [-5.75, -5.4, -5.05]) {
    b.box(M.dark, 0.1, 0.07, 0.24, x - 0.06, P + 0.5, 5.7);
    b.box(M.dark, 0.1, 0.07, 0.24, x + 0.06, P + 0.5, 5.7);
  }
  b.cyl(M.dark, 0.02, 0.02, 0.85, -4.85, P + 0.1, 3.35, null, 6); // umbrella in the brass stand
  b.cyl(M.dark, 0.06, 0.02, 0.35, -4.85, P + 0.55, 3.35, null, 8);
}
