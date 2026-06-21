import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils.ts";

const CONFETTI_COLORS = ["#f97316", "#14b8a6", "#fbbf24", "#ec4899", "#3b82f6"];

function ConfettiBurst({ active }: { active: boolean }) {
  const reduceMotion = useReducedMotion();
  const [particles] = useState(() =>
    Array.from({ length: 12 }, (_, i) => ({
      id: i,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]!,
      angle: (i / 12) * 360,
      distance: 28 + (i % 4) * 8,
      size: 4 + (i % 3),
    })),
  );

  if (!active || reduceMotion) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-visible" aria-hidden>
      {particles.map((p) => {
        const rad = (p.angle * Math.PI) / 180;
        const x = Math.cos(rad) * p.distance;
        const y = Math.sin(rad) * p.distance;
        return (
          <motion.span
            key={p.id}
            className="absolute left-1/2 top-1/2 rounded-full"
            style={{
              width: p.size,
              height: p.size,
              backgroundColor: p.color,
              marginLeft: -p.size / 2,
              marginTop: -p.size / 2,
            }}
            initial={{ opacity: 1, scale: 0, x: 0, y: 0 }}
            animate={{ opacity: [1, 1, 0], scale: [0, 1.2, 0.6], x, y }}
            transition={{ duration: 0.65, ease: "easeOut" }}
          />
        );
      })}
    </div>
  );
}

/** Brief ink-stamp impact + confetti when a stamp is newly earned. */
export function PassportStampCelebration({
  active,
  className,
}: {
  active: boolean;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [showInk, setShowInk] = useState(false);

  useEffect(() => {
    if (!active) {
      setShowInk(false);
      return;
    }
    setShowInk(true);
    const timer = window.setTimeout(() => setShowInk(false), 700);
    return () => window.clearTimeout(timer);
  }, [active]);

  if (!active || reduceMotion) return null;

  return (
    <div className={cn("pointer-events-none absolute inset-0 z-20", className)} aria-hidden>
      <ConfettiBurst active={active} />
      {showInk ? (
        <motion.div
          className="absolute inset-0 flex items-center justify-center"
          initial={{ opacity: 0, scale: 1.4, rotate: -8 }}
          animate={{ opacity: [0, 0.35, 0], scale: [1.4, 1, 1.05] }}
          transition={{ duration: 0.55, ease: "easeOut" }}
        >
          <div className="h-16 w-16 rounded-full border-4 border-dashed border-teal-600/50" />
        </motion.div>
      ) : null}
    </div>
  );
}
