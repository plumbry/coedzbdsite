import { v } from "convex/values";
import { query } from "../_generated/server";

// Count event results for a player
export const countPlayerResults = query({
  args: { playerId: v.id("players") },
  handler: async (ctx, args) => {
    const results = await ctx.db
      .query("eventResults")
      .withIndex("by_player", (q) => q.eq("playerId", args.playerId))
      .collect();
    return results.length;
  },
});

// Get leaderboards grouped by import for an event
export const getEventLeaderboards = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    // Get the event details to check for special rules
    const event = await ctx.db.get(args.eventId);
    
    // Get all imports linked to this event
    const importsUnsorted = await ctx.db
      .query("thirdPartyImports")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    
    if (importsUnsorted.length === 0) {
      return { leaderboards: [], cumulativeLeaderboard: [] };
    }
    
    // Sort by event date to ensure correct chronological order (Week 1, Week 2, etc.)
    // If eventDate is not available, fall back to creation time
    const imports = importsUnsorted.sort((a, b) => {
      if (a.eventDate && b.eventDate) {
        return new Date(a.eventDate).getTime() - new Date(b.eventDate).getTime();
      }
      // Fall back to creation time if event dates are not available
      return a._creationTime - b._creationTime;
    });
    
    // Skip first N weeks of points if configured (all other stats still count)
    const skipWeeksCount = event?.skipFirstNWeeksPoints || 0;
    const importsToSkipForPoints = skipWeeksCount > 0 ? imports.slice(0, skipWeeksCount).map(imp => imp._id) : [];
    
    // Get results for each import separately
    const leaderboards = await Promise.all(
      imports.map(async (imp) => {
        const results = await ctx.db
          .query("thirdPartyResults")
          .withIndex("by_import", (q) => q.eq("importId", imp._id))
          .collect();
        
        // Group by team
        const teamStatsMap = new Map<string, {
          teamId: string;
          teamName: string;
          placement: number;
          totalPoints: number;
          eliminations: number;
          wins: number;
          members: Array<{
            epicUsername: string;
            playerId: string | null;
            playerName: string;
            discordUsername: string | null;
          }>;
        }>();
        
        // First pass: group by teamId if available
        const tempTeamMap = new Map<string, typeof results>();
        for (const result of results) {
          if (result.teamId) {
            if (!tempTeamMap.has(result.teamId)) {
              tempTeamMap.set(result.teamId, []);
            }
            tempTeamMap.get(result.teamId)!.push(result);
          }
        }
        
        // Second pass: for players without teamId, group by duoAssignment, teamName, or placement+points
        const placementKey = (r: typeof results[0]) => {
          // Priority 1: Use duoAssignment for Random events
          if (r.duoAssignment && r.duoAssignment !== null) {
            return `duo_${r.duoAssignment}`;
          }
          // Priority 2: If teamName exists, use it as the grouping key
          if (r.teamName) {
            return `team_${r.teamName}`;
          }
          // Priority 3: Group by placement and points (teammates share the same placement and points)
          return `placement_${r.placement}_points_${r.points}`;
        };
        const placementGroups = new Map<string, typeof results>();
        for (const result of results) {
          if (!result.teamId) {
            const key = placementKey(result);
            if (!placementGroups.has(key)) {
              placementGroups.set(key, []);
            }
            placementGroups.get(key)!.push(result);
          }
        }
        
        // Process all results
        for (const result of results) {
          // Determine team key: use teamId, or generate from placement+points group
          let teamKey: string;
          let teamMembers: typeof results;
          
          if (result.teamId) {
            teamKey = result.teamId;
            teamMembers = tempTeamMap.get(result.teamId) || [result];
          } else {
            const key = placementKey(result);
            teamKey = `team_${key}`;
            teamMembers = placementGroups.get(key) || [result];
          }
          
          // Skip if we've already processed this team
          if (teamStatsMap.has(teamKey)) {
            continue;
          }
          
          const teamDisplayName = result.teamName || result.epicUsername;
          
          // Build members list
          const members = [];
          for (const member of teamMembers) {
            let playerName = member.discordUsername || member.epicUsername;
            let playerId = member.playerId || null;
            let discordUsername: string | null = null;
            let tier: string | null = null;
            
            if (member.playerId) {
              const player = await ctx.db.get(member.playerId);
              if (player) {
                playerName = player.discordUsername;
                discordUsername = player.discordUsername;
                tier = player.tier || null;
              }
            }
            
            members.push({
              epicUsername: member.epicUsername,
              playerId,
              playerName,
              discordUsername,
              tier,
            });
          }
          
          // Sum eliminations across all team members, use first member's other stats
          const totalTeamEliminations = teamMembers.reduce((sum, member) => sum + (member.eliminations || 0), 0);
          
          teamStatsMap.set(teamKey, {
            teamId: result.teamId || teamKey,
            teamName: teamDisplayName,
            placement: result.placement,
            totalPoints: result.points,
            eliminations: totalTeamEliminations,
            wins: result.wins || 0,
            members,
          });
        }
        
        // Convert to array and sort by placement (ascending) then points (descending)
        const formattedResults = Array.from(teamStatsMap.values())
          .sort((a, b) => {
            if (a.placement !== b.placement) {
              return a.placement - b.placement;
            }
            return b.totalPoints - a.totalPoints;
          });
        
        return {
          importId: imp._id,
          leaderboardUrl: imp.leaderboardUrl,
          leaderboardName: imp.eventName,
          eventDate: imp.eventDate || "",
          source: imp.source,
          results: formattedResults,
        };
      })
    );
    
    // Calculate cumulative leaderboard (combine all imports)
    // First, aggregate by team per import to avoid counting points multiple times per team member
    const teamPerImportMap = new Map<string, Map<string, {
      teamId: string;
      teamName: string;
      points: number;
      placement: number;
      eliminations: number;
      members: Array<{
        epicUsername: string;
        playerId: string | null;
        playerName: string;
        discordUsername: string | null;
      }>;
    }>>();
    
    for (const imp of imports) {
      const results = await ctx.db
        .query("thirdPartyResults")
        .withIndex("by_import", (q) => q.eq("importId", imp._id))
        .collect();
      
      const teamsForThisImport = new Map();
      
      // First pass: group by teamId if available
      const tempTeamMap = new Map<string, typeof results>();
      for (const result of results) {
        if (result.teamId) {
          if (!tempTeamMap.has(result.teamId)) {
            tempTeamMap.set(result.teamId, []);
          }
          tempTeamMap.get(result.teamId)!.push(result);
        }
      }
      
      // Second pass: for players without teamId, group by duoAssignment, teamName, or placement+points
      const placementKey = (r: typeof results[0]) => {
        // Priority 1: Use duoAssignment for Random events
        if (r.duoAssignment && r.duoAssignment !== null) {
          return `duo_${r.duoAssignment}`;
        }
        // Priority 2: If teamName exists, use it as the grouping key
        if (r.teamName) {
          return `team_${r.teamName}`;
        }
        // Priority 3: Group by placement and points (teammates share the same placement and points)
        return `placement_${r.placement}_points_${r.points}`;
      };
      const placementGroups = new Map<string, typeof results>();
      for (const result of results) {
        if (!result.teamId) {
          const key = placementKey(result);
          if (!placementGroups.has(key)) {
            placementGroups.set(key, []);
          }
          placementGroups.get(key)!.push(result);
        }
      }
      
      // Process all results
      const processedTeams = new Set<string>();
      for (const result of results) {
        // Determine team key
        let teamKey: string;
        let teamMembers: typeof results;
        
        if (result.teamId) {
          teamKey = result.teamId;
          teamMembers = tempTeamMap.get(result.teamId) || [result];
        } else {
          const key = placementKey(result);
          teamKey = `team_${key}`;
          teamMembers = placementGroups.get(key) || [result];
        }
        
        // Skip if already processed
        if (processedTeams.has(teamKey)) {
          continue;
        }
        processedTeams.add(teamKey);
        
        const teamDisplayName = result.teamName || result.epicUsername;
        
        // Build members list
        const members = [];
        for (const member of teamMembers) {
          let playerName = member.discordUsername || member.epicUsername;
          let playerId = member.playerId || null;
          let discordUsername: string | null = null;
          let tier: string | null = null;
          
          if (member.playerId) {
            const player = await ctx.db.get(member.playerId);
            if (player) {
              playerName = player.discordUsername;
              discordUsername = player.discordUsername;
              tier = player.tier || null;
            }
          }
          
          members.push({
            epicUsername: member.epicUsername,
            playerId,
            playerName,
            discordUsername,
            tier,
          });
        }
        
        // Sum eliminations across all team members
        const totalTeamEliminations = teamMembers.reduce((sum, member) => sum + (member.eliminations || 0), 0);
        
        teamsForThisImport.set(teamKey, {
          teamId: result.teamId || teamKey,
          teamName: teamDisplayName,
          points: result.points,
          placement: result.placement,
          eliminations: totalTeamEliminations,
          members,
        });
      }
      
      teamPerImportMap.set(imp._id, teamsForThisImport);
    }
    
    // Build team consolidation based on player overlap
    // Strategy: Teams with 2+ overlapping players should be consolidated
    // This handles cases where a trio plays together, then 2 play as a duo another week
    // NOTE: This consolidation is ONLY for regular events, not random squads/trios
    
    const isRandomSquadsOrTrios = event?.type === "random-squads" || 
                                   event?.type === "random-trios" || 
                                   event?.type === "solos-meets-duos" ||
                                   event?.type === "scrim-series" ||
                                   event?.type === "showdown" ||
                                   (event?.dynamicPairDetection === true && event?.type === "random");
    
    const teamSignatureMap = new Map<string, string>();
    
    if (!isRandomSquadsOrTrios) {
      // Step 1: Build a list of all team compositions across all imports
      type TeamComposition = {
        importId: string;
        teamKey: string;
        members: Set<string>;
        memberCount: number;
        hasTeamId: boolean;
      };
      
      const allTeamCompositions: TeamComposition[] = [];
      
      for (const [importIdStr, teamsMap] of teamPerImportMap.entries()) {
        for (const [teamKey, teamData] of teamsMap.entries()) {
          allTeamCompositions.push({
            importId: importIdStr,
            teamKey,
            members: new Set(teamData.members.map(m => m.epicUsername)),
            memberCount: teamData.members.length,
            hasTeamId: !!(teamData.teamId && !teamData.teamId.startsWith('team_')),
          });
        }
      }
      
      // Step 2: Build consolidation groups using union-find approach
      const teamKeyToGroupId = new Map<string, number>();
      let nextGroupId = 0;
      
      // Helper: get group ID for a team key
      const getGroupId = (teamKey: string): number => {
        if (!teamKeyToGroupId.has(teamKey)) {
          teamKeyToGroupId.set(teamKey, nextGroupId++);
        }
        return teamKeyToGroupId.get(teamKey)!;
      };
      
      // Helper: merge two groups
      const mergeGroups = (groupId1: number, groupId2: number) => {
        if (groupId1 === groupId2) return;
        // Reassign all teams from groupId2 to groupId1
        for (const [key, gid] of teamKeyToGroupId.entries()) {
          if (gid === groupId2) {
            teamKeyToGroupId.set(key, groupId1);
          }
        }
      };
      
      // Step 3: Group teams that share 2+ players OR solo player in a team
      for (let i = 0; i < allTeamCompositions.length; i++) {
        const team1 = allTeamCompositions[i];
        const group1 = getGroupId(team1.teamKey);
        
        for (let j = i + 1; j < allTeamCompositions.length; j++) {
          const team2 = allTeamCompositions[j];
          
          // Count overlapping players
          let overlapCount = 0;
          for (const player of team1.members) {
            if (team2.members.has(player)) {
              overlapCount++;
            }
          }
          
          // Consolidation rules:
          // 1. If 2+ players overlap between multi-member teams, merge
          // 2. If one is solo and that player appears in the other team, merge
          const shouldMerge = 
            overlapCount >= 2 || // Multi-member teams with 2+ overlap
            (team1.memberCount === 1 && overlapCount >= 1) || // Solo from team1 in team2
            (team2.memberCount === 1 && overlapCount >= 1);   // Solo from team2 in team1
          
          if (shouldMerge) {
            const group2 = getGroupId(team2.teamKey);
            mergeGroups(group1, group2);
          }
        }
      }
      
      // Step 4: Build canonical key mapping
      const groupIdToCanonicalKey = new Map<number, string>();
      
      for (const [teamKey, groupId] of teamKeyToGroupId.entries()) {
        if (!groupIdToCanonicalKey.has(groupId)) {
          // First team in this group becomes the canonical key
          groupIdToCanonicalKey.set(groupId, teamKey);
        }
        teamSignatureMap.set(teamKey, groupIdToCanonicalKey.get(groupId)!);
      }
    }
    
    // Step 5: Aggregate stats across all imports using consolidated groups
    // Track player appearance counts to identify fill players
    const teamStatsMap = new Map<string, {
      teamId: string;
      teamName: string;
      totalPoints: number;
      bestPlacement: number;
      totalEliminations: number;
      importIds: Set<string>;
      members: Array<{
        epicUsername: string;
        playerId: string | null;
        playerName: string;
        discordUsername: string | null;
      }>;
      memberAppearances: Map<string, number>; // Track how many games each player appeared in
    }>();
    
    for (const [importIdStr, teamsMap] of teamPerImportMap.entries()) {
      // Check if this import should be skipped for points calculation
      const skipPoints = importsToSkipForPoints.some(skipId => skipId === importIdStr);
      
      for (const [teamKey, teamData] of teamsMap.entries()) {
        // Get the consolidated team key
        const consolidatedTeamKey = teamSignatureMap.get(teamKey) || teamKey;
        
        const existing = teamStatsMap.get(consolidatedTeamKey);
        
        if (existing) {
          // Add points (unless skipped)
          if (!skipPoints) {
            existing.totalPoints += teamData.points;
          }
          // Update best placement
          existing.bestPlacement = Math.min(existing.bestPlacement, teamData.placement);
          // Add eliminations
          existing.totalEliminations += teamData.eliminations;
          // Track import
          existing.importIds.add(importIdStr);
          
          // Track player appearances and add new members
          for (const member of teamData.members) {
            // Increment appearance count
            const currentCount = existing.memberAppearances.get(member.epicUsername) || 0;
            existing.memberAppearances.set(member.epicUsername, currentCount + 1);
            
            // Add to members list if not already present
            if (!existing.members.some(m => m.epicUsername === member.epicUsername)) {
              existing.members.push(member);
            }
          }
        } else {
          // Create new team entry
          const memberAppearances = new Map<string, number>();
          for (const member of teamData.members) {
            memberAppearances.set(member.epicUsername, 1);
          }
          
          teamStatsMap.set(consolidatedTeamKey, {
            teamId: teamData.teamId,
            teamName: teamData.teamName,
            totalPoints: skipPoints ? 0 : teamData.points,
            bestPlacement: teamData.placement,
            totalEliminations: teamData.eliminations,
            importIds: new Set([importIdStr]),
            members: [...teamData.members],
            memberAppearances,
          });
        }
      }
    }
    
    // Step 6: Filter out fill players (players who only appear in 1 game when team played 2+ games)
    for (const [teamKey, teamData] of teamStatsMap.entries()) {
      const totalGames = teamData.importIds.size;
      
      // Only filter if team played multiple games
      if (totalGames > 1) {
        // Keep only players who appeared in 2+ games (core members)
        teamData.members = teamData.members.filter(member => {
          const appearances = teamData.memberAppearances.get(member.epicUsername) || 0;
          return appearances >= 2;
        });
      }
    }
    
    // Convert to array and sort by total points
    // Filter out:
    // 1. Teams with 0 points (only played in skipped weeks)
    // 2. Teams that only played week 1 (first import, or first two imports for two-lobby events)
    const isTwoLobbies = event?.twoLobbies === true;
    const firstWeekImportIds = new Set<string>();
    if (isTwoLobbies) {
      // For two-lobby events, week 1 = first two imports (lobby A + lobby B)
      if (imports[0]) firstWeekImportIds.add(imports[0]._id);
      if (imports[1]) firstWeekImportIds.add(imports[1]._id);
    } else {
      if (imports[0]) firstWeekImportIds.add(imports[0]._id);
    }
    
    const cumulativeLeaderboard = Array.from(teamStatsMap.values())
      .filter((entry) => {
        // Filter out teams with 0 points
        if (entry.totalPoints <= 0) return false;
        
        // Filter out teams that only played in week 1
        // For two-lobby events: teams whose imports are ALL within the first two imports
        const allInFirstWeek = [...entry.importIds].every(id => firstWeekImportIds.has(id));
        if (allInFirstWeek) {
          return false;
        }
        
        return true;
      })
      .sort((a, b) => b.totalPoints - a.totalPoints)
      .map((entry, index) => ({
        rank: index + 1,
        teamId: entry.teamId,
        teamName: entry.teamName,
        totalPoints: entry.totalPoints,
        bestPlacement: entry.bestPlacement,
        totalEliminations: entry.totalEliminations,
        gamesPlayed: entry.importIds.size,
        members: entry.members,
      }));
    
    // Manual duo selection for random-team events
    let duoLeaderboard: Array<{
      rank: number;
      player1: { epicUsername: string; playerName: string; playerId: string | null; discordUsername: string | null; tier: string | null };
      player2: { epicUsername: string; playerName: string; playerId: string | null; discordUsername: string | null; tier: string | null };
      totalPoints: number;
      bestPlacement: number;
      totalEliminations: number;
      gamesPlayed: number;
    }> = [];
    let soloLeaderboard: Array<{
      rank: number;
      epicUsername: string;
      playerName: string;
      playerId: string | null;
      discordUsername: string | null;
      tier: string | null;
      totalPoints: number;
      bestPlacement: number;
      totalEliminations: number;
      gamesPlayed: number;
    }> = [];
    
    const isRandomSquads = event?.type === "random-squads";
    const isRandomTrios = event?.type === "random-trios";
    const isSolosMeetsDuos = event?.type === "solos-meets-duos";
    const isLegacyRandom = event?.dynamicPairDetection === true && event?.type === "random";
    const shouldExcludeLowest = event?.excludeLowestScore === true;
    
    if (isRandomSquads || isRandomTrios || isLegacyRandom) {
      // Build duo leaderboard - combine Duo #1 and Duo #2
      // Track individual game scores to allow excluding the lowest
      const duoPairs = new Map<string, {
        player1: { epicUsername: string; playerName: string; playerId: string | null; discordUsername: string | null; tier: string | null };
        player2: { epicUsername: string; playerName: string; playerId: string | null; discordUsername: string | null; tier: string | null };
        gameScores: Array<number>;
        placements: Array<number>;
        totalEliminations: number;
        gamesPlayed: number;
      }>();
      
      // Build solo leaderboard (for trios)
      const soloStats = new Map<string, {
        epicUsername: string;
        playerName: string;
        playerId: string | null;
        discordUsername: string | null;
        tier: string | null;
        gameScores: Array<number>;
        placements: Array<number>;
        totalEliminations: number;
        gamesPlayed: number;
      }>();
      
      // Find all games and group duo members who played together
      for (const imp of imports) {
        const results = await ctx.db
          .query("thirdPartyResults")
          .withIndex("by_import", (q) => q.eq("importId", imp._id))
          .collect();
        
        const gamesMap = new Map<string, Array<typeof results[0]>>();
        
        for (const result of results) {
          const gameKey = result.teamId || `game_${result.placement}_${result.epicUsername}`;
          if (!gamesMap.has(gameKey)) {
            gamesMap.set(gameKey, []);
          }
          gamesMap.get(gameKey)!.push(result);
        }
        
        // Process each game
        for (const [gameKey, gameResults] of gamesMap.entries()) {
          const duo1Members = gameResults.filter(r => r.duoAssignment === "duo1");
          const duo2Members = gameResults.filter(r => r.duoAssignment === "duo2");
          const soloMembers = gameResults.filter(r => !r.duoAssignment || r.duoAssignment === null);
          
          const skipPoints = importsToSkipForPoints.some(skipId => skipId === imp._id);
          
          // Process Duo #1
          if (duo1Members.length === 2) {
            const sorted = [...duo1Members].sort((a, b) => a.epicUsername.localeCompare(b.epicUsername));
            const pairKey = `${sorted[0].epicUsername}|${sorted[1].epicUsername}`;
            
            let player1Name = sorted[0].discordUsername || sorted[0].epicUsername;
            let player2Name = sorted[1].discordUsername || sorted[1].epicUsername;
            let player1DiscordUsername: string | null = null;
            let player2DiscordUsername: string | null = null;
            let player1Tier: string | null = null;
            let player2Tier: string | null = null;
            
            if (sorted[0].playerId) {
              const p = await ctx.db.get(sorted[0].playerId);
              if (p) {
                player1Name = p.discordUsername;
                player1DiscordUsername = p.discordUsername;
                player1Tier = p.tier || null;
              }
            }
            if (sorted[1].playerId) {
              const p = await ctx.db.get(sorted[1].playerId);
              if (p) {
                player2Name = p.discordUsername;
                player2DiscordUsername = p.discordUsername;
                player2Tier = p.tier || null;
              }
            }
            
            if (duoPairs.has(pairKey)) {
              const existing = duoPairs.get(pairKey)!;
              if (!skipPoints) {
                existing.gameScores.push(sorted[0].points);
              }
              existing.placements.push(sorted[0].placement);
              existing.totalEliminations += (sorted[0].eliminations || 0) + (sorted[1].eliminations || 0);
              existing.gamesPlayed += 1;
            } else {
              duoPairs.set(pairKey, {
                player1: { epicUsername: sorted[0].epicUsername, playerName: player1Name, playerId: sorted[0].playerId || null, discordUsername: player1DiscordUsername, tier: player1Tier },
                player2: { epicUsername: sorted[1].epicUsername, playerName: player2Name, playerId: sorted[1].playerId || null, discordUsername: player2DiscordUsername, tier: player2Tier },
                gameScores: skipPoints ? [] : [sorted[0].points],
                placements: [sorted[0].placement],
                totalEliminations: (sorted[0].eliminations || 0) + (sorted[1].eliminations || 0),
                gamesPlayed: 1,
              });
            }
          }
          
          // Process Duo #2 (same logic)
          if (duo2Members.length === 2) {
            const sorted = [...duo2Members].sort((a, b) => a.epicUsername.localeCompare(b.epicUsername));
            const pairKey = `${sorted[0].epicUsername}|${sorted[1].epicUsername}`;
            
            let player1Name = sorted[0].discordUsername || sorted[0].epicUsername;
            let player2Name = sorted[1].discordUsername || sorted[1].epicUsername;
            let player1DiscordUsername: string | null = null;
            let player2DiscordUsername: string | null = null;
            let player1Tier: string | null = null;
            let player2Tier: string | null = null;
            
            if (sorted[0].playerId) {
              const p = await ctx.db.get(sorted[0].playerId);
              if (p) {
                player1Name = p.discordUsername;
                player1DiscordUsername = p.discordUsername;
                player1Tier = p.tier || null;
              }
            }
            if (sorted[1].playerId) {
              const p = await ctx.db.get(sorted[1].playerId);
              if (p) {
                player2Name = p.discordUsername;
                player2DiscordUsername = p.discordUsername;
                player2Tier = p.tier || null;
              }
            }
            
            if (duoPairs.has(pairKey)) {
              const existing = duoPairs.get(pairKey)!;
              if (!skipPoints) {
                existing.gameScores.push(sorted[0].points);
              }
              existing.placements.push(sorted[0].placement);
              existing.totalEliminations += (sorted[0].eliminations || 0) + (sorted[1].eliminations || 0);
              existing.gamesPlayed += 1;
            } else {
              duoPairs.set(pairKey, {
                player1: { epicUsername: sorted[0].epicUsername, playerName: player1Name, playerId: sorted[0].playerId || null, discordUsername: player1DiscordUsername, tier: player1Tier },
                player2: { epicUsername: sorted[1].epicUsername, playerName: player2Name, playerId: sorted[1].playerId || null, discordUsername: player2DiscordUsername, tier: player2Tier },
                gameScores: skipPoints ? [] : [sorted[0].points],
                placements: [sorted[0].placement],
                totalEliminations: (sorted[0].eliminations || 0) + (sorted[1].eliminations || 0),
                gamesPlayed: 1,
              });
            }
          }
          
          // Process solo members (for trio mode)
          for (const result of soloMembers) {
            let playerName = result.discordUsername || result.epicUsername;
            let playerId = result.playerId || null;
            let discordUsername: string | null = null;
            let tier: string | null = null;
            
            if (result.playerId) {
              const player = await ctx.db.get(result.playerId);
              if (player) {
                playerName = player.discordUsername;
                discordUsername = player.discordUsername;
                tier = player.tier || null;
              }
            }
            
            const existing = soloStats.get(result.epicUsername);
            
            if (existing) {
              if (!skipPoints) {
                existing.gameScores.push(result.points);
              }
              existing.placements.push(result.placement);
              existing.totalEliminations += result.eliminations || 0;
              existing.gamesPlayed += 1;
            } else {
              soloStats.set(result.epicUsername, {
                epicUsername: result.epicUsername,
                playerName,
                playerId,
                discordUsername,
                tier,
                gameScores: skipPoints ? [] : [result.points],
                placements: [result.placement],
                totalEliminations: result.eliminations || 0,
                gamesPlayed: 1,
              });
            }
          }
        }
      }
      
      // For Random Squads: consolidate solo game points into duo pairs
      if (isRandomSquads) {
        // Build a map of which duo each player belongs to
        const playerToDuoPair = new Map<string, string>();
        
        for (const [pairKey, duoData] of duoPairs.entries()) {
          playerToDuoPair.set(duoData.player1.epicUsername, pairKey);
          playerToDuoPair.set(duoData.player2.epicUsername, pairKey);
        }
        
        // Add solo game stats to their duo pair
        for (const [epicUsername, soloData] of soloStats.entries()) {
          const duoPairKey = playerToDuoPair.get(epicUsername);
          
          if (duoPairKey && duoPairs.has(duoPairKey)) {
            const duoData = duoPairs.get(duoPairKey)!;
            duoData.gameScores.push(...soloData.gameScores);
            duoData.placements.push(...soloData.placements);
            duoData.totalEliminations += soloData.totalEliminations;
            duoData.gamesPlayed += soloData.gamesPlayed;
          }
        }
        
        // Clear solo stats for Random Squads (all consolidated into duos)
        soloStats.clear();
      }
      
      // Convert to leaderboard format, calculating totalPoints from gameScores
      duoLeaderboard = Array.from(duoPairs.values())
        .map((entry) => {
          // Calculate total points, counting only best 3 scores if enabled
          let totalPoints = 0;
          if (entry.gameScores.length > 0) {
            const sortedScores = [...entry.gameScores].sort((a, b) => b - a); // Sort descending (highest first)
            // If we should count only best 3 and have 4+ games, take top 3
            const scoresToCount = shouldExcludeLowest && sortedScores.length >= 4 
              ? sortedScores.slice(0, 3) 
              : sortedScores;
            totalPoints = scoresToCount.reduce((sum, score) => sum + score, 0);
          }
          
          return {
            rank: 0, // Will be set after sorting
            player1: entry.player1,
            player2: entry.player2,
            totalPoints,
            bestPlacement: Math.min(...entry.placements),
            totalEliminations: entry.totalEliminations,
            gamesPlayed: entry.gamesPlayed,
          };
        })
        .filter(entry => entry.totalPoints > 0)
        .sort((a, b) => b.totalPoints - a.totalPoints)
        .map((entry, index) => ({
          ...entry,
          rank: index + 1,
        }));
      
      soloLeaderboard = Array.from(soloStats.values())
        .map((entry) => {
          // Calculate total points, counting only best 3 scores if enabled
          let totalPoints = 0;
          if (entry.gameScores.length > 0) {
            const sortedScores = [...entry.gameScores].sort((a, b) => b - a); // Sort descending (highest first)
            // If we should count only best 3 and have 4+ games, take top 3
            const scoresToCount = shouldExcludeLowest && sortedScores.length >= 4 
              ? sortedScores.slice(0, 3) 
              : sortedScores;
            totalPoints = scoresToCount.reduce((sum, score) => sum + score, 0);
          }
          
          return {
            rank: 0, // Will be set after sorting
            epicUsername: entry.epicUsername,
            playerName: entry.playerName,
            playerId: entry.playerId,
            discordUsername: entry.discordUsername,
            tier: entry.tier,
            totalPoints,
            bestPlacement: Math.min(...entry.placements),
            totalEliminations: entry.totalEliminations,
            gamesPlayed: entry.gamesPlayed,
          };
        })
        .filter(entry => entry.totalPoints > 0)
        .sort((a, b) => b.totalPoints - a.totalPoints)
        .map((entry, index) => ({
          ...entry,
          rank: index + 1,
        }));
    }
    
    // Solos Meets Duos/Trios: build group cumulative leaderboard from pre-assigned pairs
    // Each player plays solo, but their points are summed per group
    type PlayerInfo = { epicUsername: string; playerName: string; playerId: string | null; discordUsername: string | null; tier: string | null };
    let solosMeetsDuosLeaderboard: Array<{
      rank: number;
      player1: PlayerInfo;
      player2: PlayerInfo;
      player3: PlayerInfo | null;
      totalPoints: number;
      player1Points: number;
      player2Points: number;
      player3Points: number;
      bestPlacement: number;
      totalEliminations: number;
      gamesPlayed: number;
    }> = [];
    
    if (isSolosMeetsDuos && event) {
      // Get pre-assigned groups
      const duoPairs = await ctx.db
        .query("eventDuoPairs")
        .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
        .collect();
      
      // Build player stats across all imports (individual)
      const playerCumulativeStats = new Map<string, {
        playerId: string | null;
        epicUsername: string;
        playerName: string;
        discordUsername: string | null;
        tier: string | null;
        totalPoints: number;
        bestPlacement: number;
        totalEliminations: number;
        gamesPlayed: number;
        gameScores: number[];
      }>();
      
      for (const imp of imports) {
        const skipPoints = importsToSkipForPoints.some(skipId => skipId === imp._id);
        
        const results = await ctx.db
          .query("thirdPartyResults")
          .withIndex("by_import", (q) => q.eq("importId", imp._id))
          .collect();
        
        for (const result of results) {
          const key = result.playerId || result.epicUsername;
          const existing = playerCumulativeStats.get(key);
          
          let playerName = result.discordUsername || result.epicUsername;
          let discordUsername: string | null = null;
          let tier: string | null = null;
          
          if (result.playerId) {
            const player = await ctx.db.get(result.playerId);
            if (player) {
              playerName = player.discordUsername;
              discordUsername = player.discordUsername;
              tier = player.tier || null;
            }
          }
          
          if (existing) {
            if (!skipPoints) {
              existing.gameScores.push(result.points);
              existing.totalPoints += result.points;
            }
            existing.bestPlacement = Math.min(existing.bestPlacement, result.placement);
            existing.totalEliminations += result.eliminations || 0;
            existing.gamesPlayed += 1;
          } else {
            playerCumulativeStats.set(key, {
              playerId: result.playerId || null,
              epicUsername: result.epicUsername,
              playerName,
              discordUsername,
              tier,
              totalPoints: skipPoints ? 0 : result.points,
              bestPlacement: result.placement,
              totalEliminations: result.eliminations || 0,
              gamesPlayed: 1,
              gameScores: skipPoints ? [] : [result.points],
            });
          }
        }
      }
      
      // Helper to build PlayerInfo from a player ID
      const buildPlayerInfo = async (playerId: string, stats: typeof playerCumulativeStats extends Map<string, infer V> ? V : never): Promise<PlayerInfo> => {
        const player = await ctx.db.get(playerId as never);
        const typedPlayer = player as { epicUsername?: string; discordUsername?: string; tier?: string | null } | null;
        return {
          epicUsername: typedPlayer?.epicUsername ?? "Unknown",
          playerName: stats?.playerName ?? typedPlayer?.discordUsername ?? "Unknown",
          playerId,
          discordUsername: stats?.discordUsername ?? typedPlayer?.discordUsername ?? null,
          tier: stats?.tier ?? typedPlayer?.tier ?? null,
        };
      };

      // Build group leaderboard from pre-assigned pairs/trios
      for (const pair of duoPairs) {
        const p1Key = pair.player1Id as string;
        const p2Key = pair.player2Id as string;
        const p1Stats = playerCumulativeStats.get(p1Key);
        const p2Stats = playerCumulativeStats.get(p2Key);
        
        const p1Points = p1Stats?.totalPoints ?? 0;
        const p2Points = p2Stats?.totalPoints ?? 0;
        let p3Points = 0;
        let player3Info: PlayerInfo | null = null;

        if (pair.player3Id) {
          const p3Key = pair.player3Id as string;
          const p3Stats = playerCumulativeStats.get(p3Key);
          p3Points = p3Stats?.totalPoints ?? 0;
          player3Info = await buildPlayerInfo(pair.player3Id, p3Stats ?? {
            playerId: pair.player3Id,
            epicUsername: "Unknown",
            playerName: "Unknown",
            discordUsername: null,
            tier: null,
            totalPoints: 0,
            bestPlacement: 999,
            totalEliminations: 0,
            gamesPlayed: 0,
            gameScores: [],
          });
        }

        const combinedPoints = p1Points + p2Points + p3Points;
        
        if (combinedPoints <= 0) continue;
        
        solosMeetsDuosLeaderboard.push({
          rank: 0,
          player1: await buildPlayerInfo(pair.player1Id, p1Stats ?? {
            playerId: pair.player1Id,
            epicUsername: "Unknown",
            playerName: "Unknown",
            discordUsername: null,
            tier: null,
            totalPoints: 0,
            bestPlacement: 999,
            totalEliminations: 0,
            gamesPlayed: 0,
            gameScores: [],
          }),
          player2: await buildPlayerInfo(pair.player2Id, p2Stats ?? {
            playerId: pair.player2Id,
            epicUsername: "Unknown",
            playerName: "Unknown",
            discordUsername: null,
            tier: null,
            totalPoints: 0,
            bestPlacement: 999,
            totalEliminations: 0,
            gamesPlayed: 0,
            gameScores: [],
          }),
          player3: player3Info,
          totalPoints: combinedPoints,
          player1Points: p1Points,
          player2Points: p2Points,
          player3Points: p3Points,
          bestPlacement: Math.min(
            p1Stats?.bestPlacement ?? 999,
            p2Stats?.bestPlacement ?? 999,
            pair.player3Id ? (playerCumulativeStats.get(pair.player3Id as string)?.bestPlacement ?? 999) : 999
          ),
          totalEliminations: (p1Stats?.totalEliminations ?? 0) + (p2Stats?.totalEliminations ?? 0) + (pair.player3Id ? (playerCumulativeStats.get(pair.player3Id as string)?.totalEliminations ?? 0) : 0),
          gamesPlayed: (p1Stats?.gamesPlayed ?? 0) + (p2Stats?.gamesPlayed ?? 0) + (pair.player3Id ? (playerCumulativeStats.get(pair.player3Id as string)?.gamesPlayed ?? 0) : 0),
        });
      }
      
      // Sort by total points descending and assign ranks
      solosMeetsDuosLeaderboard.sort((a, b) => b.totalPoints - a.totalPoints);
      solosMeetsDuosLeaderboard = solosMeetsDuosLeaderboard.map((entry, index) => ({
        ...entry,
        rank: index + 1,
      }));
    }
    
    // Scrim Series & Showdown: per-player best-N-games cumulative leaderboard
    const isScrimSeries = event?.type === "scrim-series";
    const isShowdown = event?.type === "showdown";
    
    type PerPlayerEntry = {
      rank: number;
      playerId: string | null;
      epicUsername: string;
      playerName: string;
      discordUsername: string | null;
      tier: string | null;
      totalPoints: number;
      bestPlacement: number;
      totalEliminations: number;
      gamesPlayed: number;
      gamesCountedForPoints: number;
    };
    
    let perPlayerLeaderboard: PerPlayerEntry[] = [];
    // Showdown: 4 tier-split leaderboards using locked tiers
    let showdownTierLeaderboards: Record<string, PerPlayerEntry[]> = {};
    
    if (isScrimSeries || isShowdown) {
      const bestN = event?.bestNGames ?? 999; // default: count all games
      // Showdown: best 2 weekly performances out of 4 (each import = 1 week)
      const bestWeeks = 2;
      
      // Build per-player stats across all imports
      const playerStats = new Map<string, {
        playerId: string | null;
        epicUsername: string;
        playerName: string;
        discordUsername: string | null;
        tier: string | null;
        gameScores: number[];
        placements: number[];
        totalEliminations: number;
        gamesPlayed: number;
        // Showdown: track points per import (week)
        weeklyPoints: Map<string, number>;
      }>();
      
      for (const imp of imports) {
        const results = await ctx.db
          .query("thirdPartyResults")
          .withIndex("by_import", (q) => q.eq("importId", imp._id))
          .collect();
        
        for (const result of results) {
          // Use playerId as key if available, otherwise epicUsername
          const key = result.playerId || result.epicUsername;
          const existing = playerStats.get(key);
          
          let playerName = result.discordUsername || result.epicUsername;
          let discordUsername: string | null = null;
          let tier: string | null = null;
          
          if (result.playerId) {
            const player = await ctx.db.get(result.playerId);
            if (player) {
              playerName = player.discordUsername;
              discordUsername = player.discordUsername;
              tier = player.tier || null;
            }
          }
          
          if (existing) {
            existing.gameScores.push(result.points);
            existing.placements.push(result.placement);
            existing.totalEliminations += result.eliminations || 0;
            existing.gamesPlayed += 1;
            // Accumulate weekly points for this import
            const currentWeekly = existing.weeklyPoints.get(imp._id) ?? 0;
            existing.weeklyPoints.set(imp._id, currentWeekly + result.points);
          } else {
            const weeklyPoints = new Map<string, number>();
            weeklyPoints.set(imp._id, result.points);
            playerStats.set(key, {
              playerId: result.playerId || null,
              epicUsername: result.epicUsername,
              playerName,
              discordUsername,
              tier,
              gameScores: [result.points],
              placements: [result.placement],
              totalEliminations: result.eliminations || 0,
              gamesPlayed: 1,
              weeklyPoints,
            });
          }
        }
      }
      
      // Convert to leaderboard entries
      const allPlayerEntries: PerPlayerEntry[] = Array.from(playerStats.values())
        .map((entry) => {
          let totalPoints: number;
          let gamesCountedForPoints: number;
          
          if (isShowdown) {
            // Showdown: best 2 weekly totals out of up to 4 weeks
            const weekTotals = Array.from(entry.weeklyPoints.values()).sort((a, b) => b - a);
            const countedWeeks = weekTotals.slice(0, bestWeeks);
            totalPoints = countedWeeks.reduce((sum, s) => sum + s, 0);
            gamesCountedForPoints = countedWeeks.length; // number of weeks counted
          } else {
            // Scrim Series: best-N individual games
            const sortedScores = [...entry.gameScores].sort((a, b) => b - a);
            const scoresToCount = sortedScores.slice(0, bestN);
            totalPoints = scoresToCount.reduce((sum, s) => sum + s, 0);
            gamesCountedForPoints = Math.min(entry.gameScores.length, bestN);
          }
          
          return {
            rank: 0,
            playerId: entry.playerId,
            epicUsername: entry.epicUsername,
            playerName: entry.playerName,
            discordUsername: entry.discordUsername,
            tier: entry.tier,
            totalPoints,
            bestPlacement: Math.min(...entry.placements),
            totalEliminations: entry.totalEliminations,
            gamesPlayed: entry.gamesPlayed,
            gamesCountedForPoints,
          };
        })
        .filter((e) => e.totalPoints > 0);
      
      if (isScrimSeries) {
        // Single sorted leaderboard
        perPlayerLeaderboard = allPlayerEntries
          .sort((a, b) => b.totalPoints - a.totalPoints)
          .map((entry, index) => ({ ...entry, rank: index + 1 }));
      }
      
      if (isShowdown) {
        // Fetch locked tier snapshots
        const tierSnapshots = await ctx.db
          .query("showdownTierSnapshots")
          .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
          .collect();
        
        const lockedTierMap = new Map<string, string>();
        for (const snap of tierSnapshots) {
          lockedTierMap.set(snap.playerId, snap.tier);
        }
        
        const tiersUseLocked = lockedTierMap.size > 0;
        
        // Split players into tiers
        const tierBuckets: Record<string, PerPlayerEntry[]> = { S: [], A: [], B: [], C: [] };
        
        for (const entry of allPlayerEntries) {
          // Use locked tier if available, otherwise fall back to current tier
          const playerTier = tiersUseLocked && entry.playerId
            ? (lockedTierMap.get(entry.playerId) ?? entry.tier ?? "C")
            : (entry.tier ?? "C");
          
          // Override the entry's tier with the locked value for display
          const entryWithLockedTier = { ...entry, tier: playerTier };
          
          if (playerTier in tierBuckets) {
            tierBuckets[playerTier].push(entryWithLockedTier);
          } else {
            // Default to C tier if unknown
            tierBuckets["C"].push(entryWithLockedTier);
          }
        }
        
        // Sort each tier bucket and assign ranks
        for (const tier of ["S", "A", "B", "C"]) {
          showdownTierLeaderboards[tier] = tierBuckets[tier]
            .sort((a, b) => b.totalPoints - a.totalPoints)
            .map((entry, index) => ({ ...entry, rank: index + 1 }));
        }
        
        // Also build the overall per-player leaderboard (all tiers combined)
        perPlayerLeaderboard = allPlayerEntries
          .sort((a, b) => b.totalPoints - a.totalPoints)
          .map((entry, index) => ({ ...entry, rank: index + 1 }));
      }
    }
    
    return {
      leaderboards,
      cumulativeLeaderboard,
      duoLeaderboard,
      soloLeaderboard,
      solosMeetsDuosLeaderboard,
      perPlayerLeaderboard,
      showdownTierLeaderboards,
      dynamicPairDetection: event?.dynamicPairDetection || false,
      isRandomSquads,
      isRandomTrios,
      isSolosMeetsDuos,
      isScrimSeries: isScrimSeries || false,
      isShowdown: isShowdown || false,
      bestNGames: event?.bestNGames ?? null,
      twoLobbies: isTwoLobbies,
    };
  },
});

// Get all results for an event (legacy - kept for backward compatibility)
export const getEventResults = query({
  args: { eventId: v.id("events") },
  handler: async (ctx, args) => {
    // Get all imports linked to this event
    const imports = await ctx.db
      .query("thirdPartyImports")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    
    if (imports.length === 0) {
      return [];
    }
    
    // Get all results for these imports
    const allResults = [];
    for (const imp of imports) {
      const results = await ctx.db
        .query("thirdPartyResults")
        .withIndex("by_import", (q) => q.eq("importId", imp._id))
        .filter((q) => q.eq(q.field("matched"), true))
        .collect();
      
      allResults.push(...results);
    }
    
    // Group by player and aggregate stats
    const playerStats = new Map<string, {
      playerId: string;
      playerName: string;
      totalPoints: number;
      bestPlacement: number;
      totalEliminations: number;
      gamesPlayed: number;
    }>();
    
    for (const result of allResults) {
      if (!result.playerId) continue;
      
      const key = result.playerId;
      const existing = playerStats.get(key);
      
      if (existing) {
        existing.totalPoints += result.points;
        existing.bestPlacement = Math.min(existing.bestPlacement, result.placement);
        existing.totalEliminations += result.eliminations || 0;
        existing.gamesPlayed += 1;
      } else {
        // Get player info
        const player = await ctx.db.get(result.playerId);
        
        playerStats.set(key, {
          playerId: result.playerId,
          playerName: player?.discordUsername || "Unknown",
          totalPoints: result.points,
          bestPlacement: result.placement,
          totalEliminations: result.eliminations || 0,
          gamesPlayed: 1,
        });
      }
    }
    
    // Convert to array and sort by total points
    return Array.from(playerStats.values())
      .sort((a, b) => b.totalPoints - a.totalPoints);
  },
});
