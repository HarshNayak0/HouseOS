/**
 * Settings for this copy of Veedu (each couple has their own deployment). They come from build-time
 * environment variables, set per copy by the couples workflow (see instances/README.md). Without them,
 * the defaults are the original copy's: Toronto.
 */
const num = (v: string | undefined, fallback: number) => (v && Number.isFinite(Number(v)) ? Number(v) : fallback);

export const INSTANCE = {
  /** IANA time zone everything is shown in (times are always stored in UTC). */
  timeZone: process.env.NEXT_PUBLIC_HOME_TZ || "America/Toronto",
  /** City name for labels like "Quiet hours (Toronto time)". */
  city: process.env.NEXT_PUBLIC_HOME_CITY || "Toronto",
  /** Where the sun is computed for (automatic evening mode). */
  lat: num(process.env.NEXT_PUBLIC_HOME_LAT, 43.6532),
  lng: num(process.env.NEXT_PUBLIC_HOME_LNG, -79.3832),
} as const;
