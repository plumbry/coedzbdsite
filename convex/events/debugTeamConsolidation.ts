import { v } from "convex/values";
import { query } from "../_generated/server";

// Debug query to see how teams are being grouped
export const debugTeamConsolidation = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    // Get all imports for this event
    const imports = await ctx.db
      .query("thirdPartyImports")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    
    const debug: Array<{
      importName: string;
      teams: Array<{
        teamKey: string;
        teamId: string | null;
        teamName: string | null;
        memberCount: number;
        members: string[];
        points: number;
        placement: number;
      }>;
    }> = [];
    
    for (const imp of imports) {
      const results = await ctx.db
        .query("thirdPartyResults")
        .withIndex("by_import", (q) => q.eq("importId", imp._id))
        .collect();
      
      // Group by teamId
      const teamMap = new Map<string, typeof results>();
      
      for (const result of results) {
        if (result.teamId) {
          if (!teamMap.has(result.teamId)) {
            teamMap.set(result.teamId, []);
          }
          teamMap.get(result.teamId)!.push(result);
        }
      }
      
      // For results without teamId, group by teamName or placement+points
      const placementKey = (r: typeof results[0]) => {
        if (r.teamName) {
          return `team_${r.teamName}`;
        }
        return `solo_${r.epicUsername}_${r.placement}_${r.points}`;
      };
      
      const noTeamIdMap = new Map<string, typeof results>();
      for (const result of results) {
        if (!result.teamId) {
          const key = placementKey(result);
          if (!noTeamIdMap.has(key)) {
            noTeamIdMap.set(key, []);
          }
          noTeamIdMap.get(key)!.push(result);
        }
      }
      
      const teams = [];
      
      // Process teams with teamId
      for (const [teamId, members] of teamMap.entries()) {
        teams.push({
          teamKey: teamId,
          teamId,
          teamName: members[0].teamName || null,
          memberCount: members.length,
          members: members.map(m => m.epicUsername),
          points: members[0].points,
          placement: members[0].placement,
        });
      }
      
      // Process teams without teamId
      for (const [key, members] of noTeamIdMap.entries()) {
        teams.push({
          teamKey: key,
          teamId: null,
          teamName: members[0].teamName || null,
          memberCount: members.length,
          members: members.map(m => m.epicUsername),
          points: members[0].points,
          placement: members[0].placement,
        });
      }
      
      debug.push({
        importName: imp.eventName,
        teams,
      });
    }
    
    return debug;
  },
});
