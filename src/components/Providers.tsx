"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useHouseholdRealtime } from "@/lib/household";
import { useListsRealtime } from "@/lib/lists/rows";
import { Toaster } from "@/panels/ui";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: true } } }));
  // Service worker: needed for push notifications and "Add to Home Screen".
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return (
    <QueryClientProvider client={client}>
      <Realtime />
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}

/** The app's live-updates subscriptions (each opened exactly once). */
function Realtime() {
  useHouseholdRealtime();
  useListsRealtime();
  return null;
}
