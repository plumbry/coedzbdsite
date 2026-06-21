/**
 * Shared Summer Slam artwork — used by landing, live passport, and demo passport.
 * Bump ASSET_VERSION whenever files in /public/summer-slam change.
 */
export const ASSET_VERSION = "2026-06-21-bonus-seal-v1";

export function summerSlamAsset(path: string): string {
  return `${path}?v=${ASSET_VERSION}`;
}

const SEAL_SLUGS = {
  traveller: "traveller",
  competitor: "competitor",
  summer_spirit: "summer_spirit",
  team_player: "team_player",
  community: "community",
  summer_legend: "summer_legend",
} as const;

export type SealSlug = keyof typeof SEAL_SLUGS;

/** Pre-rendered widths in /public/summer-slam/seals (see scripts/export-seal-pngs.mjs). */
const SEAL_SRC_WIDTHS = [160, 256, 320, 512] as const;

export function sealSrcSet(slug: SealSlug): { src: string; srcSet: string } {
  const file = SEAL_SLUGS[slug];
  const srcSet = SEAL_SRC_WIDTHS.map((w) => {
    const suffix = w === 512 ? "" : `@${w}`;
    return `${summerSlamAsset(`/summer-slam/seals/${file}${suffix}.png`)} ${w}w`;
  }).join(", ");
  return {
    src: summerSlamAsset(`/summer-slam/seals/${file}@160.png`),
    srcSet,
  };
}

export const PASSPORT_HEADER = {
  src: summerSlamAsset("/summer-slam/passport-header.png"),
  width: 944,
  height: 375,
  /** Stay at/below native width so desktop layout never upscales the PNG. */
  displayMaxWidth: 880,
} as const;

export const PASSPORT_HEADER_IMG_CLASS = "mx-auto h-auto w-full max-w-[min(100%,880px)]";

export const STAMP_IMAGES = {
  traveller: summerSlamAsset("/summer-slam/seals/traveller.png"),
  competitor: summerSlamAsset("/summer-slam/seals/competitor.png"),
  summer_spirit: summerSlamAsset("/summer-slam/seals/summer_spirit.png"),
  team_player: summerSlamAsset("/summer-slam/seals/team_player.png"),
  community: summerSlamAsset("/summer-slam/seals/community.png"),
  summer_legend: summerSlamAsset("/summer-slam/seals/summer_legend.png"),
} as const;
