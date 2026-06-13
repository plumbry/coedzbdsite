import { useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import type { ScrimSeriesLeaderboardEntry } from "@/components/scrim-series-leaderboard-table.tsx";
import { downloadScrimSeriesLeaderboardImage } from "@/lib/scrim-series-leaderboard-export.ts";
import ScrimSeriesLeaderboardImageExport from "@/components/scrim-series-leaderboard-image-export.tsx";

type ImageExportRequest = {
  entries: ScrimSeriesLeaderboardEntry[];
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

  const handleExportImage = () => {
    if (entries.length === 0) {
      toast.error("No players to export");
      return;
    }
    setIsExporting(true);
    setImageExport({ entries });
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
        await downloadScrimSeriesLeaderboardImage(imageCaptureRef.current, seriesName);
        toast.success("Image downloaded");
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
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={handleExportImage}
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
          </>
        )}
      </Button>

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
          />
        </div>
      )}
    </>
  );
}
