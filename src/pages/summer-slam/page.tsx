import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useConvexAuth } from "convex/react";
import { useAuth } from "@clerk/react";
import { api } from "@/convex/_generated/api.js";
import { useUserRole } from "@/hooks/use-user-role.ts";
import PageShell from "@/components/page-shell.tsx";
import { CompactMobileButtonsOptOut } from "@/components/compact-mobile-buttons.tsx";
import { Button } from "@/components/ui/button.tsx";
import { SignInButton } from "@/components/ui/signin.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import {
  getCampaignPhase,
  isAdminPassportPreview,
  isPassportAccessible,
  phaseMessage,
  submissionsPendingMessage,
} from "./_components/campaign-phase.ts";
import {
  ssCard,
  ssCardPad,
  ssMutedSurface,
  ssPageBg,
  ssPageContainer,
  ssPageContent,
  ssPassportGrid,
  ssPassportMainColumn,
  ssPassportSidebar,
  ssPassportStretchPanel,
  ssSkeleton,
} from "./_components/passport-dashboard-theme.ts";
import { PassportTicketTotalsPanel } from "./_components/passport-ticket-totals-panel.tsx";
import { PassportLeaderboardPanel } from "./_components/passport-leaderboard-panel.tsx";
import { PassportHero } from "./_components/passport-hero.tsx";
import { SEASON_REWARDS } from "./_components/passport-destinations.ts";
import { CAMPAIGN_SLUG, getPassportErrorTitle, mapEnsurePassportError } from "./_components/passport-types.ts";
import { Compass, Gift, Stamp, Sun, Trophy, Upload, UserCheck } from "lucide-react";

const LANDING_INTRO_LINES = [
  "Complete quests during scrims, submit evidence,",
  "and earn Wheel Tickets for a chance to win prizes!",
] as const;

const STEPS = [
  {
    icon: Compass,
    title: "Open Your Passport",
    body: "Five destination categories, each with quests. Track progress on your passport.",
  },
  {
    icon: Sun,
    title: "Complete Quests",
    body: "Some quests are tracked automatically. Others need evidence for staff review.",
  },
  {
    icon: Upload,
    title: "Submit Evidence",
    body: "For manual quests, paste a public evidence link — screenshots via postimages.org, or clips via Medal/Streamable. Only submit when you meet the requirements.",
  },
  {
    icon: UserCheck,
    title: "Staff Review",
    body: "Admins review submitted evidence. Most reviews take 48–72 hours.",
  },
  {
    icon: Stamp,
    title: "Earn Seals",
    body: "Approve every quest in a category to earn that seal on your passport.",
  },
  {
    icon: Trophy,
    title: "Wheel Tickets",
    body: "Completing quests earns Little and Big Wheel Tickets for the prize draws.",
  },
];

const TAB_TRIGGER_CLASS =
  "flex flex-1 items-center justify-center rounded-md border border-transparent px-3 py-2 text-center text-sm font-semibold sm:text-base " +
  "transition-[color,background-color,box-shadow] " +
  "data-[state=inactive]:bg-transparent data-[state=inactive]:text-orange-800/55 " +
  "data-[state=inactive]:hover:bg-orange-100/80 data-[state=inactive]:hover:text-orange-950 " +
  "data-[state=active]:!border-teal-700/30 data-[state=active]:!bg-teal-600 data-[state=active]:!text-white " +
  "data-[state=active]:shadow-sm data-[state=active]:hover:!bg-teal-700 " +
  "focus-visible:ring-teal-400/50";

const GUIDE_TAB_PANEL_CLASS =
  "col-start-1 row-start-1 mt-0 data-[state=inactive]:pointer-events-none data-[state=inactive]:invisible";
const GUIDE_STEP_TITLE_CLASS = "text-center text-sm font-semibold text-orange-950";
const GUIDE_STEP_BODY_CLASS =
  "mx-auto max-w-[22rem] text-pretty text-center text-[13px] leading-relaxed text-orange-900/55";
const GUIDE_LIST_CLASS = "mt-2 space-y-1 text-center text-[13px] text-orange-900/55";

const LITTLE_PRIZE_EXAMPLES = [
  "$5 Cash",
  "Gifted Emotes",
  "Nitro Basic",
  "Discord Badge",
  "Discord Role",
  "1 Week GIF Use in Scrim Chats",
] as const;

const BIG_PRIZE_EXAMPLES = [
  "$10–15 Cash",
  "1,000 V-Bucks",
  "Gifted Skins",
  "Steam Gift Cards",
  "Nitro",
] as const;

function getPrizeItems() {
  const fullPassport = SEASON_REWARDS.find((reward) => reward.id === "passport");

  return [
    {
      icon: Gift,
      title: "Little Wheel Ticket",
      body: "Each completed quest earns a Little Wheel Ticket for regular season prize draws.",
    },
    {
      icon: Trophy,
      title: "Big Wheel Ticket",
      body: "Every 5 completed quests earns a Big Wheel Ticket for the end-of-season prize draw.",
    },
    {
      icon: Stamp,
      title: "Bonus Quest",
      body:
        fullPassport?.description ??
        "Complete all five categories to unlock the Bonus Quest, plus a certificate and Discord role.",
    },
  ] as const;
}

export default function SummerSlamLandingPage() {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn } = useAuth();
  const { isAuthenticated: isConvexAuthenticated } = useConvexAuth();
  const { isAdmin } = useUserRole();
  const [isClaimingPassport, setIsClaimingPassport] = useState(false);
  const campaign = useQuery(api.seasonal.getCampaign, { slug: CAMPAIGN_SLUG });
  const passportStatus = useQuery(
    api.seasonal.getPassport,
    isSignedIn && isConvexAuthenticated ? { slug: CAMPAIGN_SLUG } : "skip",
  );
  const ensureMyPassport = useMutation(api.seasonal.ensureMyPassport);

  const phase = getCampaignPhase(campaign ?? null);
  const statusMessage = isAdminPassportPreview(campaign ?? null, isAdmin)
    ? "Admin preview is available before launch. Claim a passport to check quests and layout."
    : submissionsPendingMessage(campaign ?? null) ?? phaseMessage(phase);
  const canEnterPassport = isPassportAccessible(campaign ?? null, Date.now(), { adminPreview: isAdmin });
  const isAdminPreview = isAdminPassportPreview(campaign ?? null, isAdmin);
  const hasPassport = Boolean(passportStatus?.passport);
  const isPassportStatusLoading =
    isSignedIn && (!isConvexAuthenticated || passportStatus === undefined);
  const prizeItems = getPrizeItems();

  const handleClaimPassport = async () => {
    setIsClaimingPassport(true);
    try {
      await ensureMyPassport({ slug: CAMPAIGN_SLUG });
      navigate("/summer-slam/passport");
    } catch (error) {
      const message = String(
        (error as { data?: { message?: string }; message?: string })?.data?.message ||
          (error as Error)?.message ||
          "",
      );
      toast.error(getPassportErrorTitle(message), {
        description: mapEnsurePassportError(message),
      });
    } finally {
      setIsClaimingPassport(false);
    }
  };

  return (
    <CompactMobileButtonsOptOut>
    <PageShell maxWidth="wide" className={ssPageBg}>
      <div className={ssPageContent}>
        <div className={ssPageContainer}>
          <PassportHero title={campaign?.title ?? "Summer Slam Passport"} />

          <div className="flex flex-col gap-4">
            <div className="mx-auto flex w-full flex-row items-center justify-center gap-3 sm:gap-3">
              {!isLoaded || campaign === undefined || isPassportStatusLoading ? (
                <Skeleton className={cn("h-14 flex-1 sm:h-11 sm:max-w-[11rem]", ssSkeleton)} />
              ) : !canEnterPassport ? (
                isSignedIn ? (
                  <Button asChild className="min-h-14 flex-1 px-5 text-base font-semibold touch-manipulation sm:min-h-11 sm:flex-none sm:px-6 sm:text-sm">
                    <Link to="/summer-slam/passport">Coming Soon</Link>
                  </Button>
                ) : (
                  <Button disabled className="min-h-14 flex-1 px-5 text-base font-semibold touch-manipulation sm:min-h-11 sm:flex-none sm:px-6 sm:text-sm">
                    Coming Soon
                  </Button>
                )
              ) : isSignedIn ? (
                  hasPassport ? (
                    <Button asChild className="min-h-14 flex-1 px-5 text-base font-semibold touch-manipulation sm:min-h-11 sm:flex-none sm:px-6 sm:text-sm">
                      <Link to="/summer-slam/passport">
                        {isAdminPreview ? "Preview Passport" : "My Passport"}
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      className="min-h-14 flex-1 px-5 text-base font-semibold touch-manipulation sm:min-h-11 sm:flex-none sm:px-6 sm:text-sm"
                      disabled={isClaimingPassport}
                      onClick={() => void handleClaimPassport()}
                    >
                      {isClaimingPassport
                        ? "Claiming…"
                        : isAdminPreview
                          ? "Preview Passport"
                          : "Claim Passport"}
                    </Button>
                  )
                ) : (
                  <SignInButton
                    className="min-h-14 flex-1 px-5 text-base font-semibold touch-manipulation sm:min-h-11 sm:flex-none sm:px-6 sm:text-sm"
                    signInText="Sign in with Discord"
                    showIcon={false}
                  />
                )
              }
              <Button
                asChild
                variant="outline"
                className="min-h-14 flex-1 px-5 text-base font-semibold touch-manipulation sm:min-h-11 sm:flex-none sm:px-6 sm:text-sm"
              >
                <Link to="/support">Site Support</Link>
              </Button>
            </div>

            <div className={ssPassportGrid}>
            <div className={ssPassportMainColumn}>
              <section
                className={cn(ssCard, ssCardPad, ssPassportStretchPanel)}
                aria-label="Summer Slam guide"
              >
                <Tabs defaultValue="how-it-works" className="flex min-h-0 flex-1 flex-col gap-3">
                  {campaign === undefined ? (
                    <Skeleton className={cn("mx-auto h-6 w-full max-w-md", ssSkeleton)} />
                  ) : (
                    <div className="mx-auto max-w-md space-y-3 py-1">
                      <p className="text-center text-lg font-semibold leading-snug text-orange-950 sm:text-xl">
                        {LANDING_INTRO_LINES.map((line) => (
                          <span key={line} className="block">
                            {line}
                          </span>
                        ))}
                      </p>
                      {statusMessage ? (
                        <p className="rounded-lg border border-orange-200/60 bg-orange-50/50 px-3 py-2 text-pretty text-center text-sm leading-relaxed text-orange-900/70">
                          {statusMessage}
                        </p>
                      ) : null}
                    </div>
                  )}
                  <TabsList className="h-auto w-full justify-stretch rounded-lg border border-orange-200/60 bg-orange-50/50 p-1 text-orange-900">
                    <TabsTrigger value="how-it-works" className={TAB_TRIGGER_CLASS}>
                      How It Works
                    </TabsTrigger>
                    <TabsTrigger value="prizes" className={TAB_TRIGGER_CLASS}>
                      Prizes
                    </TabsTrigger>
                  </TabsList>

                  <div className="grid min-h-0 flex-1">
                    <TabsContent forceMount value="how-it-works" className={GUIDE_TAB_PANEL_CLASS}>
                      <ol className="space-y-3">
                        {STEPS.map((step, index) => (
                          <li key={step.title} className="flex flex-col items-center gap-1.5">
                            <div
                              className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-orange-700",
                                ssMutedSurface,
                              )}
                            >
                              <step.icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 w-full max-w-[22rem]">
                              <p className={GUIDE_STEP_TITLE_CLASS}>
                                {index + 1}. {step.title}
                              </p>
                              <p className={GUIDE_STEP_BODY_CLASS}>{step.body}</p>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </TabsContent>

                    <TabsContent forceMount value="prizes" className={GUIDE_TAB_PANEL_CLASS}>
                      <p className={GUIDE_STEP_BODY_CLASS}>
                        Complete quests, earn Little and Big Wheel Tickets, and compete for Little and Big Prizes.
                      </p>
                      <ul className="mt-3 space-y-3">
                        {prizeItems.map((prize) => (
                          <li key={prize.title} className="flex flex-col items-center gap-1.5">
                            <div
                              className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-orange-700",
                                ssMutedSurface,
                              )}
                            >
                              <prize.icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0 w-full max-w-[22rem]">
                              <p className={GUIDE_STEP_TITLE_CLASS}>{prize.title}</p>
                              <p className={GUIDE_STEP_BODY_CLASS}>{prize.body}</p>
                            </div>
                          </li>
                        ))}
                      </ul>
                      <div className="mx-auto mt-6 grid w-full max-w-md gap-4 sm:grid-cols-2">
                        <div className="text-center">
                          <p className={GUIDE_STEP_TITLE_CLASS}>Little Prizes</p>
                          <ul className={GUIDE_LIST_CLASS}>
                            {LITTLE_PRIZE_EXAMPLES.map((prize) => (
                              <li key={prize}>{prize}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="text-center">
                          <p className={GUIDE_STEP_TITLE_CLASS}>Big Prizes</p>
                          <ul className={GUIDE_LIST_CLASS}>
                            {BIG_PRIZE_EXAMPLES.map((prize) => (
                              <li key={prize}>{prize}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </TabsContent>
                  </div>
                </Tabs>
              </section>
            </div>

            <aside className={ssPassportSidebar}>
              <PassportTicketTotalsPanel />
              <PassportLeaderboardPanel />
            </aside>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
    </CompactMobileButtonsOptOut>
  );
}
