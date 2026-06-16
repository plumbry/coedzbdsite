/** Distinct hex palette for responsibility tags (keep in sync with convex/opsHub/responsibilityCatalog.ts). */
export const RESPONSIBILITY_COLORS = [
  "#2563eb",
  "#16a34a",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#db2777",
  "#0d9488",
  "#ea580c",
  "#4f46e5",
  "#0891b2",
  "#ca8a04",
  "#9333ea",
  "#e11d48",
  "#059669",
  "#c026d3",
  "#0284c7",
] as const;

function hashLabel(label: string): number {
  const normalized = label.trim().toLowerCase();
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i++) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function pickUniqueResponsibilityColor(
  usedColors: Iterable<string>,
  label: string,
): string {
  const used = new Set([...usedColors].map((c) => c.toLowerCase()));
  const start = hashLabel(label) % RESPONSIBILITY_COLORS.length;
  for (let i = 0; i < RESPONSIBILITY_COLORS.length; i++) {
    const color = RESPONSIBILITY_COLORS[(start + i) % RESPONSIBILITY_COLORS.length];
    if (!used.has(color.toLowerCase())) return color;
  }
  let hueOffset = hashLabel(label) % 360;
  for (let attempt = 0; attempt < 360; attempt++) {
    const color = hslToHex((hueOffset + attempt * 37) % 360, 68, 45);
    if (!used.has(color.toLowerCase())) return color;
  }
  return hslToHex(hashLabel(label) % 360, 68, 45);
}

export function collectUsedResponsibilityColors(
  catalog: Array<{ color: string }> | undefined,
  tags: Array<{ color: string }>,
): string[] {
  const colors: string[] = [];
  catalog?.forEach((entry) => colors.push(entry.color));
  tags.forEach((tag) => colors.push(tag.color));
  return colors;
}
