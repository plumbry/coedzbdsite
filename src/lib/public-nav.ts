export type PublicNavItem = {
  to: string;
  label: string;
  shortLabel?: string;
};

/** Public header and mobile sheet. Spin and Scrim Series stay off this list. */
export const PUBLIC_NAV_ITEMS: PublicNavItem[] = [
  { to: "/events", label: "Events" },
  { to: "/members", label: "Members" },
  { to: "/tier-restrictions", label: "Tier Restrictions", shortLabel: "Tiers" },
  { to: "/support", label: "Support" },
];
