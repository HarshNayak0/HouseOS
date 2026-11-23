"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { ColorPicker } from "@/components/account/ColorPicker";
import { InviteLink } from "@/components/account/InviteLink";
import { PushSetup } from "@/components/account/PushSetup";
import { Brand, PageShell, PaperCard, btnPrimary, btnSecondary, input } from "@/components/ui/Card";
import type { PersonColor } from "@/lib/colors";
import { householdKey, useHousehold } from "@/lib/household";
import { displayNameSchema, inviteTokenSchema } from "@/lib/schemas";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Step = "name" | "colour" | "invite" | "calendar" | "notify";

/**
 * First run. Owner: name → colour → (household created) → invite partner → calendar → notifications.
 * Partner (arrives from an invite link): name → colour → (joins) → calendar → notifications.
 */
export function Onboarding() {
  const params = useSearchParams();
  const router = useRouter();
  const qc = useQueryClient();
  const rawInvite = params.get("invite");
  const invite = rawInvite && inviteTokenSchema.safeParse(rawInvite).success ? rawInvite : null;
  const { data, isLoading } = useHousehold();

  const [step, setStep] = useState<Step>("name");
  const [name, setName] = useState("");
  const [color, setColor] = useState<PersonColor>(invite ? "lotus" : "teak");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [inviter, setInviter] = useState<string | null>(null);

  // Prefill the first name from Google.
  useEffect(() => {
    const full = (data?.user?.user_metadata?.full_name as string | undefined) ?? "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time prefill once the user loads
    if (full && !name) setName(full.split(" ")[0]);
  }, [data?.user, name]);

  useEffect(() => {
    if (!invite) return;
    supabaseBrowser()
      ?.rpc("invite_info", { p_token: invite })
      .then(({ data }) => setInviter((data as { inviter_name: string }[] | null)?.[0]?.inviter_name ?? null));
  }, [invite]);

  // Already in a household (and not mid-way through these steps)? Go home.
  const joinedHere = step === "invite" || step === "calendar" || step === "notify";
  useEffect(() => {
    if (!isLoading && data?.me && !joinedHere) router.replace("/");
  }, [isLoading, data?.me, joinedHere, router]);

  const total = invite ? 4 : 5;
  const order: Step[] = invite ? ["name", "colour", "calendar", "notify"] : ["name", "colour", "invite", "calendar", "notify"];
  const index = order.indexOf(step) + 1;

  const submitName = (e: React.FormEvent) => {
    e.preventDefault();
    const r = displayNameSchema.safeParse(name);
    if (!r.success) return setError(r.error.issues[0].message);
    setError(null);
    setName(r.data);
    setStep("colour");
  };

  const finishProfile = async () => {
    const sb = supabaseBrowser();
    if (!sb) return;
    setBusy(true);
    setError(null);
    const { error } = invite
      ? await sb.rpc("accept_invite", { p_token: invite, p_display_name: name, p_color: color })
      : await sb.rpc("create_household", { p_display_name: name, p_color: color });
    setBusy(false);
    if (error) return setError(error.message);
    await qc.invalidateQueries({ queryKey: householdKey });
    setStep(invite ? "calendar" : "invite");
  };

  return (
    <PageShell>
      <Brand />
      <PaperCard>
        <p className="m-0 text-xs font-bold tracking-wider text-teak uppercase">
          Step {Math.max(index, 1)} of {total}
        </p>
        {step === "name" && (
          <form onSubmit={submitName}>
            <h1 className="mt-1 mb-1 font-serif text-2xl font-semibold">
              {invite && inviter ? `${inviter} invited you home` : "Let's set up your home"}
            </h1>
            <label htmlFor="name" className="mt-3 block text-sm font-bold">
              What should the house call you?
            </label>
            <input id="name" className={`${input} mt-1`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" maxLength={40} />
            <button type="submit" className={`${btnPrimary} mt-4 w-full`}>
              Continue
            </button>
          </form>
        )}
        {step === "colour" && (
          <div>
            <h1 className="mt-1 mb-1 font-serif text-2xl font-semibold">Pick your colour</h1>
            <p className="mt-0 mb-4 text-sm text-ink-2">Your events, tasks and notes will wear it.</p>
            <ColorPicker value={color} onChange={setColor} name="Your colour" />
            <div className="mt-5 flex gap-2">
              <button type="button" className={btnSecondary} onClick={() => setStep("name")}>
                Back
              </button>
              <button type="button" className={`${btnPrimary} flex-1`} onClick={finishProfile} disabled={busy}>
                {busy ? "Moving in…" : invite ? "Join the household" : "Create our home"}
              </button>
            </div>
          </div>
        )}
        {step === "invite" && (
          <div>
            <h1 className="mt-1 mb-1 font-serif text-2xl font-semibold">Invite Prerna</h1>
            <p className="mt-0 mb-4 text-sm text-ink-2">Send her this link. You can also do this later from Settings.</p>
            <InviteLink partnerHint="Prerna" />
            <button type="button" className={`${btnSecondary} mt-4 w-full`} onClick={() => setStep("calendar")}>
              Next
            </button>
          </div>
        )}
        {step === "calendar" && (
          <div>
            <h1 className="mt-1 mb-1 font-serif text-2xl font-semibold">Connect your calendar</h1>
            <p className="mt-0 mb-4 text-sm text-ink-2">
              Google Calendar sync arrives in a later update. You&apos;ll be able to connect it from Settings.
            </p>
            <button type="button" className={`${btnPrimary} w-full`} onClick={() => setStep("notify")}>
              Skip for now
            </button>
          </div>
        )}
        {step === "notify" && data?.me && (
          <div>
            <h1 className="mt-1 mb-1 font-serif text-2xl font-semibold">Notifications</h1>
            <p className="mt-0 mb-4 text-sm text-ink-2">
              Reminders for chores, birthdays and notes from {invite ? (inviter ?? "your partner") : "Prerna"}. Quiet from 23:00 to 07:00.
            </p>
            <PushSetup householdId={data.me.household_id} memberId={data.me.id} />
            <button type="button" className={`${btnPrimary} mt-5 w-full`} onClick={() => router.replace("/")}>
              Open the house
            </button>
          </div>
        )}
        {error && (
          <p role="alert" className="mt-3 text-sm text-urgent">
            {error}
          </p>
        )}
      </PaperCard>
    </PageShell>
  );
}
