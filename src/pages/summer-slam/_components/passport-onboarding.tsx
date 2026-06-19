import { useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Award, MousePointerClick, Sparkles, TrendingUp, Upload } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";

const STORAGE_KEY = "ss-passport-onboarding-v1";

const STEPS: Array<{ icon: LucideIcon; step: string; title: string; body: string }> = [
  {
    icon: TrendingUp,
    step: "Step 1",
    title: "Check your overall progress",
    body: "Passport progress shows how many stamps you've earned and how long the season has left.",
  },
  {
    icon: MousePointerClick,
    step: "Step 2",
    title: "Click any stamp to see requirements",
    body: "Each stamp opens a panel with its challenges, your progress, and submission history.",
  },
  {
    icon: Upload,
    step: "Step 3",
    title: "Submit evidence to earn stamps",
    body: "Once you've completed a challenge, submit proof. Staff review it and award your stamp.",
  },
];

export function hasSeenPassportOnboarding(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return true;
  }
}

function markOnboardingSeen() {
  try {
    window.localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    /* ignore storage failures (private mode, etc.) */
  }
}

/**
 * Lightweight first-visit guide. Shown once per browser (dismissal persisted in
 * local storage). Can also be re-opened on demand via the `forceOpen` prop.
 */
export function PassportOnboarding({
  forceOpen,
  onClose,
}: {
  forceOpen?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hasSeenPassportOnboarding()) setOpen(true);
  }, []);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  const dismiss = () => {
    markOnboardingSeen();
    setOpen(false);
    onClose?.();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : dismiss())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <div className="mb-1 flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-teal-500 text-white shadow-sm">
            <Sparkles className="h-5 w-5" aria-hidden />
          </div>
          <DialogTitle className="font-display text-xl font-semibold tracking-[0.02em]">
            Welcome to Summer Slam Passport
          </DialogTitle>
          <DialogDescription>
            Track your progress, collect stamps, and complete seasonal challenges.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-3">
          {STEPS.map(({ icon: Icon, step, title, body }) => (
            <li
              key={step}
              className="flex gap-3 rounded-xl border border-stone-200/80 bg-stone-50/60 p-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-teal-700 shadow-sm">
                <Icon className="h-4 w-4" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-teal-700">
                  {step}
                </p>
                <p className="text-sm font-semibold text-stone-900">{title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-stone-600">{body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-2 flex items-center gap-2 rounded-xl border border-teal-200/70 bg-teal-50/60 px-3 py-2.5 text-xs text-teal-900">
          <Award className="h-4 w-4 shrink-0" aria-hidden />
          Earn all five stamps to complete your passport and maximise your prize wheel tickets.
        </div>

        <Button className="mt-1 min-h-11 w-full touch-manipulation" onClick={dismiss}>
          Get started
        </Button>
      </DialogContent>
    </Dialog>
  );
}
