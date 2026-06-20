/**
 * Summer Slam collectible passport avatars.
 *
 * Official artwork lives in /public/summer-slam/avatars — use the supplied PNGs
 * exactly as provided; never regenerate or recolour them.
 */

export const PASSPORT_AVATAR_IDS = [
  "sunset",
  "surfboard",
  "ice_cream",
  "tropical_drink",
  "beach_chair",
  "sand_bucket",
  "conch_shell",
  "starfish",
  "clownfish",
] as const;

export type PassportAvatarId = (typeof PASSPORT_AVATAR_IDS)[number];

export type PassportAvatar = {
  id: PassportAvatarId;
  label: string;
  /** Public path to the official transparent PNG. */
  image: string;
};

export const PASSPORT_AVATARS: PassportAvatar[] = [
  { id: "sunset", label: "Sunset", image: "/summer-slam/avatars/sunset.png" },
  { id: "surfboard", label: "Surfboard", image: "/summer-slam/avatars/surfboard.png" },
  { id: "ice_cream", label: "Ice Cream", image: "/summer-slam/avatars/ice_cream.png" },
  { id: "tropical_drink", label: "Tropical Drink", image: "/summer-slam/avatars/tropical_drink.png" },
  { id: "beach_chair", label: "Beach Chair", image: "/summer-slam/avatars/beach_chair.png" },
  { id: "sand_bucket", label: "Sand Bucket", image: "/summer-slam/avatars/sand_bucket.png" },
  { id: "conch_shell", label: "Conch Shell", image: "/summer-slam/avatars/conch_shell.png" },
  { id: "starfish", label: "Starfish", image: "/summer-slam/avatars/starfish.png" },
  { id: "clownfish", label: "Clownfish", image: "/summer-slam/avatars/clownfish.png" },
];

const avatarById = new Map(PASSPORT_AVATARS.map((avatar) => [avatar.id, avatar]));

/** Resolve avatar metadata for display (identity card, activity feed, etc.). */
export function getPassportAvatar(avatarId: PassportAvatarId | null | undefined) {
  if (!avatarId) return null;
  return avatarById.get(avatarId) ?? null;
}

/** Public image URL for a stored passport avatar id. */
export function getPassportAvatarImageUrl(avatarId: PassportAvatarId | null | undefined) {
  return getPassportAvatar(avatarId)?.image ?? null;
}
