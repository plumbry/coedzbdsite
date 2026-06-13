import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import type { ScrimSeriesLeaderboardEntry } from "@/components/scrim-series-leaderboard-table.tsx";
import { downloadScrimSeriesLeaderboardImage } from "@/lib/scrim-series-leaderboard-export.ts";
import ScrimSeriesLeaderboardImageExport from "@/components/scrim-series-leaderboard-image-export.tsx";

const EXPORT_LIMITS = [50, 75] as const;
export type ScrimSeriesLeaderboardExportLimit = (typeof EXPORT_LIMITS)[number];

type ImageExportRequest = {
  entries: ScrimSeriesLeaderboardEntry[];
  playerLimit: ScrimSeriesLeaderboardExportLimit;
};

export default function ScrimSeriesLeaderboardExportButton({
  seriesName,
  bestN,
  participationThreshold,
  penaltyAmount,
  totalGames,
  entries,
  disabled,
  size = "sm",
  variant = "outline",
}: {
  seriesName: string;
  bestN: number;
  participationThreshold: number;
  penaltyAmount: number;
  totalGames: number;
  entries: ScrimSeriesLeaderboardEntry[];
  disabled?: boolean;
  size?: "sm" | "default";
  variant?: "outline" | "ghost";
}) {
  const [isExporting, setIsExporting] = useState(false);
  const [imageExport, setImageExport] = useState<ImageExportRequest | null>(null);
  const imageCaptureRef = useRef<HTMLDivElement>(null);

  const handleExportImage = (playerLimit: ScrimSeriesLeaderboardExportLimit) => {
    if (entries.length === 0) {
      toast.error("No players to export");
      return;
    }
    setIsExporting(true);
    setImageExport({
      entries: entries.slice(0, playerLimit),
      playerLimit,
    });
  };

  useEffect(() => {
    if (!imageExport) return;

    let cancelled = false;
    void (async () => {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      if (cancelled || !imageCaptureRef.current) return;

      try {
        await downloadScrimSeriesLeaderboardImage(
          imageCaptureRef.current,
          seriesName,
          imageExport.playerLimit,
        );
        toast.success(`Top ${imageExport.playerLimit} image downloaded`);
      } catch {
        toast.error("Could not export image");
      } finally {
        if (!cancelled) {
          setImageExport(null);
          setIsExporting(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [imageExport, seriesName]);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={variant}
            size={size}
            disabled={disabled || isExporting || entries.length === 0}
            className="gap-2 cursor-pointer"
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Download image
                <ChevronDown className="h-3.5 w-3.5 opacity-60" />
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {EXPORT_LIMITS.map((limit) => (
            <DropdownMenuItem
              key={limit}
              disabled={isExporting}
              onClick={() => handleExportImage(limit)}
            >
              Top {limit}
              <span className="ml-auto text-xs text-muted-foreground">
                {Math.min(entries.length, limit)} players
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {imageExport && (
        <div className="pointer-events-none fixed top-0 -left-[12000px]">
          <ScrimSeriesLeaderboardImageExport
            ref={imageCaptureRef}
            seriesName={seriesName}
            bestN={bestN}
            participationThreshold={participationThreshold}
            penaltyAmount={penaltyAmount}
            totalGames={totalGames}
            entries={imageExport.entries}
            playerLimit={imageExport.playerLimit}
          />
        </div>
      )}
    </>
  );
}
