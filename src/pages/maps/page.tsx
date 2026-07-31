import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "@/convex/_generated/api.js";
import PageShell from "@/components/page-shell.tsx";
import PageHeader from "@/components/page-header.tsx";
import { Card, CardContent } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import {
  ErrorState,
  ErrorStateContent,
  ErrorStateDescription,
  ErrorStateHeader,
  ErrorStateMedia,
  ErrorStateTitle,
} from "@/components/ui/error-state.tsx";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.tsx";
import { toast } from "sonner";
import { MapIcon } from "lucide-react";
import { BASE_MAPS } from "@/lib/maps/constants";
import { boxesEqual } from "@/lib/maps/coordinates";
import type { MapBox, SaveMapResult } from "@/lib/maps/types";
import MapEditor from "./_components/map-editor.tsx";
import MapToolbar from "./_components/map-toolbar.tsx";

const CONFLICT_MESSAGE =
  "This shared map changed elsewhere. Reload from the server before saving again.";

export function SharedMapPage() {
  const { mapId } = useParams<{ mapId: string }>();
  const navigate = useNavigate();

  const createMap = useMutation(api.maps.mutations.createMap);
  const saveMap = useMutation(api.maps.mutations.saveMap);

  const isNewRoute = mapId === "new";
  const resolvedMapId = isNewRoute ? undefined : mapId;

  const serverMap = useQuery(
    api.maps.queries.getByMapId,
    resolvedMapId ? { mapId: resolvedMapId } : "skip",
  );

  const [localBoxes, setLocalBoxes] = useState<MapBox[]>([]);
  const [savedBoxes, setSavedBoxes] = useState<MapBox[]>([]);
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<number | null>(null);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [hydratedForMapId, setHydratedForMapId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [imageMissing, setImageMissing] = useState(false);
  const [reloadDialogOpen, setReloadDialogOpen] = useState(false);
  const [isBootstrappingNewMap, setIsBootstrappingNewMap] = useState(isNewRoute);

  const isDirty = useMemo(
    () => !boxesEqual(localBoxes, savedBoxes),
    [localBoxes, savedBoxes],
  );

  useEffect(() => {
    if (!isNewRoute) return;

    let cancelled = false;
    setIsBootstrappingNewMap(true);

    void createMap({})
      .then((result) => {
        if (cancelled) return;
        navigate(`/maps/${result.mapId}`, { replace: true });
      })
      .catch(() => {
        if (cancelled) return;
        toast.error("Failed to create a new map");
        setIsBootstrappingNewMap(false);
      });

    return () => {
      cancelled = true;
    };
  }, [createMap, isNewRoute, navigate]);

  useEffect(() => {
    if (!resolvedMapId) return;
    setHydratedForMapId(null);
    setSelectedBoxId(null);
    setImageMissing(false);
  }, [resolvedMapId]);

  useEffect(() => {
    if (!resolvedMapId || !serverMap || serverMap.mapId !== resolvedMapId) return;
    if (hydratedForMapId === resolvedMapId) return;

    setLocalBoxes(serverMap.boxes);
    setSavedBoxes(serverMap.boxes);
    setExpectedUpdatedAt(serverMap.updatedAt);
    setHydratedForMapId(resolvedMapId);
  }, [hydratedForMapId, resolvedMapId, serverMap]);

  const applyServerSnapshot = useCallback((boxes: MapBox[], updatedAt: number) => {
    setLocalBoxes(boxes);
    setSavedBoxes(boxes);
    setExpectedUpdatedAt(updatedAt);
    setSelectedBoxId(null);
  }, []);

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (!resolvedMapId || expectedUpdatedAt == null) return false;
    if (!isDirty) return true;

    setIsSaving(true);
    try {
      const result = (await saveMap({
        mapId: resolvedMapId,
        expectedUpdatedAt,
        boxes: localBoxes,
      })) as SaveMapResult;

      if (!result.ok) {
        toast.error(CONFLICT_MESSAGE);
        return false;
      }

      applyServerSnapshot(result.boxes, result.updatedAt);
      toast.success("Map saved");
      return true;
    } catch {
      toast.error("Failed to save map");
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [
    applyServerSnapshot,
    expectedUpdatedAt,
    isDirty,
    localBoxes,
    resolvedMapId,
    saveMap,
  ]);

  const handleCopyLink = useCallback(async () => {
    const saved = await handleSave();
    if (!saved) return;

    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Failed to copy link");
    }
  }, [handleSave]);

  const handleNewMap = useCallback(() => {
    navigate("/maps/new");
  }, [navigate]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedBoxId) return;
    setLocalBoxes((current) => current.filter((box) => box.id !== selectedBoxId));
    setSelectedBoxId(null);
  }, [selectedBoxId]);

  const performReloadFromServer = useCallback(() => {
    if (!serverMap) return;
    applyServerSnapshot(serverMap.boxes, serverMap.updatedAt);
    if (resolvedMapId) {
      setHydratedForMapId(resolvedMapId);
    }
    toast.success("Reloaded from server");
  }, [applyServerSnapshot, resolvedMapId, serverMap]);

  const handleReloadFromServer = useCallback(() => {
    if (!serverMap) return;
    if (isDirty) {
      setReloadDialogOpen(true);
      return;
    }
    performReloadFromServer();
  }, [isDirty, performReloadFromServer, serverMap]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (!selectedBoxId) return;
      event.preventDefault();
      handleDeleteSelected();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleDeleteSelected, selectedBoxId]);

  if (isNewRoute && isBootstrappingNewMap) {
    return (
      <PageShell maxWidth="wide">
        <PageHeader
          title="Simpsons Reload Strategy Map"
          description="Creating a new shared map…"
          icon={MapIcon}
        />
        <Card>
          <CardContent className="space-y-3 py-8">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-[50vh] w-full" />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (!resolvedMapId) {
    return null;
  }

  if (serverMap === undefined || hydratedForMapId !== resolvedMapId) {
    return (
      <PageShell maxWidth="wide">
        <PageHeader
          title="Simpsons Reload Strategy Map"
          description="Loading shared map…"
          icon={MapIcon}
        />
        <Card>
          <CardContent className="space-y-3 py-8">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-[50vh] w-full" />
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (serverMap === null) {
    return (
      <PageShell maxWidth="wide">
        <PageHeader title="Simpsons Reload Strategy Map" icon={MapIcon} />
        <ErrorState>
          <ErrorStateHeader>
            <ErrorStateMedia />
            <ErrorStateTitle>Map not found</ErrorStateTitle>
            <ErrorStateDescription>
              This shared map link is invalid or no longer exists.
            </ErrorStateDescription>
          </ErrorStateHeader>
          <ErrorStateContent>
            <button
              type="button"
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              onClick={handleNewMap}
            >
              Create a new map
            </button>
          </ErrorStateContent>
        </ErrorState>
      </PageShell>
    );
  }

  const baseMap = BASE_MAPS[serverMap.baseMapId];

  return (
    <PageShell maxWidth="wide">
      <PageHeader
        title={`${baseMap.label} Strategy Map`}
        description="Draw boxes, label them, save, and share the URL with your team."
        icon={MapIcon}
        actions={
          <MapToolbar
            isDirty={isDirty}
            isSaving={isSaving}
            hasSelection={selectedBoxId != null}
            onNew={handleNewMap}
            onSave={() => void handleSave()}
            onCopyLink={() => void handleCopyLink()}
            onDeleteSelected={handleDeleteSelected}
            onReloadFromServer={handleReloadFromServer}
            canReloadFromServer={serverMap != null}
          />
        }
      />

      <Card>
        <CardContent className="py-4">
          {imageMissing ? (
            <ErrorState>
              <ErrorStateHeader>
                <ErrorStateMedia />
                <ErrorStateTitle>Map image missing</ErrorStateTitle>
                <ErrorStateDescription>
                  Add the Simpsons Reload map image at{" "}
                  <code className="rounded bg-muted px-1 py-0.5 text-xs">
                    public/assets/maps/springfield-reload-map.webp
                  </code>{" "}
                  and refresh this page.
                </ErrorStateDescription>
              </ErrorStateHeader>
            </ErrorState>
          ) : (
            <MapEditor
              boxes={localBoxes}
              selectedBoxId={selectedBoxId}
              onBoxesChange={setLocalBoxes}
              onSelectedBoxIdChange={setSelectedBoxId}
              imageSrc={baseMap.imagePath}
              onImageMissing={() => setImageMissing(true)}
            />
          )}
        </CardContent>
      </Card>

      <AlertDialog open={reloadDialogOpen} onOpenChange={setReloadDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reload from server?</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes. Reloading will discard local edits and replace them
              with the latest saved map.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                performReloadFromServer();
                setReloadDialogOpen(false);
              }}
            >
              Reload
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}
