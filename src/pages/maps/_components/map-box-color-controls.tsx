import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { isValidHexColor, normalizeHexColor } from "@/lib/maps/box-color.ts";

type MapBoxColorControlsProps = {
  color: string;
  onColorChange: (color: string) => void;
  disabled?: boolean;
};

export default function MapBoxColorControls({
  color,
  onColorChange,
  disabled = false,
}: MapBoxColorControlsProps) {
  const [hexDraft, setHexDraft] = useState(color);

  useEffect(() => {
    setHexDraft(color);
  }, [color]);

  const handleHexChange = (value: string) => {
    setHexDraft(value);
    const normalized = normalizeHexColor(value);
    if (normalized) {
      onColorChange(normalized);
    }
  };

  const handlePickerChange = (value: string) => {
    const normalized = normalizeHexColor(value);
    if (normalized) {
      onColorChange(normalized);
    }
  };

  const pickerValue = normalizeHexColor(hexDraft) ?? color;
  const hexInvalid = hexDraft.trim().length > 0 && !isValidHexColor(hexDraft);

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        <Label htmlFor="map-box-color-picker">Box colour</Label>
        <input
          id="map-box-color-picker"
          type="color"
          value={pickerValue}
          disabled={disabled}
          aria-label="Box colour picker"
          className="h-9 w-12 cursor-pointer rounded-md border border-input bg-background p-1 disabled:cursor-not-allowed disabled:opacity-50"
          onChange={(event) => handlePickerChange(event.target.value)}
        />
      </div>
      <div className="min-w-[8.5rem] flex-1 space-y-1">
        <Label htmlFor="map-box-color-hex">Hex</Label>
        <Input
          id="map-box-color-hex"
          value={hexDraft}
          disabled={disabled}
          aria-label="Box hex colour"
          aria-invalid={hexInvalid}
          spellCheck={false}
          autoCapitalize="characters"
          className="font-mono uppercase"
          onChange={(event) => handleHexChange(event.target.value)}
        />
      </div>
    </div>
  );
}
