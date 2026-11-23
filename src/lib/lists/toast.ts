"use client";

import { useSyncExternalStore } from "react";

export interface Toast {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
  tone?: "info" | "error";
}

let toasts: Toast[] = [];
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Show a short message at the bottom of the screen (optionally with an Undo button). */
export function toast(text: string, opts: { action?: Toast["action"]; tone?: Toast["tone"]; ms?: number } = {}) {
  const t: Toast = { id: ++seq, text, action: opts.action, tone: opts.tone };
  toasts = [...toasts.slice(-2), t];
  emit();
  setTimeout(() => dismiss(t.id), opts.ms ?? (opts.action ? 7000 : 3500));
}

export function dismiss(id: number) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => toasts,
    () => toasts,
  );
}
