import { useRef, useState, useCallback, useEffect } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button.tsx";
import { Play, CheckCircle2, Users } from "lucide-react";

type Team = {
  teamName: string;
  players: string[];
};

// Vibrant color palette for wheel segments
const SEGMENT_COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#10b981", // emerald
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#84cc16", // lime
  "#6366f1", // indigo
  "#14b8a6", // teal
  "#e11d48", // rose
];

function getContrastColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "#1a1a2e" : "#ffffff";
}

export default function SpinWheel({
  teams,
  onGameComplete,
  isAdmin,
  disabled = false,
  nextGameNumber,
}: {
  teams: Team[];
  onGameComplete?: (orderedIndices: number[]) => void;
  isAdmin: boolean;
  disabled?: boolean;
  nextGameNumber?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isSpinning, setIsSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const animationRef = useRef<number | null>(null);

  // Track which team indices remain on the wheel for the current game
  const [remainingIndices, setRemainingIndices] = useState<number[]>(() =>
    teams.map((_, i) => i)
  );
  // Track the order teams are picked off the wheel
  const [pickedOrder, setPickedOrder] = useState<number[]>([]);
  // The most recently picked team (for display)
  const [lastPicked, setLastPicked] = useState<{ name: string; index: number } | null>(null);

  // Reset wheel when teams change or game advances (disabled flips)
  useEffect(() => {
    if (remainingIndices.length === 0 && !disabled) {
      // Game was completed and we moved to next game - reset
      setRemainingIndices(teams.map((_, i) => i));
      setPickedOrder([]);
      setLastPicked(null);
    }
  }, [disabled, teams, remainingIndices.length]);

  // Reset if teams array changes length (new event loaded)
  useEffect(() => {
    setRemainingIndices(teams.map((_, i) => i));
    setPickedOrder([]);
    setLastPicked(null);
    setRotation(0);
  }, [teams.length]);

  const remainingTeams = remainingIndices.map((i) => teams[i]);
  const segmentAngle = remainingTeams.length > 0 ? 360 / remainingTeams.length : 360;

  // Draw the wheel on canvas
  const drawWheel = useCallback(
    (currentRotation: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const size = canvas.width;
      const center = size / 2;
      const radius = center - 8;

      ctx.clearRect(0, 0, size, size);

      if (remainingTeams.length === 0) {
        // Draw completed state
        ctx.beginPath();
        ctx.arc(center, center, radius, 0, Math.PI * 2);
        ctx.fillStyle = "#1a1a2e";
        ctx.fill();
        ctx.font = "bold 20px system-ui, -apple-system, sans-serif";
        ctx.fillStyle = "#10b981";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("Game Complete!", center, center);
        return;
      }

      // Draw segments
      remainingTeams.forEach((team, i) => {
        const startAngle =
          ((i * segmentAngle + currentRotation - 90) * Math.PI) / 180;
        const endAngle =
          (((i + 1) * segmentAngle + currentRotation - 90) * Math.PI) / 180;

        // Segment fill
        ctx.beginPath();
        ctx.moveTo(center, center);
        ctx.arc(center, center, radius, startAngle, endAngle);
        ctx.closePath();
        // Use the original team index for consistent colors
        const originalIndex = remainingIndices[i];
        const color = SEGMENT_COLORS[originalIndex % SEGMENT_COLORS.length];
        ctx.fillStyle = disabled ? `${color}80` : color;
        ctx.fill();

        // Segment border
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = 2;
        ctx.stroke();

        // Team name text - radial orientation, always readable
        const midAngle = (startAngle + endAngle) / 2;
        const textRadius = radius * 0.65;
        const textX = center + Math.cos(midAngle) * textRadius;
        const textY = center + Math.sin(midAngle) * textRadius;

        ctx.save();
        ctx.translate(textX, textY);

        // Rotate text along the radial direction (pointing outward from center)
        // Then flip if in left half to keep text readable
        if (midAngle > Math.PI / 2 && midAngle < (3 * Math.PI) / 2) {
          ctx.rotate(midAngle + Math.PI);
        } else {
          ctx.rotate(midAngle);
        }

        const fontSize = Math.max(10, Math.min(14, 280 / remainingTeams.length));
        ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
        ctx.fillStyle = disabled ? "rgba(255,255,255,0.5)" : getContrastColor(color);
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Truncate long names
        const maxLen = remainingTeams.length > 8 ? 8 : 12;
        const displayName =
          team.teamName.length > maxLen
            ? team.teamName.slice(0, maxLen) + "..."
            : team.teamName;
        ctx.fillText(displayName, 0, 0);
        ctx.restore();
      });

      // Center circle
      ctx.beginPath();
      ctx.arc(center, center, radius * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = "#1a1a2e";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 3;
      ctx.stroke();
    },
    [remainingTeams, remainingIndices, segmentAngle, disabled]
  );

  // Redraw on mount and when rotation changes
  useEffect(() => {
    drawWheel(rotation);
  }, [drawWheel, rotation]);

  const handleSpin = async () => {
    if (isSpinning || remainingTeams.length < 1 || disabled) return;
    setIsSpinning(true);
    setLastPicked(null);

    // Random target: 3-5 full rotations + random final position
    const extraRotations = 3 + Math.random() * 2;
    const randomAngle = Math.random() * 360;
    const totalSpin = extraRotations * 360 + randomAngle;
    const finalRotation = (rotation + totalSpin) % 360;

    // Animate with easing
    const startRotation = rotation;
    const duration = 4000; // 4 seconds
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Cubic ease-out for satisfying deceleration
      const eased = 1 - Math.pow(1 - progress, 3);
      const currentAngle = startRotation + totalSpin * eased;

      setRotation(currentAngle % 360);
      drawWheel(currentAngle % 360);

      if (progress < 1) {
        animationRef.current = requestAnimationFrame(animate);
      } else {
        setRotation(finalRotation);
        setIsSpinning(false);

        // Calculate which team the pointer points to (top = 0 degrees)
        const normalizedAngle = ((360 - finalRotation) % 360 + 360) % 360;
        const selectedLocalIndex =
          Math.floor(normalizedAngle / segmentAngle) % remainingTeams.length;

        // Map back to original team index
        const originalIndex = remainingIndices[selectedLocalIndex];
        const teamName = teams[originalIndex].teamName;

        setLastPicked({ name: teamName, index: originalIndex });

        // Remove from remaining
        const newRemaining = remainingIndices.filter((_, i) => i !== selectedLocalIndex);
        const newPicked = [...pickedOrder, originalIndex];
        setRemainingIndices(newRemaining);
        setPickedOrder(newPicked);

        // If all teams have been picked, the game is complete
        if (newRemaining.length === 0) {
          onGameComplete?.(newPicked);
        }
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  };

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  const teamsPickedCount = pickedOrder.length;
  const totalTeamCount = teams.length;
  const gameComplete = remainingIndices.length === 0 && pickedOrder.length > 0;

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Progress indicator */}
      {!disabled && !gameComplete && teamsPickedCount > 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>
            {teamsPickedCount} of {totalTeamCount} teams picked
          </span>
        </div>
      )}

      <div className="relative">
        {/* Pointer triangle at top */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1 z-10">
          <div
            className="w-0 h-0"
            style={{
              borderLeft: "12px solid transparent",
              borderRight: "12px solid transparent",
              borderTop: "20px solid #1a1a2e",
            }}
          />
        </div>

        {/* Wheel canvas */}
        <div className={`rounded-full shadow-xl border-4 border-foreground/10 ${disabled ? "opacity-60" : ""}`}>
          <canvas
            ref={canvasRef}
            width={400}
            height={400}
            className="w-[320px] h-[320px] sm:w-[400px] sm:h-[400px]"
          />
        </div>
      </div>

      {/* Last picked team display */}
      {lastPicked && !isSpinning && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="rounded-lg bg-primary/10 border border-primary/30 px-6 py-3 text-center"
        >
          <p className="text-sm text-muted-foreground">
            {gameComplete ? "Last team picked!" : `Team ${teamsPickedCount} of ${totalTeamCount}`}
          </p>
          <p className="text-xl font-bold text-primary">{lastPicked.name}</p>
        </motion.div>
      )}

      {/* Game complete indicator */}
      {gameComplete && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400 font-medium"
        >
          <CheckCircle2 className="h-5 w-5" />
          <span>{nextGameNumber ? `Game ${nextGameNumber - 1} pairings generated!` : "Pairings generated!"}</span>
        </motion.div>
      )}

      {/* Spin button */}
      {isAdmin && (
        disabled ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <span>All games generated</span>
          </div>
        ) : gameComplete ? (
          <Button
            onClick={() => {
              // Reset for next game
              setRemainingIndices(teams.map((_, i) => i));
              setPickedOrder([]);
              setLastPicked(null);
              setRotation(0);
            }}
            size="lg"
            className="cursor-pointer text-lg px-8"
          >
            <Play className="h-5 w-5 mr-2" />
            {nextGameNumber ? `Start Game ${nextGameNumber}` : "Spin Again"}
          </Button>
        ) : (
          <Button
            onClick={handleSpin}
            disabled={isSpinning || remainingTeams.length < 1}
            size="lg"
            className="cursor-pointer text-lg px-8"
          >
            <Play className="h-5 w-5 mr-2" />
            {isSpinning
              ? "Spinning..."
              : remainingTeams.length === totalTeamCount
                ? nextGameNumber
                  ? `Spin for Game ${nextGameNumber}`
                  : "Spin Wheel"
                : "Spin Next Team"}
          </Button>
        )
      )}

      {/* Picked order display - shows the pairing sequence */}
      {pickedOrder.length > 0 && !disabled && (
        <div className="w-full max-w-sm mt-2">
          <p className="text-xs text-muted-foreground mb-2 text-center">Pick order (paired in sequence):</p>
          <div className="flex flex-wrap gap-1.5 justify-center">
            {pickedOrder.map((idx, pos) => {
              const color = SEGMENT_COLORS[idx % SEGMENT_COLORS.length];
              const isPairStart = pos % 2 === 0;
              return (
                <span
                  key={`${idx}-${pos}`}
                  className={`text-xs px-2 py-1 rounded font-medium ${isPairStart && pos < pickedOrder.length - 1 ? "border-r-2 border-r-foreground/20" : ""}`}
                  style={{ backgroundColor: `${color}30`, color }}
                >
                  {teams[idx].teamName}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
