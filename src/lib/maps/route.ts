/** Normalize mixed-case `/maps/...` URLs to lowercase for route matching. */
export function normalizeMapsPathname(pathname: string): string {
  const mapsPrefix = "/maps/";
  if (!pathname.toLowerCase().startsWith(mapsPrefix)) {
    return pathname;
  }
  return pathname.toLowerCase();
}
