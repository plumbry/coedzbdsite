import { useEffect } from "react";
import { motion } from "motion/react";
import { CategorySeal } from "./passport-category-seals.tsx";
import { ssStampSize } from "./passport-dashboard-theme.ts";
import type { QuestCategory } from "./passport-types.ts";

export function StampDropOverlay({
  show,
  categoryId,
  onComplete,
  reduceMotion,
}: {
  show: boolean;
  categoryId: string;
  onComplete: () => void;
  reduceMotion: boolean;
}) {
  useEffect(() => {
    if (!show) return;
    const duration = reduceMotion ? 0 : 800;
    const timer = window.setTimeout(onComplete, duration);
    return () => window.clearTimeout(timer);
  }, [show, onComplete, reduceMotion]);

  if (!show || reduceMotion) return null;

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center overflow-hidden rounded-md"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        initial={{ y: -40, scale: 0.8, opacity: 0 }}
        animate={{
          y: [-40, 2, 0],
          scale: [0.8, 1.08, 1],
          opacity: [0, 1, 1],
        }}
        transition={{ duration: 0.75, ease: [0.34, 1.56, 0.64, 1] }}
      >
        <CategorySeal
          categoryId={categoryId as QuestCategory}
          state="earned"
          slotIndex={1}
          size={ssStampSize.animation}
        />
      </motion.div>
    </motion.div>
  );
}
