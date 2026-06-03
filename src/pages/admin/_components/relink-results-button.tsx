import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function RelinkResultsButton() {
  const relinkResults = useMutation(api.thirdParty.relinkResults.relinkThirdPartyResults);
  const [isRelinking, setIsRelinking] = useState(false);
  const [progress, setProgress] = useState<string>("");

  const handleRelink = async () => {
    if (!confirm(
      "Relink all tournament results (Yunite imports and third-party CSV) to current players?\n\n" +
      "This will:\n" +
      "• Match results to players using Discord IDs\n" +
      "• Update player stats on profile pages\n" +
      "• Process in batches (may take 30-60 seconds)\n\n" +
      "Continue?"
    )) {
      return;
    }

    setIsRelinking(true);
    setProgress("Starting...");
    
    try {
      let offset = 0;
      let totalRelinked = 0;
      let totalUnchanged = 0;
      let totalUnlinked = 0;
      let totalNotFound = 0;
      let hasMore = true;
      
      while (hasMore) {
        const result = await relinkResults({ offset, batchSize: 100 });
        
        totalRelinked += result.relinked;
        totalUnchanged += result.unchanged;
        totalUnlinked += result.unlinked;
        totalNotFound += result.notFound;
        
        setProgress(`Processing ${offset + result.processed} of ${result.total}...`);
        
        hasMore = result.hasMore;
        offset = result.nextOffset;
      }
      
      setProgress("");
      toast.success(
        `Successfully relinked results!`,
        {
          description: `${totalRelinked} relinked, ${totalUnchanged} already linked, ${totalUnlinked} unlinked, ${totalNotFound} not found`,
          duration: 5000
        }
      );
    } catch (error) {
      console.error("Failed to relink results:", error);
      setProgress("");
      toast.error(
        "Failed to relink results",
        {
          description: error instanceof Error ? error.message : "Unknown error"
        }
      );
    } finally {
      setIsRelinking(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button
        size="sm"
        onClick={handleRelink}
        disabled={isRelinking}
      >
        <RefreshCw className={`mr-2 h-4 w-4 ${isRelinking ? "animate-spin" : ""}`} />
        {isRelinking ? "Relinking..." : "Relink Results"}
      </Button>
      {progress && (
        <p className="text-xs text-muted-foreground">{progress}</p>
      )}
    </div>
  );
}
