/**
 * Shared Summer Slam artwork — used by landing, live passport, and demo passport.
 * Bump ASSET_VERSION whenever files in /public/summer-slam change.
 */
export const ASSET_VERSION = "2026-06-20-header-sharp";

export function summerSlamAsset(path: string): string {
  return `${path}?v=${ASSET_VERSION}`;
}

export const PASSPORT_HEADER = {
  src: summerSlamAsset("/summer-slam/passport-header.png"),
  width: 525,
  height: 206,
} as const;

export const STAMP_IMAGES = {
  traveller: summerSlamAsset("/summer-slam/seals/traveller.png"),
  competitor: summerSlamAsset("/summer-slam/seals/competitor.png"),
  summer_spirit: summerSlamAsset("/summer-slam/seals/summer_spirit.png"),
  team_player: summerSlamAsset("/summer-slam/seals/team_player.png"),
  community: summerSlamAsset("/summer-slam/seals/community.png"),
} as const;
