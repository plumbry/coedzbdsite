import type { Doc } from "../_generated/dataModel";

/** Alternate Discord account — hidden from member lists and profiles. */
export function isAltAccount(player: Pick<Doc<"players">, "isAlt">): boolean {
  return player.isAlt === true;
}

export function isVisibleInMemberLists(
  player: Pick<Doc<"players">, "isAlt">,
): boolean {
  return !isAltAccount(player);
}

export function filterVisibleMembers<T extends Pick<Doc<"players">, "isAlt">>(
  players: T[],
): T[] {
  return players.filter(isVisibleInMemberLists);
}
