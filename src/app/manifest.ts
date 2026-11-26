import type { MetadataRoute } from "next";

/** PWA manifest: lets Veedu be added to the Home Screen (needed for iPhone notifications). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Veedu · വീട്",
    short_name: "Veedu",
    description: "Your home for two: lists, chores, calendars, date ideas and trips.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#F6F1E7",
    theme_color: "#F6F1E7",
    orientation: "any",
    // Android: "Share → Veedu" from Instagram or a browser opens the recipe importer
    share_target: { action: "/share", method: "GET", params: { title: "title", text: "text", url: "url" } },
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
