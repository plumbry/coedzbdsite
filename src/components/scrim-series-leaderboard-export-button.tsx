import { useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
import type { ScrimSeriesLeaderboardEntry } from "@/components/scrim-series-leaderboard-table.tsx";
import {
  DEFAULT_SCRIM_SERIES_EXPORT_OPTIONS,
  downloadScrimSeriesLeaderboardImage,
  SCRIM_SERIES_EXPORT_LIMITS,
  type ScrimSeriesLeaderboardExportLimit,
  type ScrimSeriesLeaderboardExportOptions,
} from "@/lib/scrim-series-leaderboard-export.ts";
import ScrimSeriesLeaderboardImageExport from "@/components/scrim-series-leaderboard-image-export.tsx";

type ImageExportRequest = {
  entries: ScrimSeriesLeaderboardEntry[];
  playerLimit: ScrimSeriesLeaderboardExportLimit;
  options: ScrimSeriesLeaderboardExportOptions;
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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [playerLimit, setPlayerLimit] = useState<ScrimSeriesLeaderboardExportLimit>(50);
  const [options, setOptions] = useState<ScrimSeriesLeaderboardExportOptions>(
    DEFAULT_SCRIM_SERIES_EXPORT_OPTIONS,
  );
  const [isExporting, setIsExporting] = useState(false);
  const [imageExport, setImageExport] = useState<ImageExportRequest | null>(null);
  const imageCaptureRef = useRef<HTMLDivElement>(null);

  const setOption = <K extends keyof ScrimSeriesLeaderboardExportOptions>(
    key: K,
    value: ScrimSeriesLeaderboardExportOptions[K],
  ) => {
    setOptions((current) => ({ ...current, [key]: value }));
  };

  const handleExportImage = () => {
    if (entries.length === 0) {
      toast.error("No players to export");
      return;
    }
    setIsExporting(true);
    setImageExport({
      entries: entries.slice(0, playerLimit),
      playerLimit,
      options,
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
        setDialogOpen(false);
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
        onClick={() => setDialogOpen(true)}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Download leaderboard image</DialogTitle>
            <DialogDescription>
              Choose how many players to include and what details appear in the PNG.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Players to include</Label>
              <div className="flex gap-2">
                {SCRIM_SERIES_EXPORT_LIMITS.map((limit) => (
                  <Button
                    key={limit}
                    type="button"
                    size="sm"
                    variant={playerLimit === limit ? "default" : "outline"}
                    onClick={() => setPlayerLimit(limit)}
                    className="flex-1 cursor-pointer"
                  >
                    Top {limit}
                    <span className="ml-1 text-xs opacity-80">
                      ({Math.min(entries.length, limit)})
                    </span>
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-medium">Include in image</Label>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <Checkbox
                  checked={options.showScoringRules}
                  onCheckedChange={(checked) => setOption("showScoringRules", checked === true)}
                />
                Scoring rules (Best {bestN}, participation, penalties)
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <Checkbox
                  checked={options.showPlayerCount}
                  onCheckedChange={(checked) => setOption("showPlayerCount", checked === true)}
                />
                Player count label
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <Checkbox
                  checked={options.showGamesColumn}
                  onCheckedChange={(checked) => {
                    const enabled = checked === true;
                    setOptions((current) => ({
                      ...current,
                      showGamesColumn: enabled,
                      showParticipationPercent: enabled ? current.showParticipationPercent : false,
                    }));
                  }}
                />
                Games played column
              </label>
              <label className="flex items-center gap-2 pl-6 text-sm cursor-pointer select-none">
                <Checkbox
                  checked={options.showParticipationPercent}
                  disabled={!options.showGamesColumn}
                  onCheckedChange={(checked) =>
                    setOption("showParticipationPercent", checked === true)
                  }
                />
                Participation % under games
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <Checkbox
                  checked={options.showPenaltiesColumn}
                  onCheckedChange={(checked) => setOption("showPenaltiesColumn", checked === true)}
                />
                Penalties column
              </label>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={isExporting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleExportImage}
              disabled={isExporting || entries.length === 0}
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
                  Download PNG
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            options={imageExport.options}
          />
        </div>
      )}
    </>
  );
}
