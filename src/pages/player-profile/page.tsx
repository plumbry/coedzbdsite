import { useParams, Link } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import { Button } from "@/components/ui/button.tsx";
import { ArrowLeft, Lock } from "lucide-react";
import SiteHeader from "@/components/site-header.tsx";
import PlayerProfileContent from "./_components/player-profile-content.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { useUserRole } from "@/hooks/use-user-role.ts";

export default function PlayerProfile() {
  const { username } = useParams<{ username: string }>();
  const { isModeratorOrAdmin, isLoading: roleLoading } = useUserRole();
  const player = useQuery(api.players.getPlayerByUsername, username ? { username } : "skip");
  
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <Link to="/">
          <Button variant="secondary" size="sm" className="mb-6">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Players
          </Button>
        </Link>

        {roleLoading && (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}

        {!roleLoading && !isModeratorOrAdmin && (
          <div className="text-center py-12">
            <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold">Staff Only</h2>
            <p className="text-muted-foreground mt-2">
              Player stats are only visible to staff members. Please sign in with a staff account to view this page.
            </p>
            <Link to="/">
              <Button variant="secondary" size="sm" className="mt-6">
                Back to Members
              </Button>
            </Link>
          </div>
        )}
        
        {!roleLoading && isModeratorOrAdmin && (
          <>
            {player === undefined && (
              <div className="space-y-4">
                <Skeleton className="h-32 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            )}
            
            {player === null && (
              <div className="text-center py-12">
                <h2 className="text-2xl font-bold">Player not found</h2>
                <p className="text-muted-foreground mt-2">The player you're looking for doesn't exist.</p>
              </div>
            )}
            
            {player && (
              <PlayerProfileContent playerId={player._id} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
