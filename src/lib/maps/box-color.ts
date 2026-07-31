export const MAP_BOX_DEFAULT_COLOR = "#FAE904";
export const MAP_BOX_FILL_OPACITY = 0.22;
export const MAP_BOX_BORDER_WIDTH_PX = 2;
export const MAP_BOX_BORDER_WIDTH_SELECTED_PX = 3;
export const MAP_CREATE_DRAG_THRESHOLD_PX = 4;

/** Stored box colours must match this pattern after normalization. */
export const STORED_HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/;

const HEX_SHORT_PATTERN = /^#([0-9A-Fa-f]{3})$/;
const HEX_LONG_PATTERN = /^#([0-9A-Fa-f]{6})$/;

export function isValidHexColor(value: string): boolean {
  const trimmed = value.trim();
  return HEX_SHORT_PATTERN.test(trimmed) || HEX_LONG_PATTERN.test(trimmed);
}

export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  const shortMatch = trimmed.match(HEX_SHORT_PATTERN);
  if (shortMatch) {
    const [r, g, b] = shortMatch[1]!;
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  const longMatch = trimmed.match(HEX_LONG_PATTERN);
  if (longMatch) {
    return `#${longMatch[1]!.toUpperCase()}`;
  }

  return null;
}

export function isStoredHexColor(value: string): boolean {
  return STORED_HEX_COLOR_PATTERN.test(value);
}

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = normalizeHexColor(hex) ?? MAP_BOX_DEFAULT_COLOR;
  const value = normalized.slice(1);
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function resolveMapBoxColor(color: string | undefined): string {
  return normalizeHexColor(color ?? MAP_BOX_DEFAULT_COLOR) ?? MAP_BOX_DEFAULT_COLOR;
}

/** Pick black or white label text for readable contrast on the box fill. */
export function getContrastTextColor(hex: string): "#000000" | "#FFFFFF" {
  const normalized = resolveMapBoxColor(hex);
  const value = normalized.slice(1);
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.58 ? "#000000" : "#FFFFFF";
}
