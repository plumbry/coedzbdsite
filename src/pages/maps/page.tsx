import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
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
import { shouldIgnoreMapEditorShortcut } from "@/lib/maps/box-actions";
import { migrateLegacyBoxLabelsToTexts, textsEqual } from "@/lib/maps/boxes";
import { boxesReducer } from "@/lib/maps/boxes-reducer";
import { boxesEqual } from "@/lib/maps/coordinates";
import {
  buildMapShareUrl,
  copyMapShareLink,
  getSaveAndCopyToastMessage,
  type SaveAndCopyOutcome,
} from "@/lib/maps/share-link";
import type {
  EditorTool,
  MapBox,
  MapText,
  SaveMapResult,
  SelectedObject,
} from "@/lib/maps/types";
import { resolveMapBoxColor } from "@/lib/maps/box-color";
import MapEditor from "./_components/map-editor.tsx";
import MapHeaderActions from "./_components/map-header-actions.tsx";

const PAGE_TITLE = "Simpsons Reload Dropmap";
/** Stable client key for the /maps/new scratchpad (never a server map id). */
const SCRATCHPAD_KEY = "new";

export function SharedMapPage() {
  const { mapId } = useParams<{ mapId: string }>();
  const navigate = useNavigate();

  const saveMap = useMutation(api.maps.mutations.saveMap);

  const isNewRoute = mapId === "new";
  const resolvedMapId = isNewRoute ? undefined : mapId;

  const serverMap = useQuery(
    api.maps.queries.getByMapId,
    resolvedMapId ? { mapId: resolvedMapId } : "skip",
  );

  const [localBoxes, dispatchBoxes] = useReducer(boxesReducer, []);
  const [localTexts, setLocalTexts] = useState<MapText[]>([]);
  const [savedBoxes, setSavedBoxes] = useState<MapBox[]>([]);
  const [savedTexts, setSavedTexts] = useState<MapText[]>([]);
  const [expectedUpdatedAt, setExpectedUpdatedAt] = useState<number | null>(null);
  const [selection, setSelection] = useState<SelectedObject>(null);
  const localBoxesRef = useRef(localBoxes);
  const localTextsRef = useRef(localTexts);
  const selectionRef = useRef(selection);
  localBoxesRef.current = localBoxes;
  localTextsRef.current = localTexts;
  selectionRef.current = selection;
  const [tool, setTool] = useState<EditorTool>("rect");
  const [hydratedForMapId, setHydratedForMapId] = useState<string | null>(
    isNewRoute ? SCRATCHPAD_KEY : null,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [imageMissing, setImageMissing] = useState(false);
  const [reloadDialogOpen, setReloadDialogOpen] = useState(false);
  // Once true for the current mapId, server snapshots must not replace local boxes.
  const lockHydrationRef = useRef(isNewRoute);
  /** Tracks which mapId the local editor state currently belongs to. */
  const activeMapIdRef = useRef<string | null>(isNewRoute ? SCRATCHPAD_KEY : null);

  const isDirty = useMemo(
    () => !boxesEqual(localBoxes, savedBoxes) || !textsEqual(localTexts, savedTexts),
    [localBoxes, localTexts, savedBoxes, savedTexts],
  );

  const handleSelectedColorChange = useCallback((color: string) => {
    const currentSelection = selectionRef.current;
    if (!currentSelection) return;
    const resolved = resolveMapBoxColor(color);
    if (currentSelection.type === "box") {
      const current = localBoxesRef.current.find((box) => box.id === currentSelection.id);
      if (!current) return;
      dispatchBoxes({
        type: "patch",
        id: currentSelection.id,
        box: { ...current, color: resolved },
      });
      return;
    }
    setLocalTexts((prev) =>
      prev.map((textItem) =>
        textItem.id === currentSelection.id
          ? { ...textItem, color: resolved }
          : textItem,
      ),
    );
  }, []);

  const resetLocalEditorState = useCallback(() => {
    dispatchBoxes({ type: "hydrate", boxes: [] });
    setLocalTexts([]);
    setSavedBoxes([]);
    setSavedTexts([]);
    setExpectedUpdatedAt(null);
    setSelection(null);
    setHydratedForMapId(null);
    lockHydrationRef.current = false;
  }, []);

  const prepareScratchpad = useCallback(() => {
    activeMapIdRef.current = SCRATCHPAD_KEY;
    dispatchBoxes({ type: "hydrate", boxes: [] });
    setLocalTexts([]);
    setSavedBoxes([]);
    setSavedTexts([]);
    setExpectedUpdatedAt(null);
    setSelection(null);
    setHydratedForMapId(SCRATCHPAD_KEY);
    lockHydrationRef.current = true;
    setImageMissing(false);
  }, []);

  // /maps/new is a shared URL that always stays put — local-only until Save.
  useEffect(() => {
    if (!isNewRoute) return;
    prepareScratchpad();
  }, [isNewRoute, prepareScratchpad]);

  useEffect(() => {
    if (!resolvedMapId) return;
    setImageMissing(false);

    if (activeMapIdRef.current === resolvedMapId) {
      lockHydrationRef.current = true;
      return;
    }

    // Switching maps: clear annotations immediately so a prior map's boxes
    // cannot flash (or stick) before the empty server snapshot hydrates.
    activeMapIdRef.current = resolvedMapId;
    resetLocalEditorState();
  }, [resetLocalEditorState, resolvedMapId]);

  const hydrateFromServer = useCallback(
    (
      boxes: Array<Omit<MapBox, "color"> & { color?: string; label?: string }>,
      texts: Array<Omit<MapText, "color"> & { color?: string }> | undefined,
      updatedAt: number,
    ) => {
      const migrated = migrateLegacyBoxLabelsToTexts(boxes, texts);
      dispatchBoxes({ type: "hydrate", boxes: migrated.boxes });
      setLocalTexts(migrated.texts);
      setSavedBoxes(migrated.boxes);
      setSavedTexts(migrated.texts);
      setExpectedUpdatedAt(updatedAt);
      setSelection(null);
    },
    [],
  );

  useEffect(() => {
    if (!resolvedMapId || !serverMap || serverMap.mapId !== resolvedMapId) return;
    if (hydratedForMapId === resolvedMapId || lockHydrationRef.current) return;

    hydrateFromServer(serverMap.boxes, serverMap.texts, serverMap.updatedAt);
    lockHydrationRef.current = true;
    setHydratedForMapId(resolvedMapId);
  }, [hydrateFromServer, hydratedForMapId, resolvedMapId, serverMap]);

  const publishAndCopyLink = useCallback(async () => {
    const boxes = localBoxesRef.current;
    const texts = localTextsRef.current;
    if (boxes.length === 0 && texts.length === 0) {
      toast.error("Add a box or text before saving");
      return;
    }

    setIsSaving(true);
    try {
      const result = (await saveMap({
        sourceMapId: resolvedMapId,
        boxes,
        texts,
      })) as SaveMapResult;

      const shareUrl = buildMapShareUrl(window.location.origin, result.mapId);
      const copied = await copyMapShareLink(shareUrl);
      const outcome: SaveAndCopyOutcome = copied
        ? "saved-and-copied"
        : "saved-copy-failed";
      toast.success(getSaveAndCopyToastMessage(outcome));

      if (isNewRoute) {
        // Stay on /maps/new and clear so the next person gets a blank canvas.
        prepareScratchpad();
        return;
      }

      // Shared map: open the new frozen iteration URL.
      activeMapIdRef.current = result.mapId;
      hydrateFromServer(result.boxes, result.texts, result.updatedAt);
      lockHydrationRef.current = true;
      setHydratedForMapId(result.mapId);
      navigate(`/maps/${result.mapId}`, { replace: true });
    } catch {
      toast.error(getSaveAndCopyToastMessage("save-failed"));
    } finally {
      setIsSaving(false);
    }
  }, [
    hydrateFromServer,
    isNewRoute,
    navigate,
    prepareScratchpad,
    resolvedMapId,
    saveMap,
  ]);

  const handleCopyLink = useCallback(async () => {
    if (isNewRoute) {
      // Scratchpad has no stable link until Save publishes one.
      await publishAndCopyLink();
      return;
    }
    if (!resolvedMapId) return;
    const shareUrl = buildMapShareUrl(window.location.origin, resolvedMapId);
    const copied = await copyMapShareLink(shareUrl);
    const outcome: SaveAndCopyOutcome = copied ? "copied-only" : "copy-failed";
    const message = getSaveAndCopyToastMessage(outcome);
    if (outcome === "copy-failed") {
      toast.error(message);
      return;
    }
    toast.success(message);
  }, [isNewRoute, publishAndCopyLink, resolvedMapId]);

  const handleSaveAndCopyLink = useCallback(async () => {
    // Always publish a brand-new share URL. Shared links stay frozen; /maps/new
    // stays put and clears after publish.
    await publishAndCopyLink();
  }, [publishAndCopyLink]);

  const handleNewMap = useCallback(() => {
    if (isNewRoute) {
      prepareScratchpad();
      toast.success("Canvas cleared");
      return;
    }
    navigate("/maps/new");
  }, [isNewRoute, navigate, prepareScratchpad]);

  const handleDeleteSelected = useCallback(() => {
    const current = selectionRef.current;
    if (!current) return;
    if (current.type === "box") {
      dispatchBoxes({ type: "remove", id: current.id });
    } else {
      setLocalTexts((prev) => prev.filter((textItem) => textItem.id !== current.id));
    }
    setSelection(null);
  }, []);

  const performReloadFromServer = useCallback(() => {
    if (!serverMap || !resolvedMapId) return;
    lockHydrationRef.current = false;
    hydrateFromServer(serverMap.boxes, serverMap.texts, serverMap.updatedAt);
    lockHydrationRef.current = true;
    setHydratedForMapId(resolvedMapId);
    toast.success("Reloaded from server");
  }, [hydrateFromServer, resolvedMapId, serverMap]);

  const handleReloadFromServer = useCallback(() => {
    if (isNewRoute) {
      prepareScratchpad();
      toast.success("Canvas cleared");
      return;
    }
    if (!serverMap) return;
    if (isDirty) {
      setReloadDialogOpen(true);
      return;
    }
    performReloadFromServer();
  }, [isDirty, isNewRoute, performReloadFromServer, prepareScratchpad, serverMap]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete") return;
      if (shouldIgnoreMapEditorShortcut(event.target)) return;
      if (!selectionRef.current) return;
      event.preventDefault();
      handleDeleteSelected();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleDeleteSelected]);

  const isHydrated = isNewRoute
    ? hydratedForMapId === SCRATCHPAD_KEY
    : hydratedForMapId === resolvedMapId;

  if (!isNewRoute && !resolvedMapId) {
    return null;
  }

  if (!isNewRoute && !isHydrated && serverMap === undefined) {
    return (
      <PageShell maxWidth="wide">
        <PageHeader
          title={PAGE_TITLE}
          description="Loading shared dropmap…"
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

  if (!isNewRoute && !isHydrated && serverMap === null) {
    return (
      <PageShell maxWidth="wide">
        <PageHeader title={PAGE_TITLE} icon={MapIcon} />
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

  if (!isHydrated) {
    return (
      <PageShell maxWidth="wide">
        <PageHeader
          title={PAGE_TITLE}
          description="Loading shared dropmap…"
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

  const baseMap = BASE_MAPS[serverMap?.baseMapId ?? "simpsons-reload"];

  return (
    <PageShell maxWidth="wide">
      <PageHeader
        title={PAGE_TITLE}
        description={
          isNewRoute
            ? "Shared scratchpad — Save publishes a new link and clears the canvas for the next person."
            : "Edit freely — Save always creates a new share link so the original stays unchanged."
        }
        icon={MapIcon}
        actions={
          <MapHeaderActions
            onNew={handleNewMap}
            onCopyLink={() => void handleCopyLink()}
            onReloadFromServer={handleReloadFromServer}
            canReloadFromServer={!isNewRoute && serverMap != null}
            isSaving={isSaving}
            newLabel={isNewRoute ? "Clear" : "New"}
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
              texts={localTexts}
              selection={selection}
              tool={tool}
              onToolChange={setTool}
              onBoxesAction={dispatchBoxes}
              onTextsChange={setLocalTexts}
              onSelectionChange={setSelection}
              onSelectedColorChange={handleSelectedColorChange}
              onDeleteSelected={handleDeleteSelected}
              onSave={() => void handleSaveAndCopyLink()}
              isSaving={isSaving}
              isDirty={isDirty}
              colorControlsDisabled={isSaving}
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
