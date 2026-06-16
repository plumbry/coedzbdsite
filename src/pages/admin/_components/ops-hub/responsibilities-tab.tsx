import { useMemo, useState, useEffect, useRef } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api.js";
import type { Doc, Id } from "@/convex/_generated/dataModel.js";
import { opsMutationArgs, opsQueryArgs, type OpsHubTabProps } from "./types.ts";
import { Button } from "@/components/ui/button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.tsx";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.tsx";
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion.tsx";
import { Plus, Pencil, Trash2, X, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils.ts";
import {
  collectUsedResponsibilityColors,
  pickUniqueResponsibilityColor,
} from "@/lib/responsibility-colors.ts";

type ResponsibilityRole = "main" | "backup";
type TeamRole = "admin" | "mod" | "event_mod";
type ResponsibilityTag = { label: string; color: string; role: ResponsibilityRole };

const TEAM_ROLE_OPTIONS: { value: TeamRole; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "mod", label: "Mod" },
  { value: "event_mod", label: "Event Mod" },
];

function teamRoleLabel(role: TeamRole) {
  return TEAM_ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;
}

function normalizeTag(tag: {
  label: string;
  color: string;
  role?: ResponsibilityRole;
}): ResponsibilityTag {
  return { ...tag, role: tag.role ?? "main" };
}

function ResponsibilityBadge({
  tag,
  onRemove,
  compact = false,
}: {
  tag: ResponsibilityTag;
  onRemove?: () => void;
  compact?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border font-medium",
        compact ? "px-1.5 py-0 text-[11px] leading-4" : "gap-1 px-2.5 py-0.5 text-xs",
      )}
      style={{
        borderColor: tag.color,
        backgroundColor: `${tag.color}18`,
        color: tag.color,
      }}
    >
      {tag.label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full hover:opacity-70 cursor-pointer"
          aria-label={`Remove ${tag.label}`}
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

function ResponsibilityGroup({
  title,
  tags,
  canEdit,
  onRemove,
  compact = false,
}: {
  title: string;
  tags: ResponsibilityTag[];
  canEdit?: boolean;
  onRemove?: (tag: ResponsibilityTag) => void;
  compact?: boolean;
}) {
  if (compact && tags.length === 0) return null;

  if (compact) {
    return (
      <div className="min-w-0">
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide mb-0.5">
          {title}
        </p>
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <ResponsibilityBadge
              key={`${tag.role}-${tag.label}`}
              tag={tag}
              compact
              onRemove={canEdit && onRemove ? () => onRemove(tag) : undefined}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {title}
      </p>
      {tags.length === 0 ? (
        <p className="text-xs text-muted-foreground">None</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <ResponsibilityBadge
              key={`${tag.role}-${tag.label}`}
              tag={tag}
              onRemove={canEdit && onRemove ? () => onRemove(tag) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ResponsibilityRoleToggle({
  value,
  onChange,
}: {
  value: ResponsibilityRole;
  onChange: (role: ResponsibilityRole) => void;
}) {
  return (
    <div className="inline-flex rounded-md border p-0.5">
      <button
        type="button"
        className={cn(
          "px-3 py-1 text-xs rounded-sm cursor-pointer transition-colors",
          value === "main"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        onClick={() => onChange("main")}
      >
        Main
      </button>
      <button
        type="button"
        className={cn(
          "px-3 py-1 text-xs rounded-sm cursor-pointer transition-colors",
          value === "backup"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        onClick={() => onChange("backup")}
      >
        Back Up
      </button>
    </div>
  );
}

type StaffProfile = Doc<"opsHubStaffProfiles"> & { teamRole: TeamRole };

function StaffProfileCard({
  profile,
  canEdit,
  onEdit,
  onDelete,
}: {
  profile: StaffProfile;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const profileTags = profile.responsibilities.map(normalizeTag);
  const mainTags = profileTags.filter((t) => t.role === "main");
  const backupTags = profileTags.filter((t) => t.role === "backup");

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2 px-3 py-2">
        <CardTitle className="text-sm font-semibold leading-tight">{profile.person}</CardTitle>
        {canEdit && (
          <div className="flex shrink-0 -mr-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 cursor-pointer"
              onClick={onEdit}
            >
              <Pencil className="h-3 w-3" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-destructive cursor-pointer"
              onClick={onDelete}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="px-3 pb-2.5 pt-0">
        {mainTags.length === 0 && backupTags.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No responsibilities</p>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            <ResponsibilityGroup title="Main" tags={mainTags} compact />
            <ResponsibilityGroup title="Back Up" tags={backupTags} compact />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ResponsibilitiesTab({ viewerToken, canEdit = false }: OpsHubTabProps) {
  const profiles = useQuery(api.opsHub.queries.listStaffProfiles, opsQueryArgs(viewerToken));
  const catalog = useQuery(
    api.opsHub.queries.listResponsibilityCatalog,
    opsQueryArgs(viewerToken),
  );
  const createProfile = useMutation(api.opsHub.mutations.createStaffProfile);
  const updateProfile = useMutation(api.opsHub.mutations.updateStaffProfile);
  const removeProfile = useMutation(api.opsHub.mutations.deleteStaffProfile);
  const repairColors = useMutation(api.opsHub.mutations.repairResponsibilityColors);
  const repairedColors = useRef(false);

  useEffect(() => {
    if (!canEdit || repairedColors.current) return;
    repairedColors.current = true;
    repairColors(opsMutationArgs(viewerToken, {})).catch(() => {
      repairedColors.current = false;
    });
  }, [canEdit, viewerToken, repairColors]);

  const [search, setSearch] = useState("");
  const [openSections, setOpenSections] = useState<TeamRole[]>([
    "admin",
    "mod",
    "event_mod",
  ]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Doc<"opsHubStaffProfiles"> | null>(null);
  const [person, setPerson] = useState("");
  const [teamRole, setTeamRole] = useState<TeamRole>("mod");
  const [tags, setTags] = useState<ResponsibilityTag[]>([]);
  const [draftLabel, setDraftLabel] = useState("");
  const [draftRole, setDraftRole] = useState<ResponsibilityRole>("main");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Doc<"opsHubStaffProfiles"> | null>(
    null,
  );

  const catalogColorByLabel = useMemo(() => {
    const map = new Map<string, string>();
    catalog?.forEach((entry) => map.set(entry.label.toLowerCase(), entry.color));
    return map;
  }, [catalog]);

  const mainTags = useMemo(
    () => tags.filter((t) => t.role === "main"),
    [tags],
  );
  const backupTags = useMemo(
    () => tags.filter((t) => t.role === "backup"),
    [tags],
  );

  const filteredProfiles = useMemo(() => {
    if (!profiles) return undefined;
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter(
      (p) =>
        p.person.toLowerCase().includes(q) ||
        teamRoleLabel(p.teamRole ?? "mod").toLowerCase().includes(q) ||
        p.responsibilities.some((r) => r.label.toLowerCase().includes(q)),
    );
  }, [profiles, search]);

  const profilesByRole = useMemo(() => {
    const grouped: Record<TeamRole, StaffProfile[]> = {
      admin: [],
      mod: [],
      event_mod: [],
    };
    if (!filteredProfiles) return grouped;
    for (const profile of filteredProfiles) {
      const role = profile.teamRole ?? "mod";
      grouped[role].push(profile as StaffProfile);
    }
    for (const role of TEAM_ROLE_OPTIONS) {
      grouped[role.value].sort((a, b) => a.person.localeCompare(b.person));
    }
    return grouped;
  }, [filteredProfiles]);

  useEffect(() => {
    const q = search.trim();
    if (!q) return;
    setOpenSections(
      TEAM_ROLE_OPTIONS.map((section) => section.value).filter(
        (role) => profilesByRole[role].length > 0,
      ),
    );
  }, [search, profilesByRole]);

  const suggestions = useMemo(() => {
    if (!catalog) return [];
    const q = draftLabel.trim().toLowerCase();
    const assigned = new Set(tags.map((t) => t.label.toLowerCase()));
    return catalog
      .filter((c) => !assigned.has(c.label.toLowerCase()))
      .filter((c) => !q || c.label.toLowerCase().includes(q))
      .slice(0, 8);
  }, [catalog, draftLabel, tags]);

  const openCreate = () => {
    setEditing(null);
    setPerson("");
    setTeamRole("mod");
    setTags([]);
    setDraftLabel("");
    setDraftRole("main");
    setDialogOpen(true);
  };

  const openEdit = (profile: Doc<"opsHubStaffProfiles">) => {
    setEditing(profile);
    setPerson(profile.person);
    setTeamRole(profile.teamRole ?? "mod");
    setTags(profile.responsibilities.map(normalizeTag));
    setDraftLabel("");
    setDraftRole("main");
    setDialogOpen(true);
  };

  const removeTag = (tag: ResponsibilityTag) => {
    setTags((prev) =>
      prev.filter((t) => t.label.toLowerCase() !== tag.label.toLowerCase()),
    );
  };

  const addTag = (label: string, role: ResponsibilityRole = draftRole) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (tags.some((t) => t.label.toLowerCase() === key)) {
      setDraftLabel("");
      return;
    }
    const existingColor = catalogColorByLabel.get(key);
    const color =
      existingColor ??
      pickUniqueResponsibilityColor(
        collectUsedResponsibilityColors(catalog, tags),
        trimmed,
      );
    setTags((prev) => [...prev, { label: trimmed, color, role }]);
    setDraftLabel("");
  };

  const handleSave = async () => {
    if (!person.trim()) {
      toast.error("Person name is required");
      return;
    }
    setSaving(true);
    try {
      const responsibilities = tags.map((t) => ({
        label: t.label,
        role: t.role,
      }));
      if (editing) {
        await updateProfile(
          opsMutationArgs(viewerToken, {
            id: editing._id,
            person: person.trim(),
            teamRole,
            responsibilities,
          }),
        );
        toast.success("Profile updated");
      } else {
        await createProfile(
          opsMutationArgs(viewerToken, {
            person: person.trim(),
            teamRole,
            responsibilities,
          }),
        );
        toast.success("Profile created");
      }
      setDialogOpen(false);
    } catch {
      toast.error("Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!deleteTarget) return;
    try {
      await removeProfile(
        opsMutationArgs(viewerToken, {
          id: deleteTarget._id as Id<"opsHubStaffProfiles">,
        }),
      );
      toast.success("Profile deleted");
    } catch {
      toast.error("Failed to delete");
    } finally {
      setDeleteTarget(null);
    }
  };

  if (profiles === undefined) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold">Staff Profiles</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ops reference only — team roles and responsibilities are not tied to site login
            permissions.
          </p>
        </div>
        {canEdit && (
          <Button size="sm" className="cursor-pointer shrink-0" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" />
            Add profile
          </Button>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search people or responsibilities…"
          className="h-9 pl-8 text-sm"
        />
      </div>

      {filteredProfiles?.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center border rounded-md">
          {search ? "No matches." : "No profiles yet."}
        </p>
      ) : (
        <Accordion
          type="multiple"
          value={openSections}
          onValueChange={(value) => setOpenSections(value as TeamRole[])}
          className="space-y-2"
        >
          {TEAM_ROLE_OPTIONS.map((section) => {
            const sectionProfiles = profilesByRole[section.value];
            if (search.trim() && sectionProfiles.length === 0) return null;

            return (
              <AccordionItem
                key={section.value}
                value={section.value}
                className="rounded-lg border bg-card px-3 last:border-b"
              >
                <AccordionTrigger className="hover:no-underline py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{section.label}</span>
                    <Badge variant="secondary" className="text-xs font-normal">
                      {sectionProfiles.length}
                    </Badge>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-3">
                  {sectionProfiles.length === 0 ? (
                    <p className="text-xs text-muted-foreground py-1">No profiles yet.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
                      {sectionProfiles.map((profile) => (
                        <StaffProfileCard
                          key={profile._id}
                          profile={profile}
                          canEdit={canEdit}
                          onEdit={() => openEdit(profile)}
                          onDelete={() => setDeleteTarget(profile)}
                        />
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit profile" : "Add profile"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="staff-profile-person">Person</Label>
              <Input
                id="staff-profile-person"
                value={person}
                onChange={(e) => setPerson(e.target.value)}
                placeholder="Name"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="staff-profile-team-role">Role</Label>
              <Select
                value={teamRole}
                onValueChange={(v) => setTeamRole(v as TeamRole)}
                disabled={!canEdit}
              >
                <SelectTrigger id="staff-profile-team-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEAM_ROLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                For ops planning only. Does not change website account permissions.
              </p>
            </div>

            <div className="space-y-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Label>Responsibilities</Label>
                {canEdit && (
                  <ResponsibilityRoleToggle value={draftRole} onChange={setDraftRole} />
                )}
              </div>

              {canEdit && (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <Input
                      value={draftLabel}
                      onChange={(e) => setDraftLabel(e.target.value)}
                      placeholder="Type new or pick below…"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addTag(draftLabel);
                        }
                      }}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      className="cursor-pointer shrink-0"
                      onClick={() => addTag(draftLabel)}
                      disabled={!draftLabel.trim()}
                    >
                      Add
                    </Button>
                  </div>
                  {suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.map((s) => (
                        <button
                          key={s._id}
                          type="button"
                          className="cursor-pointer"
                          onClick={() => addTag(s.label)}
                        >
                          <ResponsibilityBadge
                            tag={{ label: s.label, color: s.color, role: draftRole }}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <ResponsibilityGroup
                title="Main"
                tags={mainTags}
                canEdit={canEdit}
                onRemove={removeTag}
              />
              <ResponsibilityGroup
                title="Back Up"
                tags={backupTags}
                canEdit={canEdit}
                onRemove={removeTag}
              />
            </div>
          </div>
          {canEdit && (
            <DialogFooter>
              <Button
                variant="outline"
                className="cursor-pointer"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button className="cursor-pointer" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete profile?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {deleteTarget?.person} and all their assigned responsibilities.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cursor-pointer">Cancel</AlertDialogCancel>
            <AlertDialogAction className="cursor-pointer" onClick={handleDeleteProfile}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
