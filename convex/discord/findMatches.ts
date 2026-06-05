import { query } from "../_generated/server";
import { requireAdmin } from "../auth_helpers";

// Helper function to normalize usernames for fuzzy matching
function normalizeUsername(username: string): string {
  return username
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, ""); // Remove special characters, spaces, etc.
}

// Helper function to strip common gaming prefixes/suffixes
function stripCommonAffixes(username: string): string {
  const normalized = normalizeUsername(username);
  
  // Common prefixes - expanded list
  const prefixes = [
    "ttv", "twitch", "tv", "yt", "youtube", "ig", "insta", "instagram", "tiktok", "tk", "tt",
    "fn", "fortnite", "epic", "discord", "mask", "clan", "team", "squad", "faze", "optic",
    "the", "a", "real", "og", "pro", "x", "xx", "xxx", "i", "im", "its", "is"
  ];
  
  let result = normalized;
  
  // Try removing all prefixes
  for (const prefix of prefixes) {
    if (result.startsWith(prefix)) {
      const withoutPrefix = result.slice(prefix.length);
      // Only strip if there's still a substantial username left
      if (withoutPrefix.length >= 2) {
        result = withoutPrefix;
      }
    }
  }
  
  // Common suffixes - expanded list
  const suffixes = [
    "ttv", "twitch", "tv", "yt", "youtube", "ig", "fn", "fortnite", 
    "pro", "x", "xx", "xxx", "xd", "lol", "gg", "gaming", "plays", "yt",
    "tv", "live", "official", "real", "og"
  ];
  
  // Try removing suffixes
  for (const suffix of suffixes) {
    if (result.endsWith(suffix)) {
      const withoutSuffix = result.slice(0, -suffix.length);
      if (withoutSuffix.length >= 2) {
        result = withoutSuffix;
      }
    }
  }
  
  // Strip trailing numbers if the core is long enough
  const withoutTrailingNumbers = result.replace(/\d+$/, "");
  if (withoutTrailingNumbers.length >= 2 && withoutTrailingNumbers !== result) {
    result = withoutTrailingNumbers;
  }
  
  // Strip leading numbers
  const withoutLeadingNumbers = result.replace(/^\d+/, "");
  if (withoutLeadingNumbers.length >= 2 && withoutLeadingNumbers !== result) {
    result = withoutLeadingNumbers;
  }
  
  return result;
}

// Simple Levenshtein distance implementation
function getLevenshteinDistance(str1: string, str2: string): number {
  const m = str1.length;
  const n = str2.length;
  const dp: number[][] = [];

  for (let i = 0; i <= m; i++) {
    dp[i] = [i];
  }
  for (let j = 0; j <= n; j++) {
    dp[0][j] = j;
  }

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,    // deletion
          dp[i][j - 1] + 1,    // insertion
          dp[i - 1][j - 1] + 1 // substitution
        );
      }
    }
  }

  return dp[m][n];
}

// Helper function to check if usernames are similar (handles typos)
function areUsernamesSimilar(username1: string, username2: string): boolean {
  const norm1 = normalizeUsername(username1);
  const norm2 = normalizeUsername(username2);
  
  // Too short to reliably match
  if (norm1.length < 3 || norm2.length < 3) return false;
  
  // Exact match after normalization
  if (norm1 === norm2) return true;
  
  // Try stripping common prefixes/suffixes
  const stripped1 = stripCommonAffixes(username1);
  const stripped2 = stripCommonAffixes(username2);
  
  // Exact match after stripping affixes (minimum 3 chars)
  if (stripped1 === stripped2 && stripped1.length >= 3) return true;
  
  // Calculate similarity ratio
  const minLength = Math.min(norm1.length, norm2.length);
  const maxLength = Math.max(norm1.length, norm2.length);
  
  // Length difference check - reject if too different
  const lengthDiff = maxLength - minLength;
  if (lengthDiff > Math.max(3, maxLength * 0.3)) return false;
  
  // Substring matching - much more conservative
  // Only match if the substring is at least 60% of the shorter string
  const minSubstringLength = Math.max(5, Math.floor(minLength * 0.6));
  
  // Check if stripped versions have significant overlap
  if (stripped1.length >= minSubstringLength && stripped2.length >= minSubstringLength) {
    if (stripped1.length >= minSubstringLength) {
      if (stripped2.includes(stripped1)) return true;
    }
    if (stripped2.length >= minSubstringLength) {
      if (stripped1.includes(stripped2)) return true;
    }
  }
  
  // Starts/ends with check - require longer matches
  if (norm1.length >= 5 && norm2.length >= 5) {
    const minPrefixSuffixLength = Math.floor(minLength * 0.7);
    
    // Check prefix
    if (norm1.substring(0, minPrefixSuffixLength) === norm2.substring(0, minPrefixSuffixLength)) {
      return true;
    }
    
    // Check suffix
    if (norm1.substring(norm1.length - minPrefixSuffixLength) === 
        norm2.substring(norm2.length - minPrefixSuffixLength)) {
      return true;
    }
  }
  
  // Levenshtein distance - much more conservative
  // Only allow up to 20% edit distance and max 2 characters for shorter names
  const distance = getLevenshteinDistance(norm1, norm2);
  const maxDistance = Math.min(2, Math.floor(maxLength * 0.2));
  if (distance <= maxDistance) return true;
  
  // Check Levenshtein on stripped versions too (conservative)
  if (stripped1.length >= 4 && stripped2.length >= 4) {
    const strippedDistance = getLevenshteinDistance(stripped1, stripped2);
    const strippedMaxDistance = Math.min(2, Math.floor(Math.max(stripped1.length, stripped2.length) * 0.2));
    if (strippedDistance <= strippedMaxDistance) return true;
  }
  
  return false;
}

export const findPotentialMatches = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const players = await ctx.db.query("players").collect();
    
    // Discord members that need conversion
    const discordMembers = players.filter(p => 
      p.status === "discord_member" && 
      p.discordRoles && 
      p.discordRoles.length > 0
    );
    
    // Manual players with placeholder IDs
    const isPlaceholderId = (id?: string) => !id || id.startsWith("placeholder_") || id === "imported";
    const manualPlayers = players.filter(p => 
      isPlaceholderId(p.discordUserId)
    );
    
    const matches: Array<{
      discordMemberId: string;
      discordMemberName: string;
      discordMemberEpic: string;
      manualPlayerId: string;
      manualPlayerName: string;
      manualPlayerTier: string | undefined;
      matchType: "exact" | "username" | "fuzzy";
      matchedOn: string;
    }> = [];
    
    // Find matches for each Discord member
    for (const discordMember of discordMembers) {
      let matchedPlayer = null;
      let matchType: "exact" | "username" | "fuzzy" | null = null;
      let matchedOn = "";
      
      // Try normalized Discord username matching
      const normDiscord = normalizeUsername(discordMember.discordUsername);
      matchedPlayer = manualPlayers.find(p => 
        normalizeUsername(p.discordUsername) === normDiscord
      ) || null;
      
      if (matchedPlayer) {
        matchType = "username";
        matchedOn = "Discord username";
      }
      
      // Try normalized Epic username matching
      if (!matchedPlayer && discordMember.epicUsername) {
        const normEpic = normalizeUsername(discordMember.epicUsername);
        matchedPlayer = manualPlayers.find(p => 
          normalizeUsername(p.epicUsername) === normEpic
        ) || null;
        
        if (matchedPlayer) {
          matchType = "username";
          matchedOn = "Epic username";
        }
      }
      
      // Try fuzzy matching on Discord username
      if (!matchedPlayer) {
        matchedPlayer = manualPlayers.find(p => 
          areUsernamesSimilar(p.discordUsername, discordMember.discordUsername)
        ) || null;
        
        if (matchedPlayer) {
          matchType = "fuzzy";
          matchedOn = "Discord username (fuzzy)";
        }
      }
      
      // Try fuzzy matching on Epic username
      if (!matchedPlayer && discordMember.epicUsername) {
        matchedPlayer = manualPlayers.find(p => 
          areUsernamesSimilar(p.epicUsername, discordMember.epicUsername)
        ) || null;
        
        if (matchedPlayer) {
          matchType = "fuzzy";
          matchedOn = "Epic username (fuzzy)";
        }
      }
      
      if (matchedPlayer && matchType) {
        matches.push({
          discordMemberId: discordMember._id,
          discordMemberName: discordMember.discordUsername,
          discordMemberEpic: discordMember.epicUsername,
          manualPlayerId: matchedPlayer._id,
          manualPlayerName: matchedPlayer.epicUsername,
          manualPlayerTier: matchedPlayer.tier,
          matchType,
          matchedOn,
        });
      }
    }
    
    return {
      totalDiscordMembers: discordMembers.length,
      totalManualPlayers: manualPlayers.length,
      totalMatches: matches.length,
      matches: matches.sort((a, b) => {
        // Sort by match type (username first, then fuzzy)
        if (a.matchType !== b.matchType) {
          return a.matchType === "username" ? -1 : 1;
        }
        return a.discordMemberName.localeCompare(b.discordMemberName);
      }),
    };
  },
});
