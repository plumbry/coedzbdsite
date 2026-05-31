import { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { CalculatedSection, CalculatedStat } from "@/convex/wrappedStats.ts";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/button.tsx";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { ChevronRight, Sparkles, ArrowLeft } from "lucide-react";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { useNavigate } from "react-router-dom";

const ZBD_COLORS = {
  lightBlue: "#1e98e5",
  blue: "#2647bb",
  yellow: "#fae904",
};

type SlideData =
  | { type: "intro" }
  | { type: "sectionHeader"; data: { name: string; tagline?: string } }
  | { type: "stat"; data: CalculatedStat }
  | { type: "sponsors"; data: { sponsors: Array<{ name: string; logoUrl?: string }> } }
  | { type: "thankyou"; data: { customMessage?: string } };

function WrappedPreviewInner() {
  const navigate = useNavigate();
  const wrappedContent = useQuery(api.wrapped.getWrappedContent, { year: 2025 });
  const calculatedSections = useQuery(api.wrappedStats.calculateAllStats, { year: 2025 });
  const [currentSlide, setCurrentSlide] = useState(0);
  const [hasStarted, setHasStarted] = useState(false);

  // Build slides with sections and section headers
  const slides: SlideData[] = [{ type: "intro" }];
  
  if (calculatedSections) {
    for (const section of calculatedSections) {
      // Add section header slide
      slides.push({ type: "sectionHeader", data: { name: section.name, tagline: section.tagline } });
      // Add stats from this section
      for (const stat of section.stats) {
        slides.push({ type: "stat", data: stat });
      }
    }
  }

  // Add sponsors and thank you
  if (wrappedContent?.sponsors && wrappedContent.sponsors.length > 0) {
    slides.push({
      type: "sponsors",
      data: { sponsors: wrappedContent.sponsors },
    });
  }
  slides.push({ type: "thankyou", data: { customMessage: wrappedContent?.customMessage } });

  const totalSlides = slides.length;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        if (!hasStarted) {
          setHasStarted(true);
        } else if (currentSlide < totalSlides - 1) {
          setCurrentSlide(currentSlide + 1);
        }
      } else if (e.key === "ArrowLeft") {
        if (currentSlide > 0) {
          setCurrentSlide(currentSlide - 1);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentSlide, hasStarted, totalSlides]);

  const nextSlide = () => {
    if (!hasStarted) {
      setHasStarted(true);
      return;
    }
    if (currentSlide < totalSlides - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const prevSlide = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  // Loading state
  if (wrappedContent === undefined || calculatedSections === undefined) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{
          background: `linear-gradient(135deg, ${ZBD_COLORS.blue} 0%, ${ZBD_COLORS.lightBlue} 100%)`,
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center text-white"
        >
          <Sparkles className="mx-auto mb-4 h-16 w-16" />
          <h1 className="text-4xl font-bold">Loading...</h1>
        </motion.div>
      </div>
    );
  }

  // No content yet
  if (!wrappedContent || calculatedSections.length === 0) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        style={{
          background: `linear-gradient(135deg, ${ZBD_COLORS.blue} 0%, ${ZBD_COLORS.lightBlue} 100%)`,
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center text-white"
        >
          <Sparkles className="mx-auto mb-4 h-16 w-16" />
          <h1 className="mb-4 text-4xl font-bold">No Content Yet</h1>
          <p className="mb-8 text-xl text-white/80">Add some sections and stats in the editor first.</p>
          <Button
            onClick={() => navigate("/admin/2025-wrapped-editor")}
            style={{ backgroundColor: ZBD_COLORS.yellow, color: ZBD_COLORS.blue }}
          >
            Go to Editor
          </Button>
        </motion.div>
      </div>
    );
  }

  const currentSlideData = slides[currentSlide];

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${ZBD_COLORS.blue} 0%, ${ZBD_COLORS.lightBlue} 100%)`,
      }}
    >
      {/* Back to editor button */}
      <Button
        variant="ghost"
        onClick={() => navigate("/admin/2025-wrapped-editor")}
        className="fixed left-4 top-4 z-50 text-white hover:bg-white/10"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Editor
      </Button>

      {/* Preview badge */}
      <div className="fixed right-4 top-4 z-50 rounded-full bg-yellow-500 px-4 py-2 text-sm font-semibold text-gray-900">
        PREVIEW MODE
      </div>

      {/* Intro slide */}
      {!hasStarted && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center text-white"
        >
          <motion.div
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            <Sparkles className="mx-auto mb-6 h-20 w-20" style={{ color: ZBD_COLORS.yellow }} />
            <h1 className="mb-4 text-6xl font-bold">ZBD 2025 Wrapped</h1>
            <p className="mb-8 text-xl text-white/80">
              {wrappedContent?.introTagline || "Your year in competitive Fortnite"}
            </p>
            <Button
              size="lg"
              onClick={() => setHasStarted(true)}
              style={{ backgroundColor: ZBD_COLORS.yellow, color: ZBD_COLORS.blue }}
              className="hover:opacity-90"
            >
              Let's Go
              <ChevronRight className="ml-2 h-5 w-5" />
            </Button>
          </motion.div>
        </motion.div>
      )}

      {/* Main slides */}
      {hasStarted && (
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide}
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            transition={{ duration: 0.5 }}
            className="w-full max-w-4xl px-6 text-center text-white"
          >
            {/* Section header slide */}
            {currentSlideData.type === "sectionHeader" && (
              <div>
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                >
                  <h2
                    className="text-6xl font-bold"
                    style={{ color: ZBD_COLORS.yellow }}
                  >
                    {currentSlideData.data.name}
                  </h2>
                  {currentSlideData.data.tagline && (
                    <motion.p
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      className="mt-4 text-xl text-white/80"
                    >
                      {currentSlideData.data.tagline}
                    </motion.p>
                  )}
                </motion.div>
              </div>
            )}

            {/* Stat slide */}
            {currentSlideData.type === "stat" && (
              <div>
                <motion.p
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="mb-4 text-2xl font-medium"
                  style={{ color: ZBD_COLORS.yellow }}
                >
                  {currentSlideData.data.label}
                </motion.p>

                {/* Single value stat */}
                {currentSlideData.data.value !== undefined && !currentSlideData.data.players && (
                  <>
                    <motion.div
                      initial={{ scale: 0.5, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.4, type: "spring", stiffness: 200 }}
                      className="mb-4 text-9xl font-bold"
                    >
                      {currentSlideData.data.value.toLocaleString()}
                    </motion.div>
                    {currentSlideData.data.subtitle && (
                      <motion.p
                        initial={{ y: 20, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="text-xl text-white/80"
                      >
                        {currentSlideData.data.subtitle}
                      </motion.p>
                    )}
                  </>
                )}

                {/* Tier breakdown stat */}
                {currentSlideData.data.tierData && (
                  <div className="space-y-4">
                    {currentSlideData.data.tierData.map((tier: { tier: string; count: number; percentage: number }, i: number) => (
                      <motion.div
                        key={i}
                        initial={{ x: -50, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.3 + i * 0.1 }}
                      >
                        <Card className="bg-white/10 p-6 backdrop-blur-sm">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <span
                                className="text-3xl font-bold"
                                style={{ color: ZBD_COLORS.yellow }}
                              >
                                Tier {tier.tier}
                              </span>
                            </div>
                            <div className="text-right">
                              <div className="text-2xl font-bold">{tier.count} players</div>
                              <div className="text-lg text-white/80">{tier.percentage}%</div>
                            </div>
                          </div>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                )}

                {/* Breakdown stat (key-value pairs) */}
                {currentSlideData.data.breakdown && (
                  <div className="space-y-3">
                    {Object.entries(currentSlideData.data.breakdown).map(([key, value]: [string, number | string], i: number) => (
                      <motion.div
                        key={i}
                        initial={{ x: -30, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.3 + i * 0.1 }}
                      >
                        <Card className="bg-white/10 p-4 backdrop-blur-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-lg">{key}</span>
                            <span className="text-xl font-bold" style={{ color: ZBD_COLORS.yellow }}>
                              {value}
                            </span>
                          </div>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                )}

                {/* Player list stat */}
                {currentSlideData.data.players && (
                  <div className="space-y-4">
                    {currentSlideData.data.players.map((player: { name: string; value: number; metric: string }, i: number) => (
                      <motion.div
                        key={i}
                        initial={{ x: -50, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        transition={{ delay: 0.3 + i * 0.1 }}
                      >
                        <Card className="bg-white/10 p-6 backdrop-blur-sm">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              <span
                                className="text-3xl font-bold"
                                style={{ color: ZBD_COLORS.yellow }}
                              >
                                #{i + 1}
                              </span>
                              <span className="text-2xl font-semibold">{player.name}</span>
                            </div>
                            <span className="text-2xl font-bold">
                              {player.value.toLocaleString()} {player.metric}
                            </span>
                          </div>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Sponsors slide */}
            {currentSlideData.type === "sponsors" && (
              <div>
                <motion.h2
                  initial={{ y: -20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="mb-8 text-4xl font-bold"
                  style={{ color: ZBD_COLORS.yellow }}
                >
                  Thank You to Our Sponsors
                </motion.h2>
                <div className="grid gap-6 md:grid-cols-2">
                  {currentSlideData.data.sponsors.map((sponsor, i) => (
                    <motion.div
                      key={i}
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.3 + i * 0.1 }}
                    >
                      <Card className="bg-white/10 p-8 backdrop-blur-sm">
                        {sponsor.logoUrl && (
                          <img
                            src={sponsor.logoUrl}
                            alt={sponsor.name}
                            className="mx-auto mb-4 h-16 object-contain"
                          />
                        )}
                        <p className="text-2xl font-bold">{sponsor.name}</p>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Thank you slide */}
            {currentSlideData.type === "thankyou" && (
              <div>
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                >
                  <Sparkles
                    className="mx-auto mb-6 h-20 w-20"
                    style={{ color: ZBD_COLORS.yellow }}
                  />
                  <h2 className="mb-4 text-5xl font-bold">Thank You!</h2>
                  {currentSlideData.data.customMessage && (
                    <motion.p
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ delay: 0.4 }}
                      className="mx-auto mb-8 max-w-2xl text-xl text-white/90"
                    >
                      {currentSlideData.data.customMessage}
                    </motion.p>
                  )}
                  <motion.p
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.6 }}
                    className="text-2xl font-semibold"
                    style={{ color: ZBD_COLORS.yellow }}
                  >
                    Here's to an even better 2026! 🎉
                  </motion.p>
                </motion.div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Navigation */}
      {hasStarted && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2">
          <div className="flex items-center gap-4">
            <Button variant="secondary" onClick={prevSlide} disabled={currentSlide === 0}>
              Previous
            </Button>
            <div className="flex gap-2">
              {slides.slice(0, -1).map((_, i) => (
                <div
                  key={i}
                  className="h-2 w-2 rounded-full transition-all"
                  style={{
                    backgroundColor:
                      i === currentSlide ? ZBD_COLORS.yellow : "rgba(255,255,255,0.3)",
                  }}
                />
              ))}
            </div>
            <Button
              onClick={nextSlide}
              disabled={currentSlide === totalSlides - 1}
              style={{ backgroundColor: ZBD_COLORS.yellow, color: ZBD_COLORS.blue }}
              className="hover:opacity-90"
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Progress indicator */}
      {hasStarted && (
        <div className="fixed right-8 top-1/2 -translate-y-1/2 text-right text-sm text-white/60">
          {currentSlide + 1} / {totalSlides}
        </div>
      )}
    </div>
  );
}

export default function WrappedPreviewPage() {
  return (
    <AdminPageLayout skipHeader requireAdmin authTitle="Sign in to preview the wrapped page">
      <WrappedPreviewInner />
    </AdminPageLayout>
  );
}
