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

export type HsvColor = {
  /** Hue in degrees, 0–360. */
  h: number;
  /** Saturation, 0–1. */
  s: number;
  /** Value / brightness, 0–1. */
  v: number;
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = resolveMapBoxColor(hex).slice(1);
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

export function hexToHsv(hex: string): HsvColor {
  const { r, g, b } = hexToRgb(hex);
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;

  let h = 0;
  if (delta !== 0) {
    if (max === rr) h = ((gg - bb) / delta) % 6;
    else if (max === gg) h = (bb - rr) / delta + 2;
    else h = (rr - gg) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  return { h, s, v: max };
}

export function hsvToHex(h: number, s: number, v: number): string {
  const hh = ((h % 360) + 360) % 360;
  const ss = clamp01(s);
  const vv = clamp01(v);
  const c = vv * ss;
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1));
  const m = vv - c;

  let r = 0;
  let g = 0;
  let b = 0;
  if (hh < 60) [r, g, b] = [c, x, 0];
  else if (hh < 120) [r, g, b] = [x, c, 0];
  else if (hh < 180) [r, g, b] = [0, c, x];
  else if (hh < 240) [r, g, b] = [0, x, c];
  else if (hh < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toByte = (channel: number) =>
    Math.round((channel + m) * 255)
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}
