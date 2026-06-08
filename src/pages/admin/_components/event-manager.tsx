import { useState, useRef, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { scrimSeriesAdminPath } from "@/lib/scrim-series-admin-path.ts";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Id } from "@/convex/_generated/dataModel.d.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Textarea } from "@/components/ui/textarea.tsx";
import { Checkbox } from "@/components/ui/checkbox.tsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select.tsx";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card.tsx";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table.tsx";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Loader2, Plus, Edit, Trash2, Calendar, Upload, X, FileDown, DollarSign, Lock, RefreshCw, ExternalLink, CheckCircle2, AlertCircle, Trophy, Check } from "lucide-react";
import { toast } from "sonner";
import {
  WORKFLOW_STATUS_LABELS,
  formatSetupReasons,
  workflowStatusBadgeVariant,
  type EventWorkflowStatus,
  type SetupReasonCode,
} from "@/lib/event-workflow.ts";
import { format } from "date-fns";
import { useUserRole } from "@/hooks/use-user-role.ts";
import ICSImportDialog from "./ics-import-dialog.tsx";
import ShowdownPenaltiesPanel from "./showdown-penalties-panel.tsx";
import { DEFAULT_PAGE_SIZE } from "@/hooks/use-client-pagination.ts";
import TablePagination from "@/components/table-pagination.tsx";

export default function EventManager() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin } = useUserRole();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<Id<"events"> | null>(null);
  const [editingLinkedImportCount, setEditingLinkedImportCount] = useState(0);
  const [deletingEvent, setDeletingEvent] = useState<Id<"events"> | null>(null);
  const [isICSImportOpen, setIsICSImportOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"all" | "scrim" | "minicup" | "season" | "mini-season" | "random-squads" | "random-trios" | "solos-meets-duos" | "scrim-series" | "showdown">("all");
  const [eventsTablePage, setEventsTablePage] = useState(1);
  const [isCreatingSeriesLink, setIsCreatingSeriesLink] = useState(false);

  useEffect(() => {
    setEventsTablePage(1);
  }, [typeFilter]);
  
  // Form state
  const [name, setName] = useState("");
  const [type, setType] = useState<"scrim" | "minicup" | "season" | "mini-season" | "random" | "random-squads" | "random-trios" | "solos-meets-duos" | "scrim-series" | "showdown">("scrim");
  const [mode, setMode] = useState<"ZB Main Map" | "Reload">("ZB Main Map");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [description, setDescription] = useState("");
  const [season, setSeason] = useState("");
  const [placementEarningsTopN, setPlacementEarningsTopN] = useState<number | undefined>(undefined);
  const [matchWinEarnings, setMatchWinEarnings] = useState<boolean>(false);
  const [duoPlacementEarningsTopN, setDuoPlacementEarningsTopN] = useState<number | undefined>(undefined);
  const [soloPlacementEarningsTopN, setSoloPlacementEarningsTopN] = useState<number | undefined>(undefined);
  const [isNoMoneyEvent, setIsNoMoneyEvent] = useState<boolean>(false);
  const [smdTeamSize, setSmdTeamSize] = useState<"duo" | "trio">("duo");
  const [bestNGames, setBestNGames] = useState<number | undefined>(undefined);
  const [seriesDurationWeeks, setSeriesDurationWeeks] = useState<3 | 6>(3);
  const [showdownBestWeeks, setShowdownBestWeeks] = useState<number>(2);
  const [penaltyAmount, setPenaltyAmount] = useState<number>(5);
  const [linkedScrimSeriesId, setLinkedScrimSeriesId] = useState<Id<"scrimSeries"> | "none">("none");
  
  // Compute status based on dates
  const computeStatus = (): "upcoming" | "ongoing" | "completed" => {
    if (!startDate || !endDate) return "upcoming";
    const now = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    if (now < start) {
      return "upcoming";
    } else if (now > end) {
      return "completed";
    } else {
      return "ongoing";
    }
  };
  
  const status = computeStatus();
  const [standardLeaderboards, setStandardLeaderboards] = useState<string[]>(["", "", "", ""]);
  const [qualifierLobby1, setQualifierLobby1] = useState<string[]>(["", "", "", ""]);
  const [qualifierLobby2, setQualifierLobby2] = useState<string[]>(["", "", "", ""]);
  const [finalsLeaderboards, setFinalsLeaderboards] = useState<string[]>(["", "", "", ""]);
  const MAX_LEADERBOARD_SLOTS = 12;
  const [dynamicPairDetection, setDynamicPairDetection] = useState(false);
  const [excludeLowestScore, setExcludeLowestScore] = useState(false);
  const [twoLobbies, setTwoLobbies] = useState(false);
  const [standardLeaderboardsLobby2, setStandardLeaderboardsLobby2] = useState<string[]>(["", "", "", ""]);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [uploadedImageId, setUploadedImageId] = useState<Id<"_storage"> | null>(null);
  const [currentImageId, setCurrentImageId] = useState<Id<"_storage"> | null>(null);
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const consumedEventDeepLink = useRef(false);

  const editingEventImageUrl = useQuery(
    api.events.management.getEventImageUrl,
    editingEvent && currentImageId ? { eventId: editingEvent } : "skip",
  );

  useEffect(() => {
    if (editingEventImageUrl) {
      setCurrentImageUrl(editingEventImageUrl);
    }
  }, [editingEventImageUrl]);

  const events = useQuery(api.events.management.getAllEvents, {
    resolveImageUrls: false,
  });
  const scrimSeriesOptions = useQuery(api.scrimSeries.queries.listSeries);
  const createEvent = useMutation(api.events.management.createEvent);
  const updateEvent = useMutation(api.events.management.updateEvent);
  const deleteEvent = useMutation(api.events.management.deleteEvent);
  const generateUploadUrl = useMutation(api.events.management.generateUploadUrl);
  const lockTiers = useMutation(api.events.showdown.lockTiers);
  const syncDiscordEvents = useAction(api.discord.eventSync.syncDiscordEvents);
  const createAndLinkSeries = useMutation(api.scrimSeries.mutations.createAndLinkToEvent);
  const setEventWorkflowStatus = useMutation(api.events.management.setEventWorkflowStatus);
  const [isLockingTiers, setIsLockingTiers] = useState(false);
  const [isSyncingDiscord, setIsSyncingDiscord] = useState(false);
  const [markingCompleteId, setMarkingCompleteId] = useState<Id<"events"> | null>(null);
  
  const openCreateDialog = () => {
    resetForm();
    setIsCreateOpen(true);
  };
  
  const openEditDialog = (event: {
    _id: Id<"events">;
    name: string;
    type: "scrim" | "minicup" | "season" | "mini-season" | "random" | "random-squads" | "random-trios" | "solos-meets-duos" | "scrim-series" | "showdown";
    mode: "ZB Main Map" | "Reload";
    startDate: string;
    endDate: string;
    description?: string;
    status: "upcoming" | "ongoing" | "completed";
    season?: string;
    placementEarningsTopN?: number;
    matchWinEarnings?: boolean;
    standardLeaderboards?: string[];
    standardLeaderboardsLobby2?: string[];
    twoLobbies?: boolean;
    qualifierLobby1Leaderboards?: string[];
    qualifierLobby2Leaderboards?: string[];
    finalsLeaderboards?: string[];
    dynamicPairDetection?: boolean;
    excludeLowestScore?: boolean;
    isNoMoneyEvent?: boolean;
    duoPlacementEarningsTopN?: number;
    soloPlacementEarningsTopN?: number;
    smdTeamSize?: "duo" | "trio";
    bestNGames?: number;
    seriesDurationWeeks?: 3 | 6;
    showdownBestWeeks?: number;
    penaltyAmount?: number;
    image?: Id<"_storage">;
    imageUrl?: string | null;
    linkedImportCount?: number;
    linkedScrimSeriesId?: Id<"scrimSeries">;
  }) => {
    setEditingEvent(event._id);
    setEditingLinkedImportCount(event.linkedImportCount ?? 0);
    setLinkedScrimSeriesId(event.linkedScrimSeriesId ?? "none");
    setName(event.name);
    setType(event.type);
    setMode(event.mode);
    setStartDate(event.startDate);
    setEndDate(event.endDate);
    setDescription(event.description || "");
    setSeason(event.season || "");
    setPlacementEarningsTopN(event.placementEarningsTopN);
    setMatchWinEarnings(event.matchWinEarnings || false);
    setDynamicPairDetection(event.dynamicPairDetection || false);
    setExcludeLowestScore(event.excludeLowestScore || false);
    setIsNoMoneyEvent(event.isNoMoneyEvent || false);
    setDuoPlacementEarningsTopN(event.duoPlacementEarningsTopN);
    setSoloPlacementEarningsTopN(event.soloPlacementEarningsTopN);
    setSmdTeamSize(event.smdTeamSize || "duo");
    setBestNGames(event.bestNGames);
    setSeriesDurationWeeks(event.seriesDurationWeeks || 3);
    setShowdownBestWeeks(event.showdownBestWeeks ?? 2);
    setPenaltyAmount(event.penaltyAmount ?? 5);
    
    // Set current image info
    setCurrentImageId(event.image || null);
    setCurrentImageUrl(event.imageUrl || null);
    
    // Fill standard leaderboards
    const stdBoards = event.standardLeaderboards ? [...event.standardLeaderboards] : [];
    while (stdBoards.length < 4) stdBoards.push("");
    setStandardLeaderboards(stdBoards);
    
    // Two lobbies
    setTwoLobbies(event.twoLobbies || false);
    const stdBoardsLobby2 = event.standardLeaderboardsLobby2 ? [...event.standardLeaderboardsLobby2] : [];
    while (stdBoardsLobby2.length < 4) stdBoardsLobby2.push("");
    setStandardLeaderboardsLobby2(stdBoardsLobby2);
    
    // Fill mini-season leaderboards
    const q1 = event.qualifierLobby1Leaderboards ? [...event.qualifierLobby1Leaderboards] : [];
    while (q1.length < 4) q1.push("");
    setQualifierLobby1(q1);
    
    const q2 = event.qualifierLobby2Leaderboards ? [...event.qualifierLobby2Leaderboards] : [];
    while (q2.length < 4) q2.push("");
    setQualifierLobby2(q2);
    
    const finals = event.finalsLeaderboards ? [...event.finalsLeaderboards] : [];
    while (finals.length < 4) finals.push("");
    setFinalsLeaderboards(finals);
  };

  const deepLinkEventId = searchParams.get("event");

  useEffect(() => {
    if (!events || !deepLinkEventId || consumedEventDeepLink.current) {
      return;
    }

    const event = events.find((e) => e._id === deepLinkEventId);
    if (!event) {
      toast.error("Event not found in Events Manager");
      consumedEventDeepLink.current = true;
      return;
    }

    consumedEventDeepLink.current = true;
    openEditDialog(event);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("event");
        return next;
      },
      { replace: true },
    );
  }, [deepLinkEventId, events, setSearchParams]);

  const resetForm = () => {
    setName("");
    setType("scrim");
    setMode("ZB Main Map");
    setStartDate("");
    setEndDate("");
    setDescription("");
    setSeason("");
    setPlacementEarningsTopN(undefined);
    setMatchWinEarnings(false);
    setDuoPlacementEarningsTopN(undefined);
    setSoloPlacementEarningsTopN(undefined);
    setIsNoMoneyEvent(false);
    setSmdTeamSize("duo");
    setBestNGames(undefined);
    setSeriesDurationWeeks(3);
    setShowdownBestWeeks(2);
    setPenaltyAmount(5);
    setLinkedScrimSeriesId("none");
    setStandardLeaderboards(["", "", "", ""]);
    setTwoLobbies(false);
    setStandardLeaderboardsLobby2(["", "", "", ""]);
    setQualifierLobby1(["", "", "", ""]);
    setQualifierLobby2(["", "", "", ""]);
    setFinalsLeaderboards(["", "", "", ""]);
    setDynamicPairDetection(false);
    setExcludeLowestScore(false);
    setSelectedImage(null);
    setUploadedImageId(null);
    setCurrentImageId(null);
    setCurrentImageUrl(null);
    setEditingEvent(null);
    setEditingLinkedImportCount(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  
  const handleImageSelect = async (file: File) => {
    setSelectedImage(file);
    
    // Upload immediately
    try {
      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await result.json();
      setUploadedImageId(storageId);
      toast.success("Image uploaded");
    } catch (error) {
      toast.error("Failed to upload image");
      setSelectedImage(null);
    }
  };
  
  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("Event name is required");
      return;
    }
    
    if (!startDate || !endDate) {
      toast.error("Start and end dates are required");
      return;
    }
    
    // Filter non-empty leaderboards
    const filteredStdBoards = standardLeaderboards.filter(l => l.trim());
    const filteredStdBoardsLobby2 = standardLeaderboardsLobby2.filter(l => l.trim());
    const filteredQ1 = qualifierLobby1.filter(l => l.trim());
    const filteredQ2 = qualifierLobby2.filter(l => l.trim());
    const filteredFinals = finalsLeaderboards.filter(l => l.trim());

    setIsSubmitting(true);
    const savingToastId = toast.loading(
      editingEvent ? "Saving event..." : "Creating event...",
    );

    try {
      if (editingEvent) {
        // Use new image if uploaded, otherwise keep current image
        const imageToUse = uploadedImageId || currentImageId || undefined;
        
        await updateEvent({
          eventId: editingEvent,
          name: name.trim(),
          type,
          mode,
          startDate,
          endDate,
          description: description.trim() || undefined,
          image: imageToUse,
          season: season.trim() || undefined,
          placementEarningsTopN: placementEarningsTopN,
          matchWinEarnings: matchWinEarnings ? true : undefined,
          duoPlacementEarningsTopN: (type === "random-trios" || type === "solos-meets-duos") ? duoPlacementEarningsTopN : undefined,
          soloPlacementEarningsTopN: type === "random-trios" ? soloPlacementEarningsTopN : undefined,
          standardLeaderboards: filteredStdBoards.length > 0 ? filteredStdBoards : undefined,
          twoLobbies: twoLobbies || undefined,
          standardLeaderboardsLobby2: twoLobbies && filteredStdBoardsLobby2.length > 0 ? filteredStdBoardsLobby2 : undefined,
          qualifierLobby1Leaderboards: filteredQ1.length > 0 ? filteredQ1 : undefined,
          qualifierLobby2Leaderboards: filteredQ2.length > 0 ? filteredQ2 : undefined,
          finalsLeaderboards: filteredFinals.length > 0 ? filteredFinals : undefined,
          dynamicPairDetection: dynamicPairDetection || undefined,
          excludeLowestScore: excludeLowestScore || undefined,
          isNoMoneyEvent: isNoMoneyEvent || undefined,
          smdTeamSize: type === "solos-meets-duos" ? smdTeamSize : undefined,
          bestNGames: type === "scrim-series" ? bestNGames : undefined,
          seriesDurationWeeks: type === "scrim-series" ? seriesDurationWeeks : undefined,
          showdownBestWeeks: type === "showdown" ? showdownBestWeeks : undefined,
          penaltyAmount: type === "showdown" ? penaltyAmount : undefined,
          linkedScrimSeriesId:
            type === "scrim-series"
              ? linkedScrimSeriesId === "none"
                ? null
                : linkedScrimSeriesId
              : null,
        });
        toast.success("Event saved successfully.", { id: savingToastId });
      } else {
        await createEvent({
          name: name.trim(),
          type,
          mode,
          startDate,
          endDate,
          description: description.trim() || undefined,
          image: uploadedImageId || undefined,
          season: season.trim() || undefined,
          placementEarningsTopN: placementEarningsTopN,
          matchWinEarnings: matchWinEarnings ? true : undefined,
          duoPlacementEarningsTopN: (type === "random-trios" || type === "solos-meets-duos") ? duoPlacementEarningsTopN : undefined,
          soloPlacementEarningsTopN: type === "random-trios" ? soloPlacementEarningsTopN : undefined,
          standardLeaderboards: filteredStdBoards.length > 0 ? filteredStdBoards : undefined,
          twoLobbies: twoLobbies || undefined,
          standardLeaderboardsLobby2: twoLobbies && filteredStdBoardsLobby2.length > 0 ? filteredStdBoardsLobby2 : undefined,
          qualifierLobby1Leaderboards: filteredQ1.length > 0 ? filteredQ1 : undefined,
          qualifierLobby2Leaderboards: filteredQ2.length > 0 ? filteredQ2 : undefined,
          finalsLeaderboards: filteredFinals.length > 0 ? filteredFinals : undefined,
          dynamicPairDetection: dynamicPairDetection || undefined,
          excludeLowestScore: excludeLowestScore || undefined,
          isNoMoneyEvent: isNoMoneyEvent || undefined,
          smdTeamSize: type === "solos-meets-duos" ? smdTeamSize : undefined,
          bestNGames: type === "scrim-series" ? bestNGames : undefined,
          seriesDurationWeeks: type === "scrim-series" ? seriesDurationWeeks : undefined,
          showdownBestWeeks: type === "showdown" ? showdownBestWeeks : undefined,
          penaltyAmount: type === "showdown" ? penaltyAmount : undefined,
          linkedScrimSeriesId:
            type === "scrim-series" && linkedScrimSeriesId !== "none"
              ? linkedScrimSeriesId
              : undefined,
        });
        toast.success("Event created successfully.", { id: savingToastId });
      }

      setIsCreateOpen(false);
      resetForm();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An unexpected error occurred";
      toast.error(`Event could not be saved because ${message}. Review the form and try again.`, {
        id: savingToastId,
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const openScrimSeriesAdmin = (
    seriesId: Id<"scrimSeries">,
    tab: "imports" | "penalties" | "leaderboard" = "imports",
  ) => {
    navigate(scrimSeriesAdminPath(seriesId, tab));
  };

  const handleCreateAndLinkSeries = async () => {
    if (!editingEvent) {
      toast.error("Save the calendar event first, then create & link a series.");
      return;
    }
    setIsCreatingSeriesLink(true);
    const linkingToastId = toast.loading("Creating and linking Scrim Series...");
    try {
      const seriesId = await createAndLinkSeries({
        eventId: editingEvent,
        bestN: bestNGames,
        seriesDurationWeeks,
      });
      toast.success("Scrim series created and linked. Open Scrim Series admin to import scores.", {
        id: linkingToastId,
      });
      setIsCreateOpen(false);
      setEditingEvent(null);
      resetForm();
      navigate(scrimSeriesAdminPath(seriesId, "imports"));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An unexpected error occurred";
      toast.error(`Scrim Series could not be linked because ${message}. Save the event first, then retry.`, {
        id: linkingToastId,
      });
    } finally {
      setIsCreatingSeriesLink(false);
    }
  };

  const handleMarkComplete = async (eventId: Id<"events">, eventName: string) => {
    setMarkingCompleteId(eventId);
    const loadingId = toast.loading(`Marking "${eventName}" complete...`);
    try {
      await setEventWorkflowStatus({ eventId, workflowStatus: "complete" });
      toast.success("Event marked complete.", { id: loadingId });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An unexpected error occurred";
      toast.error(`Event could not be marked complete because ${message}.`, {
        id: loadingId,
      });
    } finally {
      setMarkingCompleteId(null);
    }
  };

  const handleDelete = async (eventId: Id<"events">, eventName: string) => {
    if (!confirm(`Are you sure you want to delete "${eventName}"?`)) {
      return;
    }
    
    setDeletingEvent(eventId);
    const loadingId = toast.loading(`Deleting "${eventName}"...`);
    try {
      await deleteEvent({ eventId });
      toast.success("Event deleted successfully.", { id: loadingId });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An unexpected error occurred";
      toast.error(`Event could not be deleted because ${message}.`, { id: loadingId });
    } finally {
      setDeletingEvent(null);
    }
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "upcoming":
        return <Badge variant="secondary">Upcoming</Badge>;
      case "ongoing":
        return <Badge variant="default">Ongoing</Badge>;
      case "completed":
        return <Badge variant="outline">Completed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };
  
  const getTypeBadge = (type: string) => {
    switch (type) {
      case "scrim":
        return <Badge variant="secondary">Scrim</Badge>;
      case "minicup":
        return <Badge variant="default">Mini Cup</Badge>;
      case "season":
        return <Badge className="bg-purple-600">Season</Badge>;
      case "mini-season":
        return <Badge className="bg-indigo-600">Mini Season</Badge>;
      case "random":
        return <Badge className="bg-amber-600">Random</Badge>;
      case "random-squads":
        return <Badge className="bg-amber-600">Random Squads</Badge>;
      case "random-trios":
        return <Badge className="bg-amber-600">Random Trios</Badge>;
      case "solos-meets-duos":
        return <Badge className="bg-teal-600">Solos Meets Duos</Badge>;
      case "scrim-series":
        return <Badge className="bg-blue-600">Scrim Series</Badge>;
      case "showdown":
        return <Badge className="bg-red-600">Showdown</Badge>;
      default:
        return <Badge>{type}</Badge>;
    }
  };

  const getLeaderboardCount = (event: NonNullable<typeof events>[number]) => {
    return [
      event.standardLeaderboards,
      event.standardLeaderboardsLobby2,
      event.qualifierLobby1Leaderboards,
      event.qualifierLobby2Leaderboards,
      event.finalsLeaderboards,
      event.apiLeaderboards,
    ].reduce((total, list) => total + (list?.filter((url) => url.trim()).length || 0), 0);
  };

  const getWorkflowStatusBadge = (workflowStatus: EventWorkflowStatus | null | undefined) => {
    if (!workflowStatus) {
      return null;
    }
    return (
      <Badge
        variant={workflowStatusBadgeVariant(workflowStatus)}
        className="text-[10px] px-1.5 py-0"
      >
        {WORKFLOW_STATUS_LABELS[workflowStatus]}
      </Badge>
    );
  };

  const getReadinessBadges = (event: NonNullable<typeof events>[number]) => {
    const badges = [];
    const leaderboardCount = getLeaderboardCount(event);
    const setupReasons = (event.setupReasons ?? []) as SetupReasonCode[];

    if (setupReasons.length > 0) {
      badges.push(
        <div key="setup" className="space-y-0.5 max-w-[220px]">
          <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
            <AlertCircle className="mr-1 h-3 w-3" />
            Needs Setup
          </Badge>
          <p className="text-[10px] text-muted-foreground leading-snug">
            {formatSetupReasons(setupReasons)}
          </p>
        </div>,
      );
    } else if (event.isManualScoring) {
      badges.push(
        <Badge key="manual" variant="secondary" className="text-[10px] px-1.5 py-0">
          Manual scoring
        </Badge>,
      );
    }

    if (leaderboardCount > 0) {
      badges.push(
        <Badge key="leaderboards" variant="outline" className="text-[10px] px-1.5 py-0">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          {leaderboardCount} leaderboard{leaderboardCount === 1 ? "" : "s"}
        </Badge>,
      );
    }

    if (event.discordEventId) {
      badges.push(
        <Badge key="discord" variant="secondary" className="text-[10px] px-1.5 py-0">
          Discord
        </Badge>,
      );
    }

    return badges;
  };
  
  const renderEventTable = (filteredEvents: typeof events) => {
    if (!filteredEvents || filteredEvents.length === 0) {
      return (
        <p className="text-center text-muted-foreground py-8">
          No events in this category.
        </p>
      );
    }

    const totalCount = filteredEvents.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / DEFAULT_PAGE_SIZE));
    const safePage = Math.min(eventsTablePage, totalPages);
    const startIndex = (safePage - 1) * DEFAULT_PAGE_SIZE;
    const pageEvents = filteredEvents.slice(startIndex, startIndex + DEFAULT_PAGE_SIZE);
    const endIndex = Math.min(startIndex + DEFAULT_PAGE_SIZE, totalCount);
    
    return (
      <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead>Dates</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Leaderboards</TableHead>
              <TableHead>Readiness</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageEvents.map((event) => (
              <TableRow key={event._id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{event.name}</span>
                    {(event.placementEarningsTopN || event.matchWinEarnings || event.duoPlacementEarningsTopN || event.soloPlacementEarningsTopN) && (
                      <span title="Earnings tracking enabled">
                        <DollarSign className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                      </span>
                    )}
                  </div>
                </TableCell>
                <TableCell>{getTypeBadge(event.type)}</TableCell>
                <TableCell className="text-sm">{event.mode}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(new Date(event.startDate), "MMM d")} - {format(new Date(event.endDate), "MMM d, yyyy")}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1">
                    {getStatusBadge(event.status)}
                    {getWorkflowStatusBadge(event.workflowStatus)}
                  </div>
                </TableCell>
                <TableCell className="text-sm">
                  {event.standardLeaderboards && event.standardLeaderboards.length > 0 ? (
                    <span>{event.standardLeaderboards.length} Links</span>
                  ) : event.qualifierLobby1Leaderboards || event.qualifierLobby2Leaderboards || event.finalsLeaderboards ? (
                    <span>Mini Season</span>
                  ) : (
                    <span className="text-muted-foreground">No leaderboards</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {getReadinessBadges(event).length > 0 ? (
                      getReadinessBadges(event)
                    ) : (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        Basic details
                      </Badge>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" asChild title="Open imports">
                      <Link to="/admin/uploads">
                        <Upload className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <Button size="sm" variant="ghost" asChild title="Open event results">
                      <Link to="/admin/event-results">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    {event.type === "scrim-series" && event.linkedScrimSeriesId && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          openScrimSeriesAdmin(event.linkedScrimSeriesId!, "imports")
                        }
                        title="Scrim Series admin (imports, penalties, scores)"
                      >
                        <Trophy className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {event.needsAttention && event.workflowStatus !== "complete" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleMarkComplete(event._id, event.name)}
                        disabled={markingCompleteId === event._id}
                        title="Mark event complete"
                      >
                        {markingCompleteId === event._id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5 text-green-600" />
                        )}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openEditDialog(event)}
                      title="Edit event"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleDelete(event._id, event.name)}
                        disabled={deletingEvent === event._id}
                        title="Delete event"
                      >
                        {deletingEvent === event._id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        )}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <TablePagination
        page={safePage}
        totalPages={totalPages}
        totalCount={totalCount}
        startIndex={startIndex}
        endIndex={endIndex}
        onPageChange={setEventsTablePage}
        itemLabel="events"
      />
      </>
    );
  };

  const handleSyncDiscordEvents = async () => {
    setIsSyncingDiscord(true);
    const loadingId = toast.loading("Syncing Discord scheduled events...");
    try {
      const result = await syncDiscordEvents();
      if (result.imported > 0 || result.removed > 0) {
        toast.success(
          `Discord sync complete: ${result.imported} imported, ${result.updated} updated, ${result.skipped} skipped, ${result.removed} removed.`,
          { id: loadingId },
        );
      } else {
        toast.info("Discord sync complete: no new events to import.", { id: loadingId });
      }
      if (result.errors.length > 0) {
        toast.warning(
          `${result.errors.length} error(s) during sync. Review Events Manager for events that need setup.`,
        );
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "An unexpected error occurred";
      toast.error(`Discord sync failed because ${message}. Retry in a moment.`, {
        id: loadingId,
      });
    } finally {
      setIsSyncingDiscord(false);
    }
  };
  
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-4">
            <CardDescription>Create and manage events</CardDescription>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={handleSyncDiscordEvents} disabled={isSyncingDiscord}>
                {isSyncingDiscord ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                )}
                Sync Discord
              </Button>
              <Button size="sm" variant="secondary" onClick={() => setIsICSImportOpen(true)}>
                <FileDown className="mr-1.5 h-3.5 w-3.5" />
                Import ICS
              </Button>
              <Button size="sm" onClick={openCreateDialog}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Create Event
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-4">
          {!events ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : events.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No events yet. Create your first event above.
            </p>
          ) : (
            <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
              <TabsList className="w-full justify-start overflow-x-auto">
                <TabsTrigger value="all">
                  All ({events.length})
                </TabsTrigger>
                <TabsTrigger value="scrim">
                  Scrims ({events.filter(e => e.type === "scrim").length})
                </TabsTrigger>
                <TabsTrigger value="minicup">
                  Mini Cups ({events.filter(e => e.type === "minicup").length})
                </TabsTrigger>
                <TabsTrigger value="season">
                  Seasons ({events.filter(e => e.type === "season").length})
                </TabsTrigger>
                <TabsTrigger value="mini-season">
                  Mini Seasons ({events.filter(e => e.type === "mini-season").length})
                </TabsTrigger>
                <TabsTrigger value="random-squads">
                  Random Squads ({events.filter(e => e.type === "random-squads").length})
                </TabsTrigger>
                <TabsTrigger value="random-trios">
                  Random Trios ({events.filter(e => e.type === "random-trios").length})
                </TabsTrigger>
                <TabsTrigger value="solos-meets-duos">
                  Solos v Duos ({events.filter(e => e.type === "solos-meets-duos").length})
                </TabsTrigger>
                <TabsTrigger value="scrim-series">
                  Scrim Series ({events.filter(e => e.type === "scrim-series").length})
                </TabsTrigger>
                <TabsTrigger value="showdown">
                  Showdown ({events.filter(e => e.type === "showdown").length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="all" className="mt-4">
                {renderEventTable(events)}
              </TabsContent>
              
              <TabsContent value="scrim" className="mt-4">
                {renderEventTable(events.filter(e => e.type === "scrim"))}
              </TabsContent>
              
              <TabsContent value="minicup" className="mt-4">
                {renderEventTable(events.filter(e => e.type === "minicup"))}
              </TabsContent>
              
              <TabsContent value="season" className="mt-4">
                {renderEventTable(events.filter(e => e.type === "season"))}
              </TabsContent>
              
              <TabsContent value="mini-season" className="mt-4">
                {renderEventTable(events.filter(e => e.type === "mini-season"))}
              </TabsContent>
              
              <TabsContent value="random-squads" className="mt-4">
                {renderEventTable(events.filter(e => e.type === "random-squads"))}
              </TabsContent>
              
              <TabsContent value="random-trios" className="mt-4">
                {renderEventTable(events.filter(e => e.type === "random-trios"))}
              </TabsContent>
              
              <TabsContent value="solos-meets-duos" className="mt-4">
                {renderEventTable(events.filter(e => e.type === "solos-meets-duos"))}
              </TabsContent>

              <TabsContent value="scrim-series" className="mt-4">
                {renderEventTable(events.filter(e => e.type === "scrim-series"))}
              </TabsContent>

              <TabsContent value="showdown" className="mt-4">
                {renderEventTable(events.filter(e => e.type === "showdown"))}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isCreateOpen || !!editingEvent} onOpenChange={(open) => {
        if (!open) {
          setIsCreateOpen(false);
          setEditingEvent(null);
          resetForm();
        }
      }}>
        <DialogContent size="lg">
          <DialogHeader>
            <DialogTitle>{editingEvent ? "Edit Event" : "Create Event"}</DialogTitle>
            <DialogDescription>
              {editingEvent ? "Update event details" : "Create a new event with leaderboard links"}
            </DialogDescription>
          </DialogHeader>

          <DialogBody>
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Event Name *</Label>
                <Input
                  id="name"
                  placeholder="Winter Cup 2024"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="season">Season (Optional)</Label>
                <Input
                  id="season"
                  placeholder="Season 5"
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                />
              </div>
            </div>
            
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="type">Type *</Label>
                <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
                  <SelectTrigger id="type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scrim">Scrim</SelectItem>
                    <SelectItem value="minicup">Mini Cup</SelectItem>
                    <SelectItem value="season">Season</SelectItem>
                    <SelectItem value="mini-season">Mini Season</SelectItem>
                    <SelectItem value="random">Random (Legacy)</SelectItem>
                    <SelectItem value="random-squads">Random Squads</SelectItem>
                    <SelectItem value="random-trios">Random Trios</SelectItem>
                    <SelectItem value="solos-meets-duos">Solos Meets Duos/Trios</SelectItem>
                    <SelectItem value="scrim-series">Scrim Series</SelectItem>
                    <SelectItem value="showdown">Showdown</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Team size toggle for solos-meets-duos */}
              {type === "solos-meets-duos" && (
                <div className="space-y-2">
                  <Label>Team Size</Label>
                  <Select value={smdTeamSize} onValueChange={(v) => setSmdTeamSize(v as "duo" | "trio")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="duo">Duos (2 players)</SelectItem>
                      <SelectItem value="trio">Trios (3 players)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="mode">Game Mode *</Label>
                <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
                  <SelectTrigger id="mode">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ZB Main Map">ZB Main Map</SelectItem>
                    <SelectItem value="Reload">Reload</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="status">Status (Auto-computed)</Label>
                <Select value={status} disabled>
                  <SelectTrigger id="status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="upcoming">Upcoming</SelectItem>
                    <SelectItem value="ongoing">Ongoing</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Status is automatically computed based on start and end dates
                </p>
              </div>
            </div>
            
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date *</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="endDate">End Date *</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Event details..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>
            
            {/* Standard earnings for non-random-trios and non-solos-meets-duos events */}
            {type !== "random-trios" && type !== "solos-meets-duos" && (
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="placementEarningsTopN">Placement Earnings (Optional)</Label>
                  <Input
                    id="placementEarningsTopN"
                    type="number"
                    min="1"
                    max="50"
                    placeholder="e.g., 3 for Top 3 teams"
                    value={placementEarningsTopN || ""}
                    onChange={(e) => {
                      const val = e.target.value ? parseInt(e.target.value) : undefined;
                      setPlacementEarningsTopN(val);
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    {type === "scrim" || type === "minicup" 
                      ? "Number of top teams to track earnings for (e.g., 3 = Top 3 teams)" 
                      : "Number of top teams on cumulative leaderboard (e.g., 5 = Top 5 teams)"}
                  </p>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="matchWinEarnings">Match Win Earnings (Optional)</Label>
                  <Select 
                    value={matchWinEarnings ? "yes" : "no"} 
                    onValueChange={(v) => setMatchWinEarnings(v === "yes")}
                  >
                    <SelectTrigger id="matchWinEarnings">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">None</SelectItem>
                      <SelectItem value="yes">Game Winners</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Track earnings for winning individual games
                  </p>
                </div>
              </div>
            )}
            
            {/* Random Trios and Solos Meets Duos specific earnings */}
            {(type === "random-trios" || type === "solos-meets-duos") && (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="duoPlacementEarningsTopN">Duo Leaderboard Earnings</Label>
                    <Input
                      id="duoPlacementEarningsTopN"
                      type="number"
                      min="1"
                      max="50"
                      placeholder="e.g., 3 for Top 3 duos"
                      value={duoPlacementEarningsTopN || ""}
                      onChange={(e) => {
                        const val = e.target.value ? parseInt(e.target.value) : undefined;
                        setDuoPlacementEarningsTopN(val);
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      Top N duos on the duo cumulative leaderboard to award earnings
                    </p>
                  </div>
                  
                  {type === "random-trios" && (
                    <div className="space-y-2">
                      <Label htmlFor="soloPlacementEarningsTopN">Solo Leaderboard Earnings</Label>
                      <Input
                        id="soloPlacementEarningsTopN"
                        type="number"
                        min="1"
                        max="50"
                        placeholder="e.g., 3 for Top 3 solos"
                        value={soloPlacementEarningsTopN || ""}
                        onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value) : undefined;
                          setSoloPlacementEarningsTopN(val);
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        Top N solos on the solo cumulative leaderboard to award earnings
                      </p>
                    </div>
                  )}
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="matchWinEarningsRT">Match Win Earnings (Optional)</Label>
                  <Select 
                    value={matchWinEarnings ? "yes" : "no"} 
                    onValueChange={(v) => setMatchWinEarnings(v === "yes")}
                  >
                    <SelectTrigger id="matchWinEarningsRT">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">None</SelectItem>
                      <SelectItem value="yes">Game Winners</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Track earnings for winning individual games
                  </p>
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="isNoMoneyEvent"
                  checked={isNoMoneyEvent}
                  onCheckedChange={(checked) => setIsNoMoneyEvent(checked === true)}
                />
                <div className="grid gap-1.5 leading-none">
                  <Label
                    htmlFor="isNoMoneyEvent"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    No Money Event
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Exclude this event from internal player stats and population averages (Yunite imports still appear on the event page).
                  </p>
                </div>
              </div>
            </div>

            {/* Scrim Series / Showdown specific fields */}
            {(type === "scrim-series" || type === "showdown") && (
              <div className="space-y-4 border rounded-lg p-4 bg-muted/20">
                <h3 className="text-sm font-semibold">
                  {type === "scrim-series" ? "Scrim Series" : "Showdown"} Settings
                </h3>
                {type === "scrim-series" && (
                  <>
                  <div className="space-y-2">
                    <Label htmlFor="linkedScrimSeries">Linked Scrim Series (/scrim-series)</Label>
                    <Select
                      value={linkedScrimSeriesId === "none" ? "none" : linkedScrimSeriesId}
                      onValueChange={(v) =>
                        setLinkedScrimSeriesId(
                          v === "none" ? "none" : (v as Id<"scrimSeries">),
                        )
                      }
                    >
                      <SelectTrigger id="linkedScrimSeries">
                        <SelectValue placeholder="Select a scrim series" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (Yunite imports only)</SelectItem>
                        {scrimSeriesOptions?.map((series) => (
                          <SelectItem key={series._id} value={series._id}>
                            {series.name}
                            {series.isActive ? "" : " (inactive)"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      When linked, the public event page shows this series leaderboard and Yunite links from imported sessions.
                      Import Yunite data, edit penalties, and manage scores in{" "}
                      <Link to="/admin/scrim-series" className="underline">
                        Admin → Scrim Series
                      </Link>
                      {" "}(use the Trophy action on the event row after linking).
                    </p>
                    <div className="flex flex-wrap gap-2 pt-1">
                      {editingEvent && linkedScrimSeriesId === "none" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={handleCreateAndLinkSeries}
                          disabled={isCreatingSeriesLink}
                        >
                          {isCreatingSeriesLink ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Plus className="mr-1 h-3.5 w-3.5" />
                          )}
                          Create &amp; link new series
                        </Button>
                      )}
                      {editingEvent && linkedScrimSeriesId !== "none" && (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            openScrimSeriesAdmin(linkedScrimSeriesId, "imports");
                            setIsCreateOpen(false);
                            setEditingEvent(null);
                            resetForm();
                          }}
                        >
                          <Trophy className="mr-1 h-3.5 w-3.5" />
                          Open Scrim Series admin
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="bestNGames">Best N Games (Yunite fallback)</Label>
                      <Input
                        id="bestNGames"
                        type="number"
                        min="1"
                        max="50"
                        placeholder="e.g., 6 for best 6 games"
                        value={bestNGames || ""}
                        onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value) : undefined;
                          setBestNGames(val);
                        }}
                      />
                      <p className="text-xs text-muted-foreground">
                        Used only when no Scrim Series is linked above (Yunite import path).
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="seriesDurationWeeks">Series Duration (calendar)</Label>
                      <Select
                        value={seriesDurationWeeks.toString()}
                        onValueChange={(v) => setSeriesDurationWeeks(parseInt(v) as 3 | 6)}
                      >
                        <SelectTrigger id="seriesDurationWeeks">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="3">3 Weeks</SelectItem>
                          <SelectItem value="6">6 Weeks</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  </>
                )}
                {type === "showdown" && (
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="showdownBestWeeks">Best Weekly Totals</Label>
                      <Input
                        id="showdownBestWeeks"
                        type="number"
                        min={1}
                        max={8}
                        value={showdownBestWeeks}
                        onChange={(e) =>
                          setShowdownBestWeeks(
                            e.target.value ? parseInt(e.target.value, 10) : 2,
                          )
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Count each Yunite import as one week; sum the best N weekly totals (default 2 of 4).
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="penaltyAmount">Penalty Amount (pts)</Label>
                      <Input
                        id="penaltyAmount"
                        type="number"
                        min={0}
                        value={penaltyAmount}
                        onChange={(e) =>
                          setPenaltyAmount(
                            e.target.value ? parseInt(e.target.value, 10) : 5,
                          )
                        }
                      />
                      <p className="text-xs text-muted-foreground">
                        Default deduction per penalty; assign penalties after saving the event.
                      </p>
                    </div>
                  </div>
                )}

                {/* Showdown: Lock Tiers button */}
                {type === "showdown" && editingEvent && (
                  <div className="space-y-2 border-t pt-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label className="text-sm font-medium">Lock Player Tiers</Label>
                        <p className="text-xs text-muted-foreground">
                          Snapshot all player tiers for this Showdown. Players will be locked to their current tier for the duration.
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={async () => {
                          if (!confirm("Lock all player tiers for this Showdown? This will overwrite any previous tier lock.")) return;
                          setIsLockingTiers(true);
                          try {
                            const result = await lockTiers({ eventId: editingEvent });
                            toast.success(`Tiers locked for ${result.snapshotCount} players`);
                          } catch (error) {
                            toast.error(error instanceof Error ? error.message : "Failed to lock tiers");
                          } finally {
                            setIsLockingTiers(false);
                          }
                        }}
                        disabled={isLockingTiers}
                      >
                        {isLockingTiers ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Lock className="mr-2 h-4 w-4" />
                        )}
                        Lock Tiers
                      </Button>
                    </div>
                    <ShowdownPenaltiesPanel
                      eventId={editingEvent}
                      penaltyAmount={penaltyAmount}
                    />
                  </div>
                )}
              </div>
            )}
            
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="dynamicPairDetection"
                  checked={dynamicPairDetection}
                  onCheckedChange={(checked) => setDynamicPairDetection(checked === true)}
                />
                <div className="grid gap-1.5 leading-none">
                  <Label
                    htmlFor="dynamicPairDetection"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                  >
                    Manual Duo Selection (Legacy)
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    For "Random (Legacy)" events only. Use "Random Squads" or "Random Trios" types instead.
                  </p>
                </div>
              </div>
            </div>
            
            {(type === "random" || type === "random-squads" || type === "random-trios") && (
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="excludeLowestScore"
                    checked={excludeLowestScore}
                    onCheckedChange={(checked) => setExcludeLowestScore(checked === true)}
                  />
                  <div className="grid gap-1.5 leading-none">
                    <Label
                      htmlFor="excludeLowestScore"
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                    >
                      Count Only Best 3 Scores
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Only the top 3 scoring games will count towards the cumulative total (discounts the lowest scoring game if 4 games are played)
                    </p>
                  </div>
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="image">Event Image</Label>
              
              {/* Show current image if editing and no new image selected */}
              {editingEvent && currentImageUrl && !selectedImage && (
                <div className="flex items-center gap-3 p-3 border rounded-md bg-muted/20">
                  <img 
                    src={currentImageUrl} 
                    alt="Current event" 
                    className="h-20 w-20 object-contain rounded border"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Current Image</p>
                    <p className="text-xs text-muted-foreground">Upload a new image to replace</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setCurrentImageId(null);
                      setCurrentImageUrl(null);
                      toast.success("Image will be removed on save");
                    }}
                    title="Remove image"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
              
              <div className="flex items-center gap-2">
                <Input
                  ref={fileInputRef}
                  id="image"
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && handleImageSelect(e.target.files[0])}
                />
                {selectedImage && (
                  <Badge variant="secondary">
                    <Upload className="mr-1 h-3 w-3" />
                    Uploaded
                  </Badge>
                )}
              </div>
            </div>
            
            {type !== "mini-season" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Leaderboards (Optional)</Label>
                    <p className="text-sm text-muted-foreground">
                      Enter yunite.xyz/leaderboard/... links
                    </p>
                  </div>
                  {(type === "season" || type === "minicup") && (
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="twoLobbies"
                        checked={twoLobbies}
                        onCheckedChange={(checked) => setTwoLobbies(checked === true)}
                      />
                      <Label htmlFor="twoLobbies" className="text-sm font-normal cursor-pointer">
                        Two Lobbies
                      </Label>
                    </div>
                  )}
                </div>
                
                {twoLobbies ? (
                  <div className="space-y-4">
                    {standardLeaderboards.map((link, idx) => (
                      <div key={idx} className="space-y-2">
                        <Label className="text-xs text-muted-foreground">Week {idx + 1}</Label>
                        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2">
                          <div className="flex items-center gap-2">
                            <Input
                              placeholder={`Week ${idx + 1} - Lobby A`}
                              value={link}
                              onChange={(e) => {
                                const newBoards = [...standardLeaderboards];
                                newBoards[idx] = e.target.value;
                                setStandardLeaderboards(newBoards);
                              }}
                            />
                            {link && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  const newBoards = [...standardLeaderboards];
                                  newBoards[idx] = "";
                                  setStandardLeaderboards(newBoards);
                                }}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              placeholder={`Week ${idx + 1} - Lobby B`}
                              value={standardLeaderboardsLobby2[idx] || ""}
                              onChange={(e) => {
                                const newBoards = [...standardLeaderboardsLobby2];
                                newBoards[idx] = e.target.value;
                                setStandardLeaderboardsLobby2(newBoards);
                              }}
                            />
                            {standardLeaderboardsLobby2[idx] && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  const newBoards = [...standardLeaderboardsLobby2];
                                  newBoards[idx] = "";
                                  setStandardLeaderboardsLobby2(newBoards);
                                }}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                    {standardLeaderboards.length < MAX_LEADERBOARD_SLOTS && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="mt-1"
                        onClick={() => {
                          setStandardLeaderboards([...standardLeaderboards, ""]);
                          setStandardLeaderboardsLobby2([...standardLeaderboardsLobby2, ""]);
                        }}
                      >
                        + Add Week
                      </Button>
                    )}
                  </div>
                ) : (
                  standardLeaderboards.map((link, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        placeholder={`https://yunite.xyz/leaderboard/${idx === 0 ? "xxx-xxx-xxx" : "..."}`}
                        value={link}
                        onChange={(e) => {
                          const newBoards = [...standardLeaderboards];
                          newBoards[idx] = e.target.value;
                          setStandardLeaderboards(newBoards);
                        }}
                      />
                      {link && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const newBoards = [...standardLeaderboards];
                            newBoards[idx] = "";
                            setStandardLeaderboards(newBoards);
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))
                )}
                {standardLeaderboards.length < MAX_LEADERBOARD_SLOTS && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="mt-1"
                    onClick={() => setStandardLeaderboards([...standardLeaderboards, ""])}
                  >
                    + Add Week
                  </Button>
                )}
              </div>
            )}
            
            {type === "mini-season" && (
              <>
                <div className="space-y-3">
                  <Label>Qualifier Lobby 1 Leaderboards</Label>
                  <p className="text-sm text-muted-foreground">
                    Enter yunite.xyz/leaderboard/... links for Qualifier Lobby 1 (max 12)
                  </p>
                  {qualifierLobby1.map((link, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        placeholder={`https://yunite.xyz/leaderboard/${idx === 0 ? "xxx-xxx-xxx" : "..."}`}
                        value={link}
                        onChange={(e) => {
                          const newBoards = [...qualifierLobby1];
                          newBoards[idx] = e.target.value;
                          setQualifierLobby1(newBoards);
                        }}
                      />
                      {link && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const newBoards = [...qualifierLobby1];
                            newBoards[idx] = "";
                            setQualifierLobby1(newBoards);
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {qualifierLobby1.length < MAX_LEADERBOARD_SLOTS && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setQualifierLobby1([...qualifierLobby1, ""])}
                    >
                      + Add Slot
                    </Button>
                  )}
                </div>
                
                <div className="space-y-3">
                  <Label>Qualifier Lobby 2 Leaderboards</Label>
                  <p className="text-sm text-muted-foreground">
                    Enter yunite.xyz/leaderboard/... links for Qualifier Lobby 2 (max 12)
                  </p>
                  {qualifierLobby2.map((link, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        placeholder={`https://yunite.xyz/leaderboard/${idx === 0 ? "xxx-xxx-xxx" : "..."}`}
                        value={link}
                        onChange={(e) => {
                          const newBoards = [...qualifierLobby2];
                          newBoards[idx] = e.target.value;
                          setQualifierLobby2(newBoards);
                        }}
                      />
                      {link && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const newBoards = [...qualifierLobby2];
                            newBoards[idx] = "";
                            setQualifierLobby2(newBoards);
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {qualifierLobby2.length < MAX_LEADERBOARD_SLOTS && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setQualifierLobby2([...qualifierLobby2, ""])}
                    >
                      + Add Slot
                    </Button>
                  )}
                </div>
                
                <div className="space-y-3">
                  <Label>Finals Leaderboards</Label>
                  <p className="text-sm text-muted-foreground">
                    Enter yunite.xyz/leaderboard/... links for Finals (max 12)
                  </p>
                  {finalsLeaderboards.map((link, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        placeholder={`https://yunite.xyz/leaderboard/${idx === 0 ? "xxx-xxx-xxx" : "..."}`}
                        value={link}
                        onChange={(e) => {
                          const newBoards = [...finalsLeaderboards];
                          newBoards[idx] = e.target.value;
                          setFinalsLeaderboards(newBoards);
                        }}
                      />
                      {link && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            const newBoards = [...finalsLeaderboards];
                            newBoards[idx] = "";
                            setFinalsLeaderboards(newBoards);
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                  {finalsLeaderboards.length < MAX_LEADERBOARD_SLOTS && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setFinalsLeaderboards([...finalsLeaderboards, ""])}
                    >
                      + Add Slot
                    </Button>
                  )}
                </div>
              </>
            )}
          </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsCreateOpen(false);
              setEditingEvent(null);
              resetForm();
            }} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                editingEvent ? "Save Changes" : "Create Event"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ICS Import Dialog */}
      <ICSImportDialog
        open={isICSImportOpen}
        onOpenChange={setIsICSImportOpen}
        onSuccess={() => {
          // Refresh events list (the useQuery will automatically update)
        }}
      />
    </div>
  );
}
