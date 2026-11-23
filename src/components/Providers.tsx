"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useHouseholdRealtime } from "@/lib/household";

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
    </QueryClientProvider>
  );
}

/** The app's single live-updates subscription. */
function Realtime() {
  useHouseholdRealtime();
  return null;
}
