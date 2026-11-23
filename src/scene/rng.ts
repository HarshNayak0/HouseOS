/**
 * The prototype's seeded Park–Miller RNG. One shared stream, consumed in the same order
 * as the prototype (textures first, then props), so the house comes out identical.
 */
export class Rng {
  constructor(public seed = 11) {}
  next = (): number => {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  };
}
