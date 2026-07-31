import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input.tsx";
import {
  hexToHsv,
  hsvToHex,
  isValidHexColor,
  normalizeHexColor,
  resolveMapBoxColor,
  type HsvColor,
} from "@/lib/maps/box-color.ts";
import { cn } from "@/lib/utils.ts";

const HUE_GRADIENT =
  "linear-gradient(to right, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)";

type MapColorPickerProps = {
  color: string;
  disabled?: boolean;
  onColorChange: (color: string) => void;
};

function hsvFromColor(color: string): HsvColor {
  return hexToHsv(resolveMapBoxColor(color));
}

function isCompleteLongHex(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value.trim());
}

export default function MapColorPicker({
  color,
  disabled = false,
  onColorChange,
}: MapColorPickerProps) {
  const [hsv, setHsv] = useState<HsvColor>(() => hsvFromColor(color));
  const [hexDraft, setHexDraft] = useState(resolveMapBoxColor(color));
  const svRef = useRef<HTMLDivElement>(null);
  const hexFocusedRef = useRef(false);
  const hsvRef = useRef(hsv);
  hsvRef.current = hsv;

  useEffect(() => {
    if (hexFocusedRef.current) return;
    const next = resolveMapBoxColor(color);
    setHexDraft(next);
    setHsv(hexToHsv(next));
  }, [color]);

  const commitHsv = (next: HsvColor) => {
    hsvRef.current = next;
    setHsv(next);
    const hex = hsvToHex(next.h, next.s, next.v);
    if (!hexFocusedRef.current) {
      setHexDraft(hex);
    }
    onColorChange(hex);
  };

  const updateSvFromPointer = (clientX: number, clientY: number) => {
    const el = svRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const s = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const v = Math.min(1, Math.max(0, 1 - (clientY - rect.top) / rect.height));
    commitHsv({ ...hsvRef.current, s, v });
  };

  const handleSvPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateSvFromPointer(event.clientX, event.clientY);
  };

  const handleSvPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
    event.preventDefault();
    event.stopPropagation();
    updateSvFromPointer(event.clientX, event.clientY);
  };

  const handleHexChange = (value: string) => {
    setHexDraft(value);
    // Only live-commit full #RRGGBB so typing #FAE904 is not hijacked at #FAE.
    if (!isCompleteLongHex(value)) return;
    const normalized = normalizeHexColor(value);
    if (!normalized) return;
    setHsv(hexToHsv(normalized));
    onColorChange(normalized);
  };

  const handleHexBlur = () => {
    hexFocusedRef.current = false;
    const normalized = normalizeHexColor(hexDraft);
    if (normalized) {
      setHexDraft(normalized);
      setHsv(hexToHsv(normalized));
      onColorChange(normalized);
      return;
    }
    setHexDraft(resolveMapBoxColor(color));
  };

  const hueColor = hsvToHex(hsv.h, 1, 1);
  const hexInvalid = hexDraft.trim().length > 0 && !isValidHexColor(hexDraft);

  return (
    <div
      className="flex w-[min(16rem,100%)] touch-auto flex-col gap-2 px-2 py-2"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div
        ref={svRef}
        role="slider"
        aria-label="Colour saturation and brightness"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(hsv.s * 100)}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        className={cn(
          "relative h-32 w-full touch-none rounded-md border border-border sm:h-28",
          disabled ? "cursor-not-allowed opacity-50" : "cursor-crosshair",
        )}
        style={{
          background: `
            linear-gradient(to top, #000, transparent),
            linear-gradient(to right, #fff, ${hueColor})
          `,
        }}
        onPointerDown={handleSvPointerDown}
        onPointerMove={handleSvPointerMove}
      >
        <div
          className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow sm:h-3.5 sm:w-3.5"
          style={{
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`,
            backgroundColor: hsvToHex(hsv.h, hsv.s, hsv.v),
          }}
        />
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[11px] font-medium text-muted-foreground">Hue</span>
        <input
          type="range"
          min={0}
          max={360}
          step={1}
          value={Math.round(hsv.h)}
          disabled={disabled}
          aria-label="Hue"
          className={cn(
            "h-5 w-full cursor-pointer touch-manipulation appearance-none rounded-full border border-border disabled:cursor-not-allowed disabled:opacity-50 sm:h-3",
            "[&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:shadow sm:[&::-webkit-slider-thumb]:h-3.5 sm:[&::-webkit-slider-thumb]:w-3.5",
            "[&::-moz-range-thumb]:h-5 [&::-moz-range-thumb]:w-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-foreground sm:[&::-moz-range-thumb]:h-3.5 sm:[&::-moz-range-thumb]:w-3.5",
          )}
          style={{ background: HUE_GRADIENT }}
          onPointerDown={(event) => event.stopPropagation()}
          onChange={(event) =>
            commitHsv({ ...hsv, h: Number(event.target.value) })
          }
        />
      </label>

      <div className="flex items-center gap-2">
        <div
          className="h-10 w-10 shrink-0 rounded-md border border-border sm:h-8 sm:w-8"
          style={{ backgroundColor: hsvToHex(hsv.h, hsv.s, hsv.v) }}
          aria-hidden
        />
        <Input
          value={hexDraft}
          disabled={disabled}
          aria-label="Hex colour"
          aria-invalid={hexInvalid}
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="characters"
          inputMode="text"
          enterKeyHint="done"
          // text-base avoids iOS zoom-on-focus; desktop can stay compact.
          className="h-10 touch-manipulation font-mono text-base uppercase sm:h-8 sm:text-xs"
          onPointerDown={(event) => event.stopPropagation()}
          onFocus={() => {
            hexFocusedRef.current = true;
          }}
          onBlur={handleHexBlur}
          onChange={(event) => handleHexChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
        />
      </div>
    </div>
  );
}
