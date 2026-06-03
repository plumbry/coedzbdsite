import { useParams, Link } from "react-router-dom";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { Lock } from "lucide-react";
import PageShell from "@/components/page-shell.tsx";
import PageHeader from "@/components/page-header.tsx";
import PlayerProfileContent from "./_components/player-profile-content.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { useUserRole } from "@/hooks/use-user-role.ts";

export default function PlayerProfile() {
  const { username: rawUsername } = useParams<{ username: string }>();
  const username = rawUsername
    ? decodeURIComponent(rawUsername).trim()
    : undefined;
  const { isAuthenticated } = useConvexAuth();
  const { isAdmin, isLoading: roleLoading } = useUserRole();
  const canLoadProfile = isAuthenticated && isAdmin && !!username;
  const player = useQuery(
    api.players.getPlayerByUsername,
    canLoadProfile ? { username } : "skip",
  );
  
  return (
    <PageShell>
      <PageHeader
        title={player?.discordUsername ?? username ?? "Player Profile"}
        back={{ label: "Back to Members", href: "/" }}
        variant="compact"
      />

      {roleLoading && (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      )}

      {!roleLoading && !isAdmin && (
        <div className="text-center py-8">
          <Lock className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <h2 className="text-lg font-semibold">Administrators Only</h2>
          <p className="text-sm text-muted-foreground mt-2">
            Player stats profiles are only visible to administrators.
          </p>
          <Link to="/">
            <Button variant="secondary" size="sm" className="mt-4">
              Back to Members
            </Button>
          </Link>
        </div>
      )}
      
      {!roleLoading && isAdmin && (
        <>
          {player === undefined && (
            <div className="space-y-4">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          )}
          
          {player === null && (
            <div className="text-center py-8">
              <h2 className="text-lg font-semibold">Player not found</h2>
              <p className="text-sm text-muted-foreground mt-2">The player you're looking for doesn't exist.</p>
            </div>
          )}
          
          {player && (
            <PlayerProfileContent playerId={player._id} />
          )}
        </>
      )}
    </PageShell>
  );
}
