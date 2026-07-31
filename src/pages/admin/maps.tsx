import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AdminPageLayout from "@/components/admin-page-layout.tsx";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import {
  ADMIN_MAP_IMAGE_PATH,
  ADMIN_MAP_IMAGE_SIZE,
} from "@/lib/maps/constants";
import {
  serializePoisAsTypeScript,
  SPRINGFIELD_POIS_HD,
} from "@/lib/maps/springfield-pois-hd";
import type { MapPoi } from "@/lib/maps/springfield-pois";
import MapPoiOverlay from "@/pages/maps/_components/map-poi-overlay.tsx";
import { cn } from "@/lib/utils.ts";
import { toast } from "sonner";
import { Copy, RotateCcw } from "lucide-react";

const STORAGE_KEY = "admin-maps-pois-hd-draft-v1";

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function loadDraft(): MapPoi[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MapPoi[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

function pointToNormalized(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): { x: number; y: number } {
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  };
}

function AdminMapsPoiEditor() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [pois, setPois] = useState<MapPoi[]>(
    () => loadDraft() ?? SPRINGFIELD_POIS_HD.map((poi) => ({ ...poi })),
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    SPRINGFIELD_POIS_HD[0]?.id ?? null,
  );
  const dragRef = useRef<{
    id: string;
    grabOffset: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pois));
  }, [pois]);

  const selected = useMemo(
    () => pois.find((poi) => poi.id === selectedId) ?? null,
    [pois, selectedId],
  );

  const updatePoi = useCallback((id: string, patch: Partial<MapPoi>) => {
    setPois((prev) =>
      prev.map((poi) => (poi.id === id ? { ...poi, ...patch } : poi)),
    );
  }, []);

  const handlePointerDown = (
    poi: MapPoi,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectedId(poi.id);
    const point = pointToNormalized(event.clientX, event.clientY, rect);
    dragRef.current = {
      id: poi.id,
      grabOffset: { x: point.x - poi.x, y: point.y - poi.y },
    };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!drag || !rect) return;
    const point = pointToNormalized(event.clientX, event.clientY, rect);
    updatePoi(drag.id, {
      x: clamp01(point.x - drag.grabOffset.x),
      y: clamp01(point.y - drag.grabOffset.y),
    });
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const handleCopy = async () => {
    const source = serializePoisAsTypeScript(pois);
    try {
      await navigator.clipboard.writeText(source);
      toast.success("POI TypeScript copied to clipboard");
    } catch {
      toast.error("Could not copy — select and copy from the export box");
    }
  };

  const handleReset = () => {
    setPois(SPRINGFIELD_POIS_HD.map((poi) => ({ ...poi })));
    localStorage.removeItem(STORAGE_KEY);
    toast.success("Reset to starter HD POI positions");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={() => void handleCopy()}>
          <Copy className="h-3.5 w-3.5" aria-hidden />
          Copy TypeScript
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={handleReset}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Reset draft
        </Button>
        <span className="text-xs text-muted-foreground">
          {ADMIN_MAP_IMAGE_SIZE.width}×{ADMIN_MAP_IMAGE_SIZE.height} production
          map — drag labels, then copy into springfield-pois.ts
        </span>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <div className="relative mx-auto w-full max-w-[min(100%,2400px)]">
          <div
            ref={stageRef}
            className="relative aspect-square w-full touch-none overflow-hidden rounded-lg border bg-muted"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <img
              src={ADMIN_MAP_IMAGE_PATH}
              alt="Springfield Reload map"
              className="absolute inset-0 h-full w-full object-fill"
              draggable={false}
            />
            {/* Read-only preview under the drag handles */}
            <MapPoiOverlay pois={pois} />
            {pois.map((poi) => (
              <button
                key={poi.id}
                type="button"
                aria-label={`Move ${poi.label}`}
                aria-pressed={selectedId === poi.id}
                className={cn(
                  "absolute z-20 -translate-x-1/2 -translate-y-1/2 rounded-sm border border-transparent",
                  "h-8 min-w-[4rem] cursor-grab touch-manipulation active:cursor-grabbing",
                  selectedId === poi.id
                    ? "border-primary bg-primary/15 ring-2 ring-primary"
                    : "hover:border-white/50 hover:bg-black/20",
                )}
                style={{
                  left: `${poi.x * 100}%`,
                  top: `${poi.y * 100}%`,
                  width: `${poi.width * 100}%`,
                }}
                onPointerDown={(event) => handlePointerDown(poi, event)}
              />
            ))}
          </div>
        </div>

        <div className="space-y-3 rounded-lg border bg-card p-3">
          <p className="text-xs font-medium text-muted-foreground">POIs</p>
          <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
            {pois.map((poi) => (
              <li key={poi.id}>
                <button
                  type="button"
                  className={cn(
                    "w-full rounded-md px-2 py-1.5 text-left hover:bg-muted",
                    selectedId === poi.id && "bg-muted font-medium",
                  )}
                  onClick={() => setSelectedId(poi.id)}
                >
                  {poi.label}
                </button>
              </li>
            ))}
          </ul>

          {selected ? (
            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-medium">{selected.label}</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="poi-x" className="text-xs">
                    x
                  </Label>
                  <Input
                    id="poi-x"
                    type="number"
                    step="0.001"
                    min={0}
                    max={1}
                    value={Number(selected.x.toFixed(4))}
                    onChange={(event) =>
                      updatePoi(selected.id, {
                        x: clamp01(Number(event.target.value)),
                      })
                    }
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="poi-y" className="text-xs">
                    y
                  </Label>
                  <Input
                    id="poi-y"
                    type="number"
                    step="0.001"
                    min={0}
                    max={1}
                    value={Number(selected.y.toFixed(4))}
                    onChange={(event) =>
                      updatePoi(selected.id, {
                        y: clamp01(Number(event.target.value)),
                      })
                    }
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label htmlFor="poi-width" className="text-xs">
                    width
                  </Label>
                  <Input
                    id="poi-width"
                    type="number"
                    step="0.01"
                    min={0.05}
                    max={0.5}
                    value={Number(selected.width.toFixed(4))}
                    onChange={(event) =>
                      updatePoi(selected.id, {
                        width: Math.min(
                          0.5,
                          Math.max(0.05, Number(event.target.value)),
                        ),
                      })
                    }
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Draft saves in this browser. When positions look right, copy the TypeScript
        into <code className="rounded bg-muted px-1">springfield-pois.ts</code> to
        update the public dropmap labels.
      </p>
    </div>
  );
}

export default function AdminMapsPage() {
  return (
    <AdminPageLayout
      requireAdmin
      title="Dropmap POIs"
      description="Retune POI labels on the production dropmap asset."
      maxWidth="wide"
    >
      <AdminMapsPoiEditor />
    </AdminPageLayout>
  );
}
