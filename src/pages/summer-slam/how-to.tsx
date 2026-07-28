import { Link } from "react-router-dom";
import {
  ArrowLeft,
  MousePointerClick,
  Stamp,
  Upload,
  UserCheck,
  Ticket,
  Trophy,
} from "lucide-react";
import PageShell from "@/components/page-shell.tsx";
import { CompactMobileButtonsOptOut } from "@/components/compact-mobile-buttons.tsx";
import { Button } from "@/components/ui/button.tsx";
import { cn } from "@/lib/utils.ts";
import { PassportHero } from "./_components/passport-hero.tsx";
import {
  ssCard,
  ssCardPad,
  ssMutedSurface,
  ssPageBg,
  ssPageContainer,
  ssPageContent,
  ssSectionTitle,
} from "./_components/passport-dashboard-theme.ts";

const STEPS = [
  {
    icon: Stamp,
    title: "Click or Tap the Stamps to View Quests",
    body: "Each stamp on your passport is a category. Open a stamp to see the quests you need to complete for that destination.",
  },
  {
    icon: MousePointerClick,
    title: "Click the Quests to See If You Need to Submit Evidence",
    body: "Open a quest to read the requirements. Some quests track automatically. Others ask you to submit evidence for staff review.",
  },
  {
    icon: Upload,
    title: "Submit Evidence When Required",
    body: "If a quest needs proof, paste a public evidence link — screenshots via postimages.org, or clips via Medal/Streamable. Only submit when you meet the requirements.",
  },
  {
    icon: UserCheck,
    title: "Wait for Staff Review",
    body: "Submitted evidence is reviewed by staff. Most reviews take 48–72 hours. Check back on the quest if changes are requested.",
  },
  {
    icon: Ticket,
    title: "Earn Stamps & Wheel Tickets",
    body: "Approved quests earn Little Wheel Tickets. Every 5 completed quests earns a Big Wheel Ticket. Finish all quests in a category to earn that stamp.",
  },
  {
    icon: Trophy,
    title: "Unlock the Bonus Quest",
    body: "Complete all five category stamps to unlock the Bonus Quest, plus your passport certificate and Discord role.",
  },
] as const;

export default function SummerSlamHowToPage() {
  return (
    <CompactMobileButtonsOptOut>
      <PageShell maxWidth="wide" className={ssPageBg}>
        <div className={ssPageContent}>
          <div className={ssPageContainer}>
            <div className="mb-1">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-9 -ml-2 px-2 text-xs text-teal-800 touch-manipulation hover:bg-teal-50 hover:text-teal-950 lg:h-8 lg:text-[11px]"
              >
                <Link to="/summer-slam">
                  <ArrowLeft className="mr-1.5 h-4 w-4 lg:mr-1 lg:h-3.5 lg:w-3.5" aria-hidden />
                  Back
                </Link>
              </Button>
            </div>

            <PassportHero title="Summer Slam How To" />

            <section className={cn(ssCard, ssCardPad)} aria-label="How to use your passport">
              <div className="mx-auto max-w-md space-y-1 pb-4 text-center">
                <h2 className={ssSectionTitle}>How To Use Your Passport</h2>
                <p className="text-pretty text-[13px] leading-relaxed text-orange-900/55">
                  Quick tips for finding quests, submitting evidence, and earning rewards.
                </p>
              </div>

              <ol className="mx-auto max-w-md space-y-3">
                {STEPS.map((step, index) => (
                  <li key={step.title} className="flex flex-col items-center gap-1.5">
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-orange-700",
                        ssMutedSurface,
                      )}
                    >
                      <step.icon className="h-4 w-4" aria-hidden />
                    </div>
                    <div className="min-w-0 w-full max-w-[22rem] text-center">
                      <p className="text-sm font-semibold text-orange-950">
                        {index + 1}. {step.title}
                      </p>
                      <p className="mx-auto mt-0.5 text-pretty text-[13px] leading-relaxed text-orange-900/55">
                        {step.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="mx-auto mt-6 flex w-full max-w-md flex-col gap-2 sm:flex-row sm:justify-center">
                <Button
                  asChild
                  className="min-h-14 flex-1 px-5 text-base font-semibold touch-manipulation sm:min-h-11 sm:flex-none sm:px-6 sm:text-sm"
                >
                  <Link to="/summer-slam/passport">Open Passport</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="min-h-14 flex-1 px-5 text-base font-semibold touch-manipulation sm:min-h-11 sm:flex-none sm:px-6 sm:text-sm"
                >
                  <Link to="/summer-slam">Summer Slam Home</Link>
                </Button>
              </div>
            </section>
          </div>
        </div>
      </PageShell>
    </CompactMobileButtonsOptOut>
  );
}
