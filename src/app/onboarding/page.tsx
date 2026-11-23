import type { Metadata } from "next";
import { Suspense } from "react";
import { Onboarding } from "./Onboarding";

export const metadata: Metadata = { title: "Welcome · Veedu" };

export default function OnboardingPage() {
  return (
    <Suspense>
      <Onboarding />
    </Suspense>
  );
}
