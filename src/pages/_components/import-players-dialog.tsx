import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Label } from "@/components/ui/label.tsx";
import { toast } from "sonner";
import { Upload, AlertCircle, CheckCircle } from "lucide-react";

interface ImportPlayersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface PlayerData {
  discordUsername: string;
  nickname?: string;
  discordUserId?: string;
  serverJoinDate?: string;
  epicUsername: string;
  twitterUsername?: string;
  twitchUsername?: string;
  youtubeUsername?: string;
  adminComments?: string;
  // Evaluation scores (0-100 each)
  thirdPartyExperience?: number;
  thirdPartyPerformance?: number;
  inGameTourneyPerformance?: number;
  officialEarnings?: number;
  rankedPerformance?: number;
  hoursPlayed?: number;
  notorietyTeammates?: number;
  age?: number;
  gender?: number;
  ability?: number;
  region?: number;
  gameSense?: number;
  seasonPerformance?: number;
  modifiers?: number;
}

export default function ImportPlayersDialog({ open, onOpenChange }: ImportPlayersDialogProps) {
  const bulkCreatePlayers = useMutation(api.players.bulkCreatePlayers);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewData, setPreviewData] = useState<PlayerData[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [useDiscordAsEpic, setUseDiscordAsEpic] = useState(false);
  const [archiveOnImport, setArchiveOnImport] = useState(false);
  const [markForReview, setMarkForReview] = useState(false);
  const [updateScoresOnly, setUpdateScoresOnly] = useState(false);

  const parseCSV = (csvText: string, useSameUsername: boolean): PlayerData[] => {
    const lines = csvText.split("\n").filter(line => line.trim());
    if (lines.length < 2) {
      throw new Error("CSV file must contain a header row and at least one data row");
    }

    const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
    const players: PlayerData[] = [];
    const parseErrors: string[] = [];

    // Expected headers (case-insensitive)
    const headerMap: Record<string, string> = {
      "discord username": "discordUsername",
      "discordusername": "discordUsername",
      "nickname": "nickname",
      "discord user id": "discordUserId",
      "discorduserid": "discordUserId",
      "discord id": "discordUserId",
      "discordid": "discordUserId",
      "server join date": "serverJoinDate",
      "serverjoindate": "serverJoinDate",
      "join date": "serverJoinDate",
      "joindate": "serverJoinDate",
      "epic username": "epicUsername",
      "epicusername": "epicUsername",
      "fortnite username": "epicUsername",
      "twitter username": "twitterUsername",
      "twitterusername": "twitterUsername",
      "twitter": "twitterUsername",
      "twitch username": "twitchUsername",
      "twitchusername": "twitchUsername",
      "twitch": "twitchUsername",
      "youtube username": "youtubeUsername",
      "youtubeusername": "youtubeUsername",
      "youtube": "youtubeUsername",
      "admin comments": "adminComments",
      "admincomments": "adminComments",
      "comments": "adminComments",
      "notes": "adminComments",
      // Evaluation score categories
      "3rd party experience": "thirdPartyExperience",
      "third party experience": "thirdPartyExperience",
      "thirdpartyexperience": "thirdPartyExperience",
      "3rd party performance": "thirdPartyPerformance",
      "third party performance": "thirdPartyPerformance",
      "thirdpartyperformance": "thirdPartyPerformance",
      "in-game tourney performance": "inGameTourneyPerformance",
      "in game tourney performance": "inGameTourneyPerformance",
      "ingametourneyperformance": "inGameTourneyPerformance",
      "tourney performance": "inGameTourneyPerformance",
      "ig tourneys": "inGameTourneyPerformance",
      "igtourneys": "inGameTourneyPerformance",
      "official earnings": "officialEarnings",
      "officialearnings": "officialEarnings",
      "earnings": "officialEarnings",
      "ranked performance": "rankedPerformance",
      "rankedperformance": "rankedPerformance",
      "ranked": "rankedPerformance",
      "hours played": "hoursPlayed",
      "hoursplayed": "hoursPlayed",
      "hours": "hoursPlayed",
      "notoriety/teammates": "notorietyTeammates",
      "notoriety teammates": "notorietyTeammates",
      "notorietyteammates": "notorietyTeammates",
      "notoriety": "notorietyTeammates",
      "teammates/fg": "notorietyTeammates",
      "teammates": "notorietyTeammates",
      "age": "age",
      "gender": "gender",
      "ability": "ability",
      "region": "region",
      "game sense": "gameSense",
      "gamesense": "gameSense",
      "szn perf": "seasonPerformance",
      "sznperf": "seasonPerformance",
      "season perf": "seasonPerformance",
      "season performance": "seasonPerformance",
      "modifiers": "modifiers",
      "modifier": "modifiers",
    };

    // Map headers to field names
    const fieldMapping = headers.map(header => 
      headerMap[header.toLowerCase()] || header
    );

    // Process data rows
    for (let i = 1; i < lines.length; i++) {
      try {
        const values = lines[i].split(",").map(v => v.trim().replace(/^"|"$/g, ""));
        const player: Record<string, string> = {};

        fieldMapping.forEach((field, index) => {
          if (values[index]) {
            player[field] = values[index];
          }
        });

        // Validate required fields
        if (!player.discordUsername) {
          parseErrors.push(`Row ${i + 1}: Missing Discord Username`);
          continue;
        }
        
        // Use Discord username as Epic username if option is enabled and Epic username is missing
        if (!player.epicUsername) {
          if (useSameUsername) {
            player.epicUsername = player.discordUsername;
          } else {
            parseErrors.push(`Row ${i + 1}: Missing Epic Username`);
            continue;
          }
        }
        
        // Use placeholder date if server join date is missing (will be updated by Discord sync later)
        if (!player.serverJoinDate) {
          player.serverJoinDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
        }

        // Parse numeric score fields
        const parseScore = (value: string | undefined): number | undefined => {
          if (!value || value.trim() === "") return undefined;
          const num = parseFloat(value);
          return isNaN(num) ? undefined : Math.max(0, Math.min(100, num)); // Clamp 0-100
        };

        players.push({
          discordUsername: player.discordUsername,
          nickname: player.nickname || undefined,
          discordUserId: player.discordUserId || undefined,
          serverJoinDate: player.serverJoinDate,
          epicUsername: player.epicUsername,
          twitterUsername: player.twitterUsername || undefined,
          twitchUsername: player.twitchUsername || undefined,
          youtubeUsername: player.youtubeUsername || undefined,
          adminComments: player.adminComments || undefined,
          // Parse evaluation scores
          thirdPartyExperience: parseScore(player.thirdPartyExperience),
          thirdPartyPerformance: parseScore(player.thirdPartyPerformance),
          inGameTourneyPerformance: parseScore(player.inGameTourneyPerformance),
          officialEarnings: parseScore(player.officialEarnings),
          rankedPerformance: parseScore(player.rankedPerformance),
          hoursPlayed: parseScore(player.hoursPlayed),
          notorietyTeammates: parseScore(player.notorietyTeammates),
          age: parseScore(player.age),
          gender: parseScore(player.gender),
          ability: parseScore(player.ability),
          region: parseScore(player.region),
          gameSense: parseScore(player.gameSense),
          seasonPerformance: parseScore(player.seasonPerformance),
          modifiers: parseScore(player.modifiers),
        });
      } catch (error) {
        parseErrors.push(`Row ${i + 1}: Error parsing data - ${error}`);
      }
    }

    setErrors(parseErrors);
    return players;
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      toast.error("Please upload a CSV file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csvText = e.target?.result as string;
        const players = parseCSV(csvText, useDiscordAsEpic);
        setPreviewData(players);
        
        if (players.length === 0) {
          toast.error("No valid players found in CSV");
        } else {
          toast.success(`Loaded ${players.length} players from CSV`);
        }
      } catch (error) {
        toast.error(`Failed to parse CSV: ${error}`);
        setPreviewData([]);
      }
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (previewData.length === 0) {
      toast.error("No players to import");
      return;
    }

    setIsProcessing(true);
    try {
      const result = await bulkCreatePlayers({ 
        players: previewData,
        updateExisting: updateExisting,
        archiveOnImport: archiveOnImport,
        markForReview: markForReview,
        updateScoresOnly: updateScoresOnly
      });
      
      const messages: string[] = [];
      if (result.successCount > 0) {
        messages.push(`${result.successCount} players imported`);
      }
      if (result.updatedCount > 0) {
        messages.push(`${result.updatedCount} updated`);
      }
      
      toast.success(messages.join(", "));
      
      if (result.failureCount > 0) {
        toast.warning(`${result.failureCount} players skipped (duplicates or errors)`);
      }
      
      setPreviewData([]);
      setErrors([]);
      setUpdateExisting(false);
      setUseDiscordAsEpic(false);
      setArchiveOnImport(false);
      setMarkForReview(false);
      setUpdateScoresOnly(false);
      onOpenChange(false);
    } catch (error) {
      toast.error("Failed to import players");
      console.error(error);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleClose = () => {
    if (!isProcessing) {
      setPreviewData([]);
      setErrors([]);
      setUpdateExisting(false);
      setUseDiscordAsEpic(false);
      setArchiveOnImport(false);
      setMarkForReview(false);
      setUpdateScoresOnly(false);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Import Players from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file exported from your Google Sheet with player data
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
        <div className="space-y-6">
          {/* Instructions */}
          <div className="bg-muted p-4 rounded-lg space-y-2 text-sm">
            <h3 className="font-semibold">CSV Format Requirements:</h3>
            <p>Your CSV must include these columns (header names are flexible):</p>
            
            <div className="space-y-2">
              <div>
                <strong className="text-foreground">Required Columns:</strong>
                <ul className="list-disc list-inside ml-2 text-muted-foreground">
                  <li><strong>Discord Username</strong></li>
                  <li><strong>Epic Username</strong> (or use checkbox to auto-fill with Discord username)</li>
                </ul>
              </div>
              
              <div>
                <strong className="text-foreground">Optional Player Info:</strong>
                <ul className="list-disc list-inside ml-2 text-muted-foreground">
                  <li><strong>Server Join Date</strong> or <strong>Join Date</strong> (uses current date if missing)</li>
                  <li><strong>Discord User ID</strong> or <strong>Discord ID</strong> (placeholder created if missing)</li>
                  <li><strong>Nickname</strong></li>
                  <li><strong>Admin Comments</strong>, <strong>Comments</strong>, or <strong>Notes</strong></li>
                </ul>
              </div>
              
              <div>
                <strong className="text-foreground">Optional Evaluation Scores (0-100 each):</strong>
                <ul className="list-disc list-inside ml-2 text-muted-foreground">
                  <li>3rd Party Experience, 3rd Party Performance</li>
                  <li>In-Game Tourney Performance, Official Earnings</li>
                  <li>Ranked Performance, Hours Played</li>
                  <li>Notoriety/Teammates, Age, Gender</li>
                  <li>Ability, Region, Game Sense</li>
                  <li>Season Performance, Modifiers</li>
                </ul>
              </div>
            </div>
            
            <p className="text-xs text-muted-foreground mt-2">
              Players are matched by Epic or Discord username. Use "Update existing players" to refresh data. Evaluation scores will be imported and tier calculated automatically. Missing dates/IDs will use placeholders and can be updated later by Discord bot sync.
            </p>
          </div>

          {/* File Upload */}
          <div className="space-y-4">
            <label htmlFor="csv-upload" className="cursor-pointer">
              <div className="border-2 border-dashed rounded-lg p-8 text-center hover:bg-muted/50 transition-colors">
                <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <div className="text-sm">
                  <span className="font-semibold text-primary">Click to upload</span> or drag and drop
                </div>
                <div className="text-xs text-muted-foreground mt-1">CSV files only</div>
              </div>
              <input
                id="csv-upload"
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
                disabled={isProcessing}
              />
            </label>
            
            {/* Import Options */}
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="use-discord-as-epic"
                  checked={useDiscordAsEpic}
                  onCheckedChange={(checked) => setUseDiscordAsEpic(checked === true)}
                  disabled={isProcessing}
                />
                <Label
                  htmlFor="use-discord-as-epic"
                  className="text-sm font-normal cursor-pointer"
                >
                  Use Discord username as Epic username (when Epic username is missing)
                </Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="update-existing"
                  checked={updateExisting}
                  onCheckedChange={(checked) => {
                    setUpdateExisting(checked === true);
                    // If enabling update existing, disable scores only mode
                    if (checked === true && updateScoresOnly) {
                      setUpdateScoresOnly(false);
                    }
                  }}
                  disabled={isProcessing || updateScoresOnly}
                />
                <Label
                  htmlFor="update-existing"
                  className="text-sm font-normal cursor-pointer"
                >
                  Update existing players (refresh all data for players already in database)
                </Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="update-scores-only"
                  checked={updateScoresOnly}
                  onCheckedChange={(checked) => {
                    setUpdateScoresOnly(checked === true);
                    // If enabling scores only mode, disable full update
                    if (checked === true && updateExisting) {
                      setUpdateExisting(false);
                    }
                  }}
                  disabled={isProcessing || updateExisting}
                />
                <Label
                  htmlFor="update-scores-only"
                  className="text-sm font-normal cursor-pointer"
                >
                  Update evaluation scores only (only update scores for existing players, skip new player creation)
                </Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="archive-on-import"
                  checked={archiveOnImport}
                  onCheckedChange={(checked) => setArchiveOnImport(checked === true)}
                  disabled={isProcessing}
                />
                <Label
                  htmlFor="archive-on-import"
                  className="text-sm font-normal cursor-pointer"
                >
                  Auto-archive players on import (set status to archived)
                </Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="mark-for-review"
                  checked={markForReview}
                  onCheckedChange={(checked) => setMarkForReview(checked === true)}
                  disabled={isProcessing}
                />
                <Label
                  htmlFor="mark-for-review"
                  className="text-sm font-normal cursor-pointer"
                >
                  Mark for review (flag players for info checking)
                </Label>
              </div>
            </div>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-destructive font-semibold">
                <AlertCircle className="h-4 w-4" />
                Parsing Warnings ({errors.length})
              </div>
              <div className="text-sm space-y-1 max-h-32 overflow-y-auto">
                {errors.slice(0, 10).map((error, i) => (
                  <div key={i} className="text-destructive/80">{error}</div>
                ))}
                {errors.length > 10 && (
                  <div className="text-destructive/60">...and {errors.length - 10} more</div>
                )}
              </div>
            </div>
          )}

          {/* Preview */}
          {previewData.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-green-600 font-semibold">
                <CheckCircle className="h-4 w-4" />
                Ready to Import: {previewData.length} players
              </div>
              <div className="bg-muted/50 rounded-lg p-4 max-h-48 overflow-y-auto">
                <div className="text-sm space-y-1">
                  {previewData.slice(0, 5).map((player, i) => (
                    <div key={i} className="flex justify-between py-1 border-b border-border/50">
                      <span className="font-medium">{player.discordUsername}</span>
                      <span className="text-muted-foreground">{player.epicUsername}</span>
                    </div>
                  ))}
                  {previewData.length > 5 && (
                    <div className="text-muted-foreground py-1">
                      ...and {previewData.length - 5} more
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isProcessing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleImport}
              disabled={previewData.length === 0 || isProcessing}
            >
              {isProcessing ? "Importing..." : `Import ${previewData.length} Players`}
            </Button>
          </div>
        </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
