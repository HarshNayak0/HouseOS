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
    // Android: "Share → Veedu". Text or a link opens the recipe importer; a ticket PDF or screenshot
    // goes to the backyard to be attached to a trip (src/app/share/receive/route.ts).
    share_target: {
      action: "/share/receive",
      method: "POST",
      enctype: "multipart/form-data",
      params: { title: "title", text: "text", url: "url", files: [{ name: "files", accept: ["application/pdf", ".pdf", "image/*"] }] },
    },
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
