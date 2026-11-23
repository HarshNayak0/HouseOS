import type { MetadataRoute } from "next";

/** PWA manifest: lets Veedu be added to the Home Screen (needed for iPhone notifications). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Veedu · വീട്",
    short_name: "Veedu",
    description: "Harsh and Prerna's home: lists, chores, calendars, date ideas and trips.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F6F1E7",
    theme_color: "#F6F1E7",
    orientation: "any",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
